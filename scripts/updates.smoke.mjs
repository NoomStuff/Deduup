import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { _electron: electron } = require("playwright-core");
const root = path.resolve(import.meta.dirname, "..");
const artifacts = path.join(root, ".cache", "update-smoke");
await mkdir(artifacts, { recursive: true });
const profile = await mkdtemp(path.join(artifacts, "profile-"));
const runtime = path.resolve(profile, "runtime");
if (!runtime.startsWith(`${path.resolve(artifacts)}${path.sep}`)) throw new Error("Fixture runtime must stay in the test artifacts directory.");
const downloads = path.join(profile, "Downloads");
await mkdir(downloads);
const payload = "Verified fixture bytes, never executed.";
const digest = createHash("sha256").update(payload).digest("hex");
// Load production main/preload/renderer code. Stub only network, shell, and the
// installer boundary before startup, so this suite never contacts real releases.
const bootstrap = path.join(profile, "bootstrap.mjs");
await writeFile(
   bootstrap,
   `
import { app, net, shell } from "electron";
app.setAppPath(${JSON.stringify(root)});
app.getVersion = () => "0.1.5";
const state = globalThis.updateFixture = { version: "0.1.5", checks: 0, payloads: 0, failCheck: false, damaged: true, installs: 0 };
shell.openExternal = async url => { state.opened = url; };
shell.showItemInFolder = file => { state.revealed = file; };
const getPath = app.getPath.bind(app);
app.getPath = name => name === "downloads" ? ${JSON.stringify(downloads)} : getPath(name);
net.fetch = async input => {
   const url = String(input);
   if (url.endsWith("/latest")) {
      state.checks++;
      if (state.failCheck) throw new Error("Offline fixture");
      return Response.json({ tag_name: "v" + state.version, name: "Fixture release", html_url: "https://github.com/NoomStuff/Deduup/releases/tag/v" + state.version, draft: false, prerelease: false });
   }
   if (url.includes("/tags/")) return Response.json({ assets: [{ name: "Deduup-" + state.version + "-win-" + process.arch + ".exe", browser_download_url: "https://example.invalid/payload", digest: "sha256:${digest}" }] });
   state.payloads++;
   if (state.damaged) return new Response("Damaged bytes");
   const bytes = new TextEncoder().encode(${JSON.stringify(payload)});
   return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(bytes.slice(0, 10));
      state.finish = () => { controller.enqueue(bytes.slice(10)); controller.close(); };
   }}), { headers: { "content-length": String(bytes.length) } });
};
await import(${JSON.stringify(pathToFileURL(path.join(root, "build/electron/main/main.js")).href)});
`
);

