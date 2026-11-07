import assert from "node:assert/strict";
import test from "node:test";
import {
   emptyImageSetDecision,
   getDecision,
   getImageSetLabel,
   getImageSetState,
   getLargestImage,
   getReviewSummary,
   getResumeIndex,
   getSetNumber,
   getSimilarityBands,
   getSimilarityColor,
   getSetRow,
   setImageSetDecision,
} from "../src/renderer/reviewModel.ts";

const image = (name, width, height, size) => ({
   file: name,
   originalPath: `C:/lib/${name}`,
   currentPath: `C:/lib/${name}`,
   folderPath: "C:/lib",
   hash: "0".repeat(16),
   width,
   height,
   size,
   modifiedAt: 0,
   previewUrl: "preview://x",
   fullPreviewUrl: "preview://x/full",
   exists: true,
   sourceStatus: "available",
});

const makeSet = (id, similarity, images) => ({ id, similarity, folderPath: "C:/lib", images });

const threeSet = makeSet("set_001", 2, [image("a.jpg", 400, 400, 300), image("b.jpg", 800, 600, 500), image("c.jpg", 800, 600, 700)]);

test("sets in the same displayed band share a label and color", () => {
   const sets = [makeSet("set_001", 2.71, threeSet.images), makeSet("set_002", 2.74, threeSet.images)];
   const bands = getSimilarityBands(sets);
   assert.equal(bands.length, 1);
   assert.equal(bands[0].label, getSetRow(sets[0], undefined).differenceText);
   assert.equal(bands[0].label, getSetRow(sets[1], undefined).differenceText);
   assert.equal(getSimilarityColor(bands[0].distance), getSimilarityColor(sets[0].similarity));
   assert.equal(getSimilarityColor(sets[0].similarity), getSimilarityColor(sets[1].similarity));
});

test("auto-keep picks the largest copy by pixels, not by name", () => {
   const picked = getLargestImage(makeSet("set_002", 1, [image("great_name.jpg", 400, 400, 9000), image("anonymous.png", 1000, 1000, 10)]));
   assert.equal(picked.file, "anonymous.png");
});

test("auto-keep breaks pixel ties by file size, then by name", () => {
   const bySize = getLargestImage(makeSet("set_003", 1, [image("x.jpg", 500, 500, 100), image("y.jpg", 500, 500, 900)]));
   assert.equal(bySize.file, "y.jpg");

   const byName = getLargestImage(makeSet("set_004", 1, [image("b.jpg", 500, 500, 100), image("a.jpg", 500, 500, 100)]));
   assert.equal(byName.file, "a.jpg");
});

test("decisions dedupe paths and preserve explicit keep-all choices", () => {
   const withDuplicatePaths = setImageSetDecision({}, "set_001", { deletedImages: ["a", "a", "b"] });
   assert.deepEqual(withDuplicatePaths["set_001"]?.deletedImages, ["a", "b"]);

   const untouched = setImageSetDecision({}, "set_001", emptyImageSetDecision());
   assert.deepEqual(untouched["set_001"], { deletedImages: [] });
});

test("clearing candidates retains the explicit keep-all choice", () => {
   const saved = setImageSetDecision({}, "set_001", { deletedImages: ["a"] });
   const cleared = setImageSetDecision(saved, "set_001", emptyImageSetDecision());
   assert.deepEqual(cleared["set_001"], { deletedImages: [] });
});

test("getDecision falls back to an empty decision", () => {
   assert.deepEqual(getDecision({}, "missing"), { deletedImages: [] });
});

test("set states reflect candidate counts without visits", () => {
   assert.equal(getImageSetState(threeSet, undefined), "open");
   assert.equal(getImageSetState(threeSet, { deletedImages: [] }), "open");

   const oneMarked = { deletedImages: threeSet.images.slice(0, 1).map((item) => item.originalPath) };
   assert.equal(getImageSetState(threeSet, oneMarked), "someDeleted");

   const allMarked = { deletedImages: threeSet.images.map((item) => item.originalPath) };
   assert.equal(getImageSetState(threeSet, allMarked), "allDeleted");
});

test("set labels report kept over total", () => {
   const oneMarked = { deletedImages: [threeSet.images[0].originalPath] };
   assert.equal(getImageSetLabel(threeSet, oneMarked), "2/3");
});

