import assert from "node:assert/strict";
import test from "node:test";
import { groupImages } from "../dist-electron/main/scanner.js";

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

test("excludes detections larger than 100 images", async () => {
   const images = Array.from({ length: 101 }, (_, index) => createImage(0x123456789abcdef0n, index));
   assert.deepEqual(await groupImages(images, () => undefined), []);
});

test("excludes detections with an average distance above 20", async () => {
   const images = [0n, (1n << 13n) - 1n, (1n << 26n) - 1n, (1n << 39n) - 1n].map(createImage);
   assert.deepEqual(await groupImages(images, () => undefined), []);
});
