import assert from "node:assert/strict";
import test from "node:test";
import { fetchAvailableUpdate, isNewerVersion } from "../src/main/updateCheck.ts";

const releaseResponse = (release) => new Response(JSON.stringify(release), { status: 200 });

test("version comparison orders semver levels and prereleases", () => {
   assert.equal(isNewerVersion("0.1.1", "0.1.0"), true);
   assert.equal(isNewerVersion("0.2.0", "0.1.9"), true);
   assert.equal(isNewerVersion("1.0.0", "0.9.9"), true);
   assert.equal(isNewerVersion("0.1.0", "0.1.0"), false);
   assert.equal(isNewerVersion("0.1.0", "0.1.1"), false);
   assert.equal(isNewerVersion("0.1", "0.1.0"), false);
   assert.equal(isNewerVersion("", "0.1.0"), false);
});

test("version comparison handles prerelease ordering per semver", () => {
   assert.equal(isNewerVersion("0.2.0", "0.2.0-rc.1"), true);
   assert.equal(isNewerVersion("0.2.0-rc.1", "0.2.0"), false);
   assert.equal(isNewerVersion("0.2.0-rc.2", "0.2.0-rc.1"), true);
   assert.equal(isNewerVersion("0.2.0-rc.10", "0.2.0-rc.9"), true);
   assert.equal(isNewerVersion("0.2.0-beta", "0.2.0-alpha"), true);
   assert.equal(isNewerVersion("0.2.0-rc.1", "0.2.0-beta"), true);
   // Numeric identifiers never compare as strings: 9 < 10.
   assert.equal(isNewerVersion("0.2.0-2", "0.2.0-10"), false);
   assert.equal(isNewerVersion("0.2.0-rc.1", "0.2.0-1"), true);
});

test("version comparison ignores a v prefix and build metadata", () => {
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
