import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
   applyFileMoves,
   assertManagedFolder,
   assertRecyclePlan,
   collectManagedFolderFiles,
   ensureManagedFolder,
   restoreFileMoves,
} from "../src/main/fileOperations.ts";
import { duplicateOwnershipMarkerContents, duplicateOwnershipMarkerName } from "../src/shared/constants.ts";

const withWorkspace = async (run) => {
   const root = await mkdtemp(path.join(os.tmpdir(), "image-deduplicator-"));
   try {
      await run(root);
   } finally {
      await rm(root, { recursive: true, force: true });
   }
};

const exists = (filePath) =>
   stat(filePath)
      .then(() => true)
      .catch(() => false);

const move = (root, name = "image.jpg") => ({
   setId: "set_001",
   file: name,
   from: path.join(root, "source", name),
   to: path.join(root, "duplicate", "set_001", name),
});

test("moves files into nested managed destinations", () =>
   withWorkspace(async (root) => {
      const planned = move(root);
      await mkdir(path.dirname(planned.from), { recursive: true });
      await writeFile(planned.from, "image");

      const result = await applyFileMoves([planned]);

      assert.deepEqual(result, { moved: [planned], skipped: [], errors: [] });
      assert.equal(await exists(planned.from), false);
      assert.equal(await readFile(planned.to, "utf8"), "image");
   }));

test("refuses a destination created after preflight without overwriting it", () =>
   withWorkspace(async (root) => {
      const planned = move(root);
      await mkdir(path.dirname(planned.from), { recursive: true });
      await writeFile(planned.from, "original");
      const result = await applyFileMoves([planned], {
         beforeMove: async () => {
            await mkdir(path.dirname(planned.to), { recursive: true });
            await writeFile(planned.to, "external file");
         },
      });
      assert.equal(result.errors.length, 1);
      assert.equal(await readFile(planned.from, "utf8"), "original");
      assert.equal(await readFile(planned.to, "utf8"), "external file");
   }));

test("refuses changed scan files and changes during move preparation", () =>
   withWorkspace(async (root) => {
      const planned = move(root);
      await mkdir(path.dirname(planned.from), { recursive: true });
      await writeFile(planned.from, "original");
      const source = await stat(planned.from);
      planned.expectedSource = { size: source.size, modifiedAt: source.mtimeMs };
      const prepared = await applyFileMoves([planned], { beforeMove: () => writeFile(planned.from, "changed during preparation") });
      assert.equal(prepared.errors.length, 1);
      const stale = await applyFileMoves([planned]);
      assert.equal(stale.errors.length, 1);
      assert.equal(await readFile(planned.from, "utf8"), "changed during preparation");
      assert.equal(await exists(planned.to), false);
   }));

test("a journal failure stops the move before file mutation", () =>
   withWorkspace(async (root) => {
      const planned = move(root);
      await mkdir(path.dirname(planned.from), { recursive: true });
      await writeFile(planned.from, "original");
      const result = await applyFileMoves([planned], {
         beforeMove: async () => {
            throw new Error("journal unavailable");
         },
      });
      assert.match(result.errors[0].message, /journal unavailable/u);
      assert.equal(await readFile(planned.from, "utf8"), "original");
      assert.equal(await exists(planned.to), false);
   }));

test("continues a move batch after missing sources and destination collisions", () =>
   withWorkspace(async (root) => {
      const missing = move(root, "missing.jpg");
      const collision = move(root, "collision.jpg");
      const successful = move(root, "successful.jpg");
      await mkdir(path.dirname(collision.from), { recursive: true });
      await mkdir(path.dirname(collision.to), { recursive: true });
      await writeFile(collision.from, "source");
      await writeFile(collision.to, "existing");
      await writeFile(successful.from, "source");

      const result = await applyFileMoves([missing, collision, successful]);

      assert.deepEqual(result.skipped, [missing]);
      assert.equal(result.errors.length, 1);
      assert.match(result.errors[0].message, /destination already exists/u);
      assert.deepEqual(result.moved, [successful]);
      assert.equal(await readFile(collision.from, "utf8"), "source");
      assert.equal(await readFile(collision.to, "utf8"), "existing");
   }));

test("restores known files while leaving collisions and unmanaged files untouched", () =>
   withWorkspace(async (root) => {
      const restored = move(root, "restored.jpg");
      const collision = move(root, "collision.jpg");
      const unmanaged = path.join(root, "duplicate", "nested", "unexpected.jpg");
      await mkdir(path.dirname(restored.to), { recursive: true });
      await mkdir(path.dirname(unmanaged), { recursive: true });
      await mkdir(path.dirname(collision.from), { recursive: true });
      await writeFile(restored.to, "restore me");
      await writeFile(collision.to, "moved copy");
      await writeFile(collision.from, "new original");
      await writeFile(unmanaged, "user file");

      const result = await restoreFileMoves([restored, collision], [restored.to, collision.to, unmanaged]);

      assert.equal(await readFile(restored.from, "utf8"), "restore me");
      assert.equal(await exists(restored.to), false);
      assert.deepEqual(result.skipped, [{ ...collision, from: collision.to, to: collision.from }]);
      assert.equal(result.errors.length, 1);
      assert.equal(result.errors[0].setId, "unmanaged");
      assert.equal(await readFile(collision.to, "utf8"), "moved copy");
      assert.equal(await readFile(unmanaged, "utf8"), "user file");
   }));

test("creates and validates ownership only for empty managed folders", () =>
   withWorkspace(async (root) => {
      const managed = path.join(root, "managed");
      await ensureManagedFolder(managed);
      await assertManagedFolder(managed);
      assert.equal(await readFile(path.join(managed, duplicateOwnershipMarkerName), "utf8"), duplicateOwnershipMarkerContents);

      const unowned = path.join(root, "unowned");
      await mkdir(unowned);
      await writeFile(path.join(unowned, "user.jpg"), "mine");
      await assert.rejects(ensureManagedFolder(unowned), /already contains unowned files/u);
   }));

test("rejects missing and invalid ownership markers", () =>
   withWorkspace(async (root) => {
      const managed = path.join(root, "managed");
      await mkdir(managed);
      await assert.rejects(assertManagedFolder(managed), /not owned by this app/u);
      await writeFile(path.join(managed, duplicateOwnershipMarkerName), "wrong owner");
      await assert.rejects(assertManagedFolder(managed), /not owned by this app/u);
   }));

test("ignores only the root ownership marker and reports nested same-name files", () =>
   withWorkspace(async (root) => {
      await ensureManagedFolder(root);
      const nestedMarker = path.join(root, "detection_001", duplicateOwnershipMarkerName);
      await mkdir(path.dirname(nestedMarker), { recursive: true });
      await writeFile(nestedMarker, "user content");

      assert.deepEqual(await collectManagedFolderFiles(root), [nestedMarker]);
   }));

test("allows only the exact saved move plan to be recycled", () =>
   withWorkspace(async (root) => {
      const planned = move(root);
      const unmanaged = path.join(root, "duplicate", "set_001", "extra.jpg");
      await ensureManagedFolder(path.join(root, "duplicate"));

      await assert.doesNotReject(assertRecyclePlan(path.join(root, "duplicate"), [planned], [planned.to]));
      await assert.rejects(assertRecyclePlan(path.join(root, "duplicate"), [planned], [planned.to, unmanaged]), /Refusing to recycle 1 file/u);
   }));