let app = await electron.launch({
   executablePath: require("electron"),
   cwd: root,
   args: [bootstrap, `--user-data-dir=${profile}`],
   env: { ...process.env, IMAGE_DEDUPLICATOR_PROD: "1" },
});
let page = await app.firstWindow({ timeout: 15000 });
page.setDefaultTimeout(15000);
const state = () => page.evaluate(() => window.imageDeduplicator.getUpdateState());
const waitUntil = async (predicate) => {
   const deadline = Date.now() + 15000;
   while (Date.now() < deadline) {
      if (await predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
   }
   throw new Error(`Update state did not settle: ${JSON.stringify(await state())}`);
};
const waitPhase = async (phase) => waitUntil(async () => (await state()).status?.phase === phase);
const settings = async () => {
   await page.getByRole("button", { name: "Help", exact: true }).click();
   await page.getByRole("menuitem", { name: /settings/i }).click();
   await page.getByRole("tab", { name: "App & updates", exact: true }).click();
};
const check = async () => {
   await page.getByRole("button", { name: "Check for updates", exact: true }).click();
   await waitUntil(async () => !(await state()).checking);
};
try {
   await waitUntil(async () => (await state()).lastChecked !== null);
   assert.equal(await app.evaluate(() => globalThis.updateFixture.checks), 1);
   await page.reload();
   await page.waitForFunction(() => Boolean(window.imageDeduplicator && document.querySelector(".app")));
   await settings();
   assert.equal(await app.evaluate(() => globalThis.updateFixture.checks), 1, "reload must not repeat the launch check");
   const startup = page.getByRole("button", { name: "Check for updates at startup", exact: true });
   await startup.click();
   assert.equal(await startup.getAttribute("aria-pressed"), "false");
   await check();
   assert.equal((await state()).message, "You're up to date");
   await app.evaluate(() => {
      globalThis.updateFixture.failCheck = true;
   });
   await check();
   assert.match(await page.locator(".updateSettings").innerText(), /Couldn't check for updates/);
   await app.evaluate(() => {
      globalThis.updateFixture.failCheck = false;
      globalThis.updateFixture.version = "99.0.0";
   });
   await check();
   assert.equal((await state()).update.mode, "releases", "development builds only link to releases");
   const chip = () => page.locator(".updateChip__trigger");
   const act = async () => {
      if (await page.locator(".settingsPanel").count())
         await page
            .locator(".updateSettings")
            .getByRole("button", { name: await chip().getAttribute("aria-label"), exact: true })
            .click();
      else await chip().click();
   };
   await act();
   assert.match(await app.evaluate(() => globalThis.updateFixture.opened), /Deduup\/releases\/tag\/v99.0.0$/);
   await assert.rejects(page.evaluate(() => window.imageDeduplicator.restartToUpdate()));
   assert.equal(app.windows().length, 1, "a premature restart must leave the app open");
   await page.reload();
   await settings();
   assert.equal(await page.getByRole("button", { name: "Check for updates at startup", exact: true }).getAttribute("aria-pressed"), "false");
   assert.equal((await state()).update.version, "99.0.0");

   if (process.platform === "win32") {
      // Start an actual packaged Electron runtime. Electron's defaultApp flag
      // is read-only, so changing flags in a source launch cannot test this mode.
      await app.close();
      await cp(path.dirname(require("electron")), runtime, { recursive: true });
      const executable = path.join(runtime, "Deduup-update-fixture.exe");
      await rename(path.join(runtime, "electron.exe"), executable);
      await mkdir(path.join(runtime, "resources", "app"), { recursive: true });
      await writeFile(
         path.join(runtime, "resources", "app", "package.json"),
         JSON.stringify({ name: "deduup-update-fixture", version: "0.1.5", main: "bootstrap.mjs" })
      );
      await writeFile(path.join(runtime, "resources", "app", "bootstrap.mjs"), await readFile(bootstrap, "utf8"));
      app = await electron.launch({
         executablePath: executable,
         args: [`--user-data-dir=${profile}`],
         env: { ...process.env, IMAGE_DEDUPLICATOR_PROD: "1", PORTABLE_EXECUTABLE_FILE: "fixture.exe" },
      });
      page = await app.firstWindow({ timeout: 15000 });
      page.setDefaultTimeout(15000);
      await settings();
      await app.evaluate(() => {
         globalThis.updateFixture.version = "99.0.0";
      });
      const name = `Deduup-99.0.0-win-${process.arch}.exe`;
      await writeFile(path.join(downloads, name), "Preserve this existing file");
      await check();
      await act();
      await waitPhase("error");
      assert.equal(await chip().getAttribute("aria-label"), "Retry download");
      assert.match((await state()).status.message, /verification/);
      assert.equal((await readdir(downloads)).filter((name) => name.endsWith(".part")).length, 0);
      await app.evaluate(() => {
         globalThis.updateFixture.damaged = false;
      });
      await act();
      await waitUntil(async () => (await state()).status?.percent > 0);
      assert.equal(await chip().getAttribute("aria-disabled"), "true");
      await assert.rejects(page.evaluate(() => window.imageDeduplicator.downloadUpdate("99.0.0")));
      assert.equal(await app.evaluate(() => globalThis.updateFixture.payloads), 2);
      await page.setViewportSize({ width: 980, height: 720 });
      await page.getByRole("dialog", { name: "Settings", exact: true }).getByRole("button", { name: "Close settings", exact: true }).click();
      await page.locator(".settingsPanel").waitFor({ state: "detached" });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await chip().focus();
      assert.equal(await chip().evaluate((button) => document.activeElement === button), true);
      await chip().hover();
      await page.screenshot({ animations: "disabled", path: path.join(artifacts, "01-downloading-narrow.png") });
      await app.evaluate(() => globalThis.updateFixture.finish());
      await waitPhase("downloaded");
      const downloaded = (await state()).status.path;
      assert.equal(await readFile(downloaded, "utf8"), payload);
      assert.equal(await readFile(path.join(downloads, name), "utf8"), "Preserve this existing file");
      await act();
      assert.equal(await app.evaluate(() => globalThis.updateFixture.revealed), downloaded);
      await settings();
      await check();
      assert.equal((await state()).status.phase, "downloaded", "manual checks retain verified downloads");
      await page.reload();
      await settings();
      assert.equal(await chip().getAttribute("aria-label"), "Show in Downloads");
      await page.screenshot({ animations: "disabled", path: path.join(artifacts, "02-downloaded.png") });
   }

   if (process.platform === "win32") {
      await app.evaluate(({ app }) => {
         process.env["PORTABLE_EXECUTABLE_FILE"] = "";
         process.env["APPIMAGE"] = "/fixture.AppImage";
         const fs = process.getBuiltinModule("fs"),
            exists = fs.existsSync;
         fs.existsSync = (file) => String(file).endsWith("app-update.yml") || exists(file);
         process.getBuiltinModule("module").syncBuiltinESMExports();
         const { autoUpdater } = process.getBuiltinModule("module").createRequire(`${app.getAppPath()}/package.json`)("electron-updater");
         autoUpdater.checkForUpdates = async () => ({
            downloadPromise: new Promise((resolve) => {
               globalThis.updateFixture.finishAutomatic = resolve;
            }),
         });
         autoUpdater.quitAndInstall = () => {
            globalThis.updateFixture.installs++;
            autoUpdater.emit("error", new Error("Fixture installer failure"));
         };
         globalThis.updateFixture.version = "99.0.1";
      });
      await check();
      await waitPhase("downloading");
      await app.evaluate(({ app }) => {
         const { autoUpdater } = process.getBuiltinModule("module").createRequire(`${app.getAppPath()}/package.json`)("electron-updater");
         assertListeners(autoUpdater);
         function assertListeners(updater) {
            if (updater.listenerCount("download-progress") !== 1) throw new Error("Duplicate progress listeners");
         }
         autoUpdater.emit("download-progress", { percent: 37 });
      });
      assert.equal((await state()).status.percent, 37);
      await app.evaluate(({ app }) => {
         const { autoUpdater } = process.getBuiltinModule("module").createRequire(`${app.getAppPath()}/package.json`)("electron-updater");
         autoUpdater.emit("update-downloaded", { version: "99.0.1" });
         globalThis.updateFixture.finishAutomatic();
      });
      await waitPhase("ready");
      assert.equal(await chip().getAttribute("aria-label"), "Apply and restart");
      await check();
      assert.equal((await state()).status.phase, "ready");
      await page.screenshot({ animations: "disabled", path: path.join(artifacts, "03-ready.png") });
      const replacement = app.waitForEvent("window");
      await act().catch(() => undefined);
      page = await replacement;
      await waitPhase("error");
      await settings();
      assert.equal(await app.evaluate(() => globalThis.updateFixture.installs), 1);
      assert.match((await state()).status.message, /Could not apply/);
      assert.equal(await chip().getAttribute("aria-label"), "View release");
      await page.screenshot({ animations: "disabled", path: path.join(artifacts, "04-install-recovery.png") });
      assert.ok(await page.evaluate(() => window.imageDeduplicator.loadData()), "database reopens after a failed installer");
   }
   console.log("PASS  Update checks, settings, state recovery, verified downloads and installer failure recovery");
} finally {
   await app.close();
   await rm(runtime, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
