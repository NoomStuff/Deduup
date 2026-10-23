import assert from "node:assert/strict";
import { groupImages } from "../src/main/scanner.ts";

// Run with Bun, like the scanner unit tests. No files or profiles are touched.
const image = (hash, index) => ({
   file: `${index}.jpg`,
   originalPath: `${index}.jpg`,
   hash: `${hash.toString(16).padStart(16, "0")}:${"00".repeat(216)}`,
   width: 1,
   height: 1,
   size: 1,
   modifiedAt: 0,
   changedAt: 0,
});
const workloads = [
   ["identical-10000", Array.from({ length: 10_000 }, (_, index) => image(0n, index))],
   ["chain-256", Array.from({ length: 256 }, (_, index) => image((1n << BigInt(index % 65)) - 1n, index))],
];
for (const [name, images] of workloads) {
   await groupImages(images, () => undefined);
   const samples = [];
   let sets = 0;
   for (let run = 0; run < 5; run += 1) {
      const start = performance.now();
      const groups = await groupImages(images, () => undefined);
      samples.push(performance.now() - start);
      sets = groups.length;
      assert.equal(groups.flatMap((group) => group.images).length, images.length);
      assert.ok(groups.every((group) => group.similarity <= 13));
   }
   samples.sort((left, right) => left - right);
   console.log(JSON.stringify({ workload: name, medianMs: Math.round(samples[2] * 100) / 100, sets }));
}