test("move preview lists candidates without a viewed prerequisite", () => {
   const marked = threeSet.images[1].originalPath;
   const decisions = { set_001: { deletedImages: [marked] }, set_002: { deletedImages: [marked] } };
   const { movePreview: preview } = getReviewSummary([threeSet, makeSet("set_002", 3, threeSet.images)], decisions);
   assert.equal(preview.length, 2);
   assert.equal(preview[0]?.file, "b.jpg");
   assert.equal(preview[0]?.setId, "set_001");
   assert.equal(preview[0]?.originalPath, marked);
});

test("workflow state separates ready, moved, and recycled images", () => {
   const sets = [
      makeSet("set_001", 1, [image("ready.jpg", 10, 10, 1), { ...image("moved.jpg", 10, 10, 1), sourceStatus: "movedByApp" }]),
      makeSet("set_002", 1, [
         { ...image("recycled.jpg", 10, 10, 1), sourceStatus: "recycledByApp" },
         { ...image("ghost.jpg", 10, 10, 1), sourceStatus: "missing" },
      ]),
   ];
   const decisions = {
      set_001: { deletedImages: ["C:/lib/ready.jpg"] },
      set_002: { deletedImages: ["C:/lib/recycled.jpg", "C:/lib/ghost.jpg"] },
   };
   const { workflow, movePreview, duplicatePreview } = getReviewSummary(sets, decisions);
   assert.deepEqual(
      movePreview.map((row) => row.file),
      ["ready.jpg"]
   );
   assert.deepEqual(
      duplicatePreview.map((row) => row.file),
      ["moved.jpg"]
   );
   assert.deepEqual(workflow, {
      discardedCount: 4,
      readyToMoveCount: 1,
      movedCount: 1,
      recycledCount: 1,
      missingCount: 1,
   });
});

test("bands group consecutive sets that share a displayed similarity", () => {
   const groups = [makeSet("set_001", 0.04, threeSet.images), makeSet("set_002", 0.02, threeSet.images), makeSet("set_003", 3.1, threeSet.images)];
   const bands = getSimilarityBands(groups);
   assert.deepEqual(
      bands.map((band) => ({ label: band.label, size: band.groups.length })),
      [
         { label: "0.0", size: 2 },
         { label: "3.1", size: 1 },
      ]
   );
});

test("band colors run warm orange to green across the match limit", () => {
   const start = getSimilarityColor(0);
   const end = getSimilarityColor(13);
   const channel = (color, index) => Number.parseInt(color.slice(4, -1).split(" ")[index], 10);
   // Terracotta orange starts high in red and low in blue, green ends the scale.
   assert.ok(channel(start, 0) > channel(end, 0));
   assert.ok(channel(end, 1) > channel(start, 1));
   assert.ok(channel(end, 2) > channel(start, 2));
});

test("resume index finds the saved set or falls back to the first", () => {
   const groups = [makeSet("set_001", 1, threeSet.images), makeSet("set_002", 2, threeSet.images)];
   assert.equal(getResumeIndex(groups, "set_002"), 1);
   assert.equal(getResumeIndex(groups, "gone"), 0);
   assert.equal(getResumeIndex(groups, null), 0);
});

test("set numbers format to a hash plus plain number", () => {
   assert.equal(getSetNumber("set_001"), "#1");
   assert.equal(getSetNumber("set_341"), "#341");
});

test("set insights rank only real differences and point at the autoselect pick", async () => {
   const { getSetInsights } = await import("../src/renderer/reviewModel.ts");
   const identical = makeSet("set_010", 0, [image("a.jpg", 800, 600, 500), image("b.jpg", 800, 600, 500)]);
   const flat = getSetInsights(identical);
   assert.equal(flat.suggestedPath, null);
   assert.deepEqual(
      [...flat.images.values()],
      [
         { resolution: null, size: null, folderLabel: null },
         { resolution: null, size: null, folderLabel: null },
      ]
   );

   // Re-saves a few bytes apart read as the same size.
   const resaved = getSetInsights(makeSet("set_011", 1, [image("a.jpg", 800, 600, 1000), image("b.jpg", 800, 600, 1010)]));
   assert.equal(resaved.suggestedPath, null);
   assert.equal(resaved.images.get("C:/lib/a.jpg")?.size, null);

   const ranked = getSetInsights(threeSet);
   assert.equal(ranked.suggestedPath, "C:/lib/c.jpg");
   assert.equal(ranked.images.get("C:/lib/a.jpg")?.resolution, "lower");
   assert.equal(ranked.images.get("C:/lib/b.jpg")?.resolution, "best");
   assert.equal(ranked.images.get("C:/lib/b.jpg")?.size, "lower");
   assert.equal(ranked.images.get("C:/lib/c.jpg")?.size, "best");
});

