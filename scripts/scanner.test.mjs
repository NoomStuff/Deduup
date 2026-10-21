import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, stat, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { ScanCancelledError, collectImagePaths, groupImages, scanImages, getHashDistance } from "../src/main/scanner.ts";

const createImage = (hash, index) => ({
   file: `${index}.jpg`,
   originalPath: `${index}.jpg`,
   hash: `${hash.toString(16).padStart(16, "0")}:${"00".repeat(216)}`,
   width: 1,
   height: 1,
   size: 1,
   modifiedAt: 0,
});

test("incremental scanning reuses unchanged hashes and rejects a changed cached image", async () => {
   const root = await mkdtemp(path.join(os.tmpdir(), "deduplicator-cache-"));
   try {
      const file = path.join(root, "image.png");
      await sharp({ create: { width: 32, height: 32, channels: 3, background: "red" } })
         .png()
         .toFile(file);
      await utimes(file, 1000, 1000);
      const initial = await scanImages([file], () => undefined);
      const cache = new Map(initial.map((image) => [image.originalPath, image]));
      const unchanged = await scanImages([file], () => undefined, undefined, undefined, cache);
      assert.equal(unchanged[0], initial[0]);
      const legacy = { ...initial[0], hash: initial[0].hash.slice(0, 16) };
      const rehashed = await scanImages([file], () => undefined, undefined, undefined, new Map([[file, legacy]]));
      assert.notEqual(rehashed[0], legacy);
      assert.equal(rehashed[0].hash, initial[0].hash);
      await new Promise((resolve) => setTimeout(resolve, 10));
      await writeFile(file, Buffer.alloc(initial[0].size));
      await utimes(file, 1000, 1000);
      assert.equal((await stat(file)).mtimeMs, initial[0].modifiedAt);
      const warnings = [];
      assert.deepEqual(
         await scanImages(
            [file],
            () => undefined,
            (path) => warnings.push(path),
            undefined,
            cache
         ),
         []
      );
      assert.deepEqual(warnings, [file]);
   } finally {
      await rm(root, { recursive: true, force: true });
   }
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
   const root = await mkdtemp(path.join(os.tmpdir(), "deduup-scan-"));
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

test("excludes only the scan root's managed output and keeps scanning user duplicate folders", async () => {
   const root = await mkdtemp(path.join(os.tmpdir(), "deduup-managed-scan-"));
   try {
      const managedImage = path.join(root, "duplicate", ".deduup-managed", "set_001", "moved.jpg");
      const sourceImages = [
         path.join(root, "duplicate", "user-image.jpg"),
         path.join(root, "duplicate", ".deduup-managed-neighbor", "image.jpg"),
         path.join(root, "nested", "duplicate", ".deduup-managed", "image.jpg"),
      ];
      for (const file of [managedImage, ...sourceImages]) {
         await mkdir(path.dirname(file), { recursive: true });
         await writeFile(file, "image");
      }

      assert.deepEqual(
         await collectImagePaths(root),
         sourceImages.sort((left, right) => left.localeCompare(right))
      );
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

test("keeps identical hashes together across large-group chunk boundaries", async () => {
   const center = (1n << 13n) - 1n;
   const tail = (1n << 26n) - 1n;
   const last = (1n << 39n) - 1n;
   const hashes = [...Array(255).fill(0n), center, center, ...Array(255).fill(tail), ...Array(255).fill(last)];
   const groups = await groupImages(hashes.map(createImage), () => undefined);
   assert.equal(groups.flatMap((group) => group.images).length, hashes.length);
   const centerHash = createImage(center, 0).hash;
   const centerSets = groups.filter((group) => group.images.some((image) => image.hash === centerHash));
   assert.equal(centerSets.length, 1);
   assert.equal(centerSets[0].images.filter((image) => image.hash === centerHash).length, 2);
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

test("RGB evidence separates unrelated flats and preserves duplicate and near-duplicate flats", async () => {
   const root = await mkdtemp(path.join(os.tmpdir(), "deduup-flats-"));
   try {
      const svg = (fill, detail = "") =>
         `<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg"><rect width="400" height="300" fill="${fill}"/>${detail}</svg>`;
      const scenes = [
         ["green.png", svg("#00cc00")],
         ["green-identical.png", svg("#00cc00")],
         ["green-near.png", svg("#01cb01")],
         ["dark-line.png", svg("#030303", '<rect x="0" y="140" width="400" height="4" fill="#dddddd"/>')],
         ["red.png", svg("#610000")],
         ["blue.png", svg("#0000ff")],
         [
            "gradient.png",
            '<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"><stop stop-color="#003300"/><stop offset="1" stop-color="#00bb00"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/></svg>',
         ],
      ];
      for (const [name, scene] of scenes) await sharp(Buffer.from(scene)).png().toFile(path.join(root, name));
      await sharp(path.join(root, "green.png")).jpeg({ quality: 85 }).toFile(path.join(root, "green-jpeg.jpg"));
      const paths = [...scenes.map(([name]) => path.join(root, name)), path.join(root, "green-jpeg.jpg")];
      const images = await scanImages(paths, () => undefined);
      const byName = new Map(images.map((image) => [image.file, image]));
      const distance = (left, right) => getHashDistance(byName.get(left).hash, byName.get(right).hash);
      assert.equal(distance("green.png", "green-identical.png"), 0);
      assert.ok(distance("green.png", "green-near.png") > 0);
      assert.ok(distance("green.png", "dark-line.png") > 13);
      assert.ok(distance("red.png", "blue.png") > 13);
      assert.ok(distance("gradient.png", "blue.png") > 13);
      const groups = await groupImages(images, () => undefined);
      assert.equal(groups.length, 1);
      assert.deepEqual(new Set(groups[0].images.map((image) => image.file)), new Set(["green.png", "green-identical.png", "green-near.png", "green-jpeg.jpg"]));
      const members = groups[0].images;
      let total = 0;
      for (let left = 0; left < members.length; left += 1) {
         for (let right = left + 1; right < members.length; right += 1) total += getHashDistance(members[left].hash, members[right].hash);
      }
      assert.equal(groups[0].similarity, total / ((members.length * (members.length - 1)) / 2));
   } finally {
      await rm(root, { recursive: true, force: true });
   }
});

test("rejects legacy hashes rather than mixing distance formats", async () => {
   assert.throws(() => getHashDistance("0000000000000000", createImage(0n, 0).hash), /Rescan/);
   await assert.rejects(
      groupImages([{ ...createImage(0n, 0), hash: "0000000000000000" }], () => undefined),
      /Rescan/
   );
});

test("uses fractional color distances at the match boundary and while splitting color chains", async () => {
   const colored = (value, index) => ({ ...createImage(0n, index), hash: `${"0".repeat(16)}:${Buffer.alloc(216, value).toString("hex")}` });
   assert.equal((await groupImages([colored(0, 0), colored(51, 1)], () => undefined)).length, 1);
   assert.equal((await groupImages([colored(0, 0), colored(52, 1)], () => undefined)).length, 0);
   for (const population of [1, 120]) {
      const images = [0, 50, 100, 150, 200, 250].flatMap((value, step) =>
         Array.from({ length: population }, (_, index) => colored(value, step * population + index))
      );
      const groups = await groupImages(images, () => undefined);
      assert.equal(groups.flatMap((group) => group.images).length, images.length);
      for (const group of groups) assert.ok(group.similarity <= 13, `color chain averaged ${group.similarity}`);
      for (const value of [0, 50, 100, 150, 200, 250]) {
         const hash = colored(value, 0).hash;
         assert.equal(groups.filter((group) => group.images.some((image) => image.hash === hash)).length, 1);
      }
   }
});
