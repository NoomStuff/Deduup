import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ScanCancelledError, collectImagePaths, groupImages, scanImages } from "../src/main/scanner.ts";

const createImage = (hash, index) => ({
   file: `${index}.jpg`,
   originalPath: `${index}.jpg`,
   hash: hash.toString(16).padStart(16, "0"),
   width: 1,
   height: 1,
   size: 1,
   modifiedAt: 0,
});

test("groups planted matches across the supported distance range", async () => {
   const images = [];
   const mask = (1n << 64n) - 1n;
   let seed = 0x9e3779b97f4a7c15n;

   for (let pair = 0; pair < 1_000; pair += 1) {
      seed = (seed * 6364136223846793005n + 1442695040888963407n) & mask;
      let changed = seed;
      const distance = pair % 14;
      for (let bit = 0; bit < distance; bit += 1) {
         changed ^= 1n << BigInt((bit * 17 + pair * 7) % 64);
      }
      images.push(createImage(seed, images.length), createImage(changed, images.length + 1));
   }

   const groups = await groupImages(images, () => undefined);
   const groupedPaths = new Set(groups.flatMap((group) => group.images.map((image) => image.originalPath)));
   assert.equal(groupedPaths.size, images.length);
});

test("reports incremental grouping progress", async () => {
   const images = Array.from({ length: 600 }, (_, index) => createImage(BigInt(index), index));
   const completed = [];
   await groupImages(images, (progress) => {
      if (progress.phase === "grouping") completed.push(progress.completed);
   });

   assert.equal(completed[0], 0);
   assert.equal(completed.at(-1), images.length);
   assert.ok(completed.some((value) => value > 0 && value < images.length));
});

test("keeps detections larger than 100 images", async () => {
   const images = Array.from({ length: 101 }, (_, index) => createImage(0x123456789abcdef0n, index));
   const groups = await groupImages(images, () => undefined);
   assert.equal(groups.length, 1);
   assert.equal(groups[0]?.images.length, images.length);
});

test("always discovers supported images in nested folders", async () => {
   const root = await mkdtemp(path.join(os.tmpdir(), "image-deduplicator-scan-"));
   try {
      const nestedImage = path.join(root, "one", "two", "image.jpg");
      const unsupportedFile = path.join(root, "one", "notes.txt");
      await mkdir(path.dirname(nestedImage), { recursive: true });
      await writeFile(nestedImage, "image");
      await writeFile(unsupportedFile, "notes");

      assert.deepEqual(await collectImagePaths(root), [nestedImage]);
   } finally {
      await rm(root, { recursive: true, force: true });
   }
});

test("splits chains that average beyond the similarity cap", async () => {
   const images = [0n, (1n << 13n) - 1n, (1n << 26n) - 1n, (1n << 39n) - 1n].map(createImage);
   const groups = await groupImages(images, () => undefined);
   assert.equal(groups.flatMap((group) => group.images).length, images.length);
   for (const group of groups) {
      assert.ok(group.images.length >= 2);
      assert.ok(group.similarity <= 13, `group averaged ${group.similarity}`);
   }
});

test("splits very large over-cap chains without quadratic memory", async () => {
   // A 600-step chain: consecutive copies are exactly 13 bits apart, so they all
   // connect into one group far above the similarity cap. This used to feed the
   // whole group into a size-by-size distance matrix and crash on big folders.
   const images = [];
   let hash = 0n;
   for (let index = 0; index < 600; index += 1) {
      images.push(createImage(hash, index));
      for (let bit = 0; bit < 13; bit += 1) {
         hash ^= 1n << BigInt((index * 13 + bit) % 64);
      }
   }

   const groups = await groupImages(images, () => undefined);

   const grouped = groups.flatMap((group) => group.images);
   assert.equal(grouped.length, images.length);
   assert.ok(groups.length >= 3, `expected several sets, got ${groups.length}`);
   for (const group of groups) {
      assert.ok(group.similarity <= 13, `group averaged ${group.similarity}`);
   }
});

test("keeps groups whose average stays within the similarity cap", async () => {
   const images = [0n, (1n << 12n) - 1n, ((1n << 6n) - 1n) | (((1n << 6n) - 1n) << 12n)].map(createImage);
   const groups = await groupImages(images, () => undefined);
   assert.equal(groups.length, 1);
   assert.equal(groups[0]?.images.length, 3);
   assert.ok((groups[0]?.similarity ?? 0) <= 13);
});

test("finds every match inside the distance threshold", async () => {
   const images = [createImage(0n, 0), createImage(0x0020181002860002n, 1)];
   const groups = await groupImages(images, () => undefined);
   assert.equal(groups.length, 1);
   assert.equal(groups[0]?.images.length, 2);
});

test("stops collecting paths when the abort signal fires", async () => {
   const controller = new AbortController();
   controller.abort();
   await assert.rejects(collectImagePaths("C:/nowhere", undefined, controller.signal), ScanCancelledError);
});

test("stops hashing when the abort signal fires", async () => {
   const controller = new AbortController();
   controller.abort();
   const images = Array.from({ length: 8 }, (_, index) => `${index}.jpg`);
   await assert.rejects(
      scanImages(images, () => undefined, undefined, controller.signal),
      ScanCancelledError
   );
});

test("stops grouping when the abort signal fires mid-scan", async () => {
   const controller = new AbortController();
   const images = Array.from({ length: 600 }, (_, index) => createImage(BigInt(index), index));
   let aborted = false;
   await assert.rejects(
      groupImages(
         images,
         () => {
            if (!aborted) {
               aborted = true;
               controller.abort();
            }
         },
         controller.signal
      ),
      ScanCancelledError
   );
});
