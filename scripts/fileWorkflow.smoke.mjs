import assert from "node:assert/strict";
import { readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { createFixtures } from "./makeFixtures.mjs";

const require = createRequire(import.meta.url);
const { _electron: electron } = require("playwright-core");
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = path.join(repoRoot, ".cache", "file-workflow-smoke");
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
const restore = () => window.evaluate(() => window.imageDeduplicator.restoreDuplicateFolder());

try {
   await rm(artifacts, { recursive: true, force: true });
   await mkdir(profile, { recursive: true });
   await createFixtures(root);
   await launch(true);
   const data = await load();
   const set = data.groups[0];
   const source = set.images[0].originalPath;
   const original = await readFile(source);
   const decisions = { [set.id]: { deletedImages: [source] } };
   const moved = await window.evaluate(({ decisions, scanId }) => window.imageDeduplicator.applyMoves(decisions, scanId), { decisions, scanId: data.scanId });
   assert.equal(moved.errors.length, 0);
   assert.equal(moved.moved.length, 1);
   const destination = moved.moved[0].to;
   assert.deepEqual(await readFile(destination), original);
   await assert.rejects(readFile(source), { code: "ENOENT" });
   // Recovery must survive both choice changes and a process restart.
   await window.evaluate((scanId) => window.imageDeduplicator.saveDecisions({}, scanId), data.scanId);
   await app.close();
   await launch();
   assert.equal((await load()).groups.flatMap((group) => group.images).find((image) => image.originalPath === source).sourceStatus, "movedByApp");
   await writeFile(source, "new original at the same path");
   const collided = await load();
   assert.equal(collided.groups.flatMap((group) => group.images).find((image) => image.originalPath === source).sourceStatus, "movedByApp");
   assert.equal((await restore()).skipped.length, 1);
   assert.equal(await readFile(source, "utf8"), "new original at the same path");
   await rm(source);
   await writeFile(destination, "modified moved file");
   assert.equal((await restore()).errors.length, 1);
   await assert.rejects(
      window.evaluate(() => window.imageDeduplicator.trashDuplicateFolder()),
      /changed/u
   );
   assert.equal(await readFile(destination, "utf8"), "modified moved file");
   await writeFile(destination, original);
   assert.equal((await restore()).moved.length, 1);
   assert.deepEqual(await readFile(source), original);
   assert.equal((await load()).duplicateFolderHasContent, false);
   const rescanned = await window.evaluate((rootPath) => window.imageDeduplicator.scanFolder({ rootPath }), root);
   assert.notEqual(rescanned.scanId, data.scanId);
   await assert.rejects(
      window.evaluate(({ decisions, scanId }) => window.imageDeduplicator.saveDecisions(decisions, scanId), { decisions, scanId: data.scanId }),
      /scan changed/u
   );
   await assert.rejects(
      window.evaluate((scanId) => window.imageDeduplicator.saveDecisions({ unknown: { deletedImages: [] } }, scanId), rescanned.scanId),
      /unknown sets/u
   );
   await assert.rejects(
      window.evaluate((scanId) => window.imageDeduplicator.saveDecisions({ broken: { deletedImages: [42] } }, scanId), rescanned.scanId),
      /Invalid/u
   );
   await app.close();
   const legacySet = rescanned.groups.find((set) => set.images.some((image) => image.originalPath === source));
   const visitedSet = rescanned.groups.find((set) => set.id !== legacySet.id);
   const databasePath = path.join(profile, "image-deduplicator.sqlite");
   const legacy = new DatabaseSync(databasePath);
   legacy.exec(
      "BEGIN IMMEDIATE; DROP TABLE decisions; CREATE TABLE decisions (set_id TEXT PRIMARY KEY REFERENCES duplicate_groups(id) ON DELETE CASCADE, deleted_images_json TEXT NOT NULL, seen INTEGER NOT NULL); ALTER TABLE images DROP COLUMN changed_at; ALTER TABLE image_inventory DROP COLUMN changed_at;"
   );
   legacy.prepare("INSERT INTO decisions VALUES (?, ?, ?)").run(legacySet.id, JSON.stringify([source]), 0);
   legacy.prepare("INSERT INTO decisions VALUES (?, ?, ?)").run(visitedSet.id, "[]", 1);
   legacy.exec("COMMIT");
   legacy.close();
   await launch();
   const migrated = await load();
   assert.deepEqual(migrated.decisions[legacySet.id], { deletedImages: [source] });
   assert.equal(migrated.decisions[visitedSet.id], undefined);
   const inspect = new DatabaseSync(databasePath, { readOnly: true });
   assert.ok(
      !inspect
         .prepare("PRAGMA table_info(decisions)")
         .all()
         .some((column) => column.name === "seen")
   );
   assert.ok(
      inspect
         .prepare("PRAGMA table_info(images)")
         .all()
         .some((column) => column.name === "changed_at")
   );
   inspect.close();
   console.log("PASS file workflow: move, restart, choice-independent recovery, source collision, checksum rejection, restore, stale and malformed saves");
   console.log("PASS legacy profile migration: removal candidates survive, visits disappear, change timestamps migrate");
} finally {
   await app?.close();
}