test("set insights label folders relative to the folder every image shares", async () => {
   const { getSetInsights } = await import("../src/renderer/reviewModel.ts");
   // Windows paths, written with "/" here and converted so the test reads cleanly.
   const win = (value) => value.replaceAll("/", "\\");
   const at = (name, folder) => ({ ...image(name, 10, 10, 10), originalPath: win(`${folder}/${name}`), folderPath: win(folder) });
   const nested = getSetInsights(makeSet("set_012", 1, [at("a.jpg", "C:/Photos/2014"), at("b.jpg", "C:/Photos/Backup/2014")]));
   assert.equal(nested.commonFolder, win("C:/Photos"));
   assert.equal(nested.images.get(win("C:/Photos/2014/a.jpg"))?.folderLabel, "2014");
   assert.equal(nested.images.get(win("C:/Photos/Backup/2014/b.jpg"))?.folderLabel, "Backup/2014");

   const rooted = getSetInsights(makeSet("set_013", 1, [at("a.jpg", "C:/Photos"), at("b.jpg", "C:/Photos/Backup")]));
   assert.equal(rooted.images.get(win("C:/Photos/a.jpg"))?.folderLabel, "Photos");
   assert.equal(rooted.images.get(win("C:/Photos/Backup/b.jpg"))?.folderLabel, "Photos/Backup");

   const together = getSetInsights(makeSet("set_014", 1, [at("a.jpg", "C:/Photos"), at("b.jpg", "C:/Photos")]));
   assert.equal(together.commonFolder, win("C:/Photos"));
   assert.equal(together.images.get(win("C:/Photos/a.jpg"))?.folderLabel, null);

   // POSIX roots keep their leading separator.
   const posixAt = (name, folder) => ({ ...image(name, 10, 10, 10), originalPath: `${folder}/${name}`, folderPath: folder });
   const posix = getSetInsights(makeSet("set_015", 1, [posixAt("a.jpg", "/home/me/a"), posixAt("b.jpg", "/home/me/b")]));
   assert.equal(posix.commonFolder, "/home/me");
   assert.equal(posix.images.get("/home/me/b/b.jpg")?.folderLabel, "b");
});

test("final review sets pair each move with what the set keeps", async () => {
   const { getFinalReviewSets } = await import("../src/renderer/reviewModel.ts");
   const other = makeSet("set_002", 3, [image("d.jpg", 10, 10, 1), image("e.jpg", 10, 10, 1)]);
   const decisions = { set_001: { deletedImages: ["C:/lib/a.jpg"] }, set_002: { deletedImages: ["C:/lib/d.jpg", "C:/lib/e.jpg"] } };
   const { movePreview } = getReviewSummary([threeSet, other], decisions);
   const sets = getFinalReviewSets([threeSet, other], movePreview);
   assert.deepEqual(
      sets.map((entry) => [entry.number, entry.kept.map((item) => item.file), entry.discarded.map((row) => row.file)]),
      [
         ["#1", ["b.jpg", "c.jpg"], ["a.jpg"]],
         ["#2", [], ["d.jpg", "e.jpg"]],
      ]
   );
});

test("file results read as one sentence and only mention counts that need attention", async () => {
   const { describeFileResult } = await import("../src/renderer/reviewModel.ts");
   assert.equal(describeFileResult({ moved: [1], skipped: [], errors: [] }, "Moved"), "Moved 1 image.");
   assert.equal(describeFileResult({ moved: [1, 2, 3], skipped: [1], errors: [1, 2] }, "Restored"), "Restored 3 images, 1 skipped, 2 failed.");
});
