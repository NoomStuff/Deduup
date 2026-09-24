import assert from "node:assert/strict";
import test from "node:test";
import {
   emptyImageSetDecision,
   getDecision,
   getFileWorkflowState,
   getImageSetLabel,
   getImageSetState,
   getLargestImage,
   getMovePreview,
   getResumeIndex,
   getReviewedSetCount,
   getSetNumber,
   getSimilarityBands,
   getSimilarityColor,
   setImageSetDecision,
} from "../dist-test/renderer/reviewModel.js";

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

test("set decision normalization drops empty decisions and dedupes paths", () => {
   const withDuplicatePaths = setImageSetDecision({}, "set_001", { deletedImages: ["a", "a", "b"], seen: true });
   assert.deepEqual(withDuplicatePaths["set_001"]?.deletedImages, ["a", "b"]);

   const untouched = setImageSetDecision({}, "set_001", emptyImageSetDecision());
   assert.deepEqual(untouched, {});
   assert.equal(untouched["set_001"], undefined);
});

test("clearing a saved decision removes it from the record", () => {
   const saved = setImageSetDecision({}, "set_001", { deletedImages: ["a"], seen: true });
   const cleared = setImageSetDecision(saved, "set_001", emptyImageSetDecision());
   assert.equal(Object.keys(cleared).length, 0);
});

test("getDecision falls back to an empty decision", () => {
   assert.deepEqual(getDecision({}, "missing"), { deletedImages: [], seen: false });
});

test("set states track seen and deleted counts", () => {
   assert.equal(getImageSetState(threeSet, undefined), "open");
   assert.equal(getImageSetState(threeSet, { deletedImages: [], seen: true }), "seen");

   const oneMarked = { deletedImages: threeSet.images.slice(0, 1).map((item) => item.originalPath), seen: true };
   assert.equal(getImageSetState(threeSet, oneMarked), "someDeleted");

   const allMarked = { deletedImages: threeSet.images.map((item) => item.originalPath), seen: true };
   assert.equal(getImageSetState(threeSet, allMarked), "allDeleted");
});

test("set labels report kept over total", () => {
   const oneMarked = { deletedImages: [threeSet.images[0].originalPath], seen: true };
   assert.equal(getImageSetLabel(threeSet, oneMarked), "2/3");
});

test("only seen sets count as reviewed", () => {
   const decisions = {
      set_001: { deletedImages: [], seen: true },
   };
   assert.equal(getReviewedSetCount([threeSet, makeSet("set_002", 3, threeSet.images)], decisions), 1);
});

test("move preview lists marked images from seen sets only", () => {
   const marked = threeSet.images[1].originalPath;
   const decisions = { set_001: { deletedImages: [marked], seen: true }, set_002: { deletedImages: [marked], seen: false } };
   const preview = getMovePreview([threeSet, makeSet("set_002", 3, threeSet.images)], decisions);
   assert.equal(preview.length, 1);
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
      set_001: { deletedImages: ["C:/lib/ready.jpg"], seen: true },
      set_002: { deletedImages: ["C:/lib/recycled.jpg", "C:/lib/ghost.jpg"], seen: true },
   };
   assert.deepEqual(getFileWorkflowState(sets, decisions), {
      markedCount: 4,
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
