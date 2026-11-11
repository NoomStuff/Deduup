import assert from "node:assert/strict";
import test from "node:test";
import { mock } from "bun:test";

// The shared updater core imports Electron. These checks only need its pure functions.
mock.module("electron", () => ({ app: { isPackaged: false }, net: {} }));
const { fetchAvailableUpdate, isNewerVersion } = await import("../src/main/update-manager.ts");

const releaseResponse = (release) => new Response(JSON.stringify(release), { status: 200 });

test("version comparison follows semver precedence", () => {
   assert.equal(isNewerVersion("0.1.1", "0.1.0"), true);
   assert.equal(isNewerVersion("0.2.0", "0.1.9"), true);
   assert.equal(isNewerVersion("1.0.0", "0.9.9"), true);
   assert.equal(isNewerVersion("0.1.0", "0.1.0"), false);
   assert.equal(isNewerVersion("0.1.0", "0.1.1"), false);
   assert.equal(isNewerVersion("0.1", "0.1.0"), false);
   assert.equal(isNewerVersion("", "0.1.0"), false);

   // Prereleases order per semver; numeric identifiers never compare as strings.
   assert.equal(isNewerVersion("0.2.0", "0.2.0-rc.1"), true);
   assert.equal(isNewerVersion("0.2.0-rc.1", "0.2.0"), false);
   assert.equal(isNewerVersion("0.2.0-rc.2", "0.2.0-rc.1"), true);
   assert.equal(isNewerVersion("0.2.0-rc.10", "0.2.0-rc.9"), true);
   assert.equal(isNewerVersion("0.2.0-beta", "0.2.0-alpha"), true);
   assert.equal(isNewerVersion("0.2.0-rc.1", "0.2.0-beta"), true);
   assert.equal(isNewerVersion("0.2.0-2", "0.2.0-10"), false);
   assert.equal(isNewerVersion("0.2.0-rc.1", "0.2.0-1"), true);
   // A v prefix and build metadata do not count.
   assert.equal(isNewerVersion("v0.2.0", "0.1.0"), true);
   assert.equal(isNewerVersion("0.2.0", "v0.2.0"), false);
   assert.equal(isNewerVersion("0.2.0+build.5", "0.2.0"), false);
   assert.equal(isNewerVersion("0.2.0", "0.2.0+build.5"), false);
});

test("fetchAvailableUpdate maps a newer release and strips the tag prefix", async () => {
   const update = await fetchAvailableUpdate("0.1.0", () =>
      Promise.resolve(
         releaseResponse({
            tag_name: "v0.2.0",
            name: "Deduup 0.2.0",
            html_url: "https://github.com/NoomStuff/Deduup/releases/tag/v0.2.0",
            draft: false,
            prerelease: false,
         })
      )
   );
   assert.deepEqual(update, {
      version: "0.2.0",
      name: "Deduup 0.2.0",
      url: "https://github.com/NoomStuff/Deduup/releases/tag/v0.2.0",
      mode: "releases",
   });
});

test("fetchAvailableUpdate falls back to a generated release name", async () => {
   const update = await fetchAvailableUpdate("0.1.0", () =>
      Promise.resolve(
         releaseResponse({
            tag_name: "v0.2.0",
            name: null,
            html_url: "https://github.com/NoomStuff/Deduup/releases/tag/v0.2.0",
            draft: false,
            prerelease: false,
         })
      )
   );
   assert.equal(update?.name, "Deduup 0.2.0");
});

test("fetchAvailableUpdate ignores drafts, prereleases, and older versions", async () => {
   const base = { name: "n", html_url: "https://github.com/NoomStuff/Deduup/releases/tag/v0.2.0", draft: false, prerelease: false };
   const request = (release) => () => Promise.resolve(releaseResponse({ tag_name: "v0.2.0", ...release }));
   assert.equal(await fetchAvailableUpdate("0.1.0", request({ ...base, draft: true })), null);
   assert.equal(await fetchAvailableUpdate("0.1.0", request({ ...base, prerelease: true })), null);
   assert.equal(await fetchAvailableUpdate("0.9.0", request(base)), null);
});

test("fetchAvailableUpdate rejects failed requests and malformed payloads", async () => {
   await assert.rejects(() => fetchAvailableUpdate("0.1.0", () => Promise.resolve(new Response("nope", { status: 500 }))));
   await assert.rejects(() =>
      fetchAvailableUpdate("0.1.0", () =>
         Promise.resolve(releaseResponse({ tag_name: 42, name: null, html_url: "https://x", draft: false, prerelease: false }))
      )
   );
   await assert.rejects(() =>
      fetchAvailableUpdate("0.1.0", () => Promise.resolve(releaseResponse({ tag_name: "v0.2.0", html_url: "https://x", draft: false, prerelease: false })))
   );
});

test("release checks have a timeout and reject links outside this project's releases", async () => {
   const release = { tag_name: "v0.2.0", name: null, draft: false, prerelease: false };
   for (const html_url of [
      "not a URL",
      "http://github.com/NoomStuff/Deduup/releases/latest",
      "https://example.com/releases",
      "https://github.com/NoomStuff/Other/releases/latest",
   ]) {
      await assert.rejects(() =>
         fetchAvailableUpdate("0.1.0", async (_url, init) => {
            assert.ok(init.signal instanceof AbortSignal);
            return releaseResponse({ ...release, html_url });
         })
      );
   }
});
