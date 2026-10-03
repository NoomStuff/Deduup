import assert from "node:assert/strict";
import { copyFile, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createFixtures } from "./makeFixtures.mjs";

const require = createRequire(import.meta.url);
const { _electron: electron } = require("playwright-core");
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = path.join(repoRoot, ".cache", "library-refresh-smoke");
const profile = path.join(artifacts, "profile");
const root = path.join(artifacts, "scan-root");
let app;
let window;
const launch = async (scan = false) => {
   app = await electron.launch({
      executablePath: require("electron"),
      cwd: repoRoot,
      args: [".", `--user-data-dir=${profile}`, ...(scan ? [`--scan=${root}`] : [])],
      env: { ...process.env, IMAGE_DEDUPLICATOR_PROD: "1" },
   });
   window = await app.firstWindow();
   if (!scan) await window.getByRole("button", { name: /continue review/i }).click();
   await window.waitForSelector(".filmstrip__item", { timeout: 90_000 });
};
const load = () => window.evaluate(() => window.imageDeduplicator.loadData());
const waitForData = async (predicate) => {
   const deadline = Date.now() + 20_000;
   while (Date.now() < deadline) {
      const result = await load();
      if (predicate(result)) return result;
      await new Promise((resolve) => setTimeout(resolve, 100));
   }
   throw new Error("Timed out waiting for the library update");
};
const waitForFile = (filePath, exists) =>
   waitForData((result) => result.groups.some((set) => set.images.some((image) => image.originalPath === filePath)) === exists);

try {
   await rm(artifacts, { recursive: true, force: true });
   await mkdir(profile, { recursive: true });
   await createFixtures(root);
   await launch(true);
   const initial = await load();
   const source = initial.groups[0].images[0].originalPath;
   const other = initial.groups[0].images[1].originalPath;
   await window.keyboard.press("1");
   await waitForData((result) => Object.values(result.decisions).some((choice) => choice.deletedImages.includes(source)));
   await window.getByRole("button", { name: /final review/i }).click();
   await window.waitForSelector(".finalReview");
   await window.evaluate(() => window.imageDeduplicator.setReviewBusy(true));
   const added = path.join(root, "automatic-copy.jpg");
   await copyFile(source, added);
   await window.waitForTimeout(2200);
   assert.equal((await load()).scanId, initial.scanId, "refresh must wait while final review is open");
   await window.locator(".finalReview").getByLabel("Close final review").click();
   await window.waitForSelector(".finalReview", { state: "detached" });
   await waitForFile(added, true);
   await window.waitForFunction(() => document.querySelectorAll(".imageCard__chip--discarded").length === 1);
   const updated = await load();
   assert.notEqual(updated.scanId, initial.scanId);
   assert.ok(Object.values(updated.decisions).some((choice) => choice.deletedImages.includes(source)));
   assert.ok(
      (await window.locator(".imageCard").allTextContents()).some((text) => text.includes(path.basename(source))),
      "refresh retains the current set"
   );
   await window.screenshot({ path: path.join(artifacts, "01-automatic-update.png") });
   await rm(added);
   await waitForFile(added, false);
   assert.ok(Object.values((await load()).decisions).some((choice) => choice.deletedImages.includes(source)));
   await writeFile(source, "changed image contents");
   await waitForFile(source, false);
   await waitForData((result) => !Object.values(result.decisions).some((choice) => choice.deletedImages.includes(source)));
   assert.equal(await readFile(source, "utf8"), "changed image contents", "automatic refresh never moves files");
   assert.equal(await window.locator(".notificationToast--error").count(), 0);
   await app.close();
   const offline = path.join(root, "added-while-closed.jpg");
   await copyFile(other, offline);
   await launch();
   await waitForFile(offline, true);
   assert.equal(await window.locator(".toolbar__progress").count(), 0);
   await window.getByRole("button", { name: "File", exact: true }).click();
   assert.equal(await window.getByRole("menuitem", { name: /rescan/i }).count(), 0);
   console.log(
      "PASS automatic library refresh: dialog deferral, added/removed/changed files, preserved choices and current set, restart catch-up, no manual rescan or viewed progress"
   );
} finally {
   await app?.close();
}
