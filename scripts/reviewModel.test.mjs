import assert from "node:assert/strict";
import test from "node:test";
import {
   emptyImageSetDecision,
   getFinalReviewSets,
   getLargestImage,
   getReviewSummary,
   getSetInsights,
   getSetRow,
   getSimilarityBands,
   getSimilarityColor,
   setImageSetDecision,
} from "../src/renderer/reviewModel.ts";

const image = (name, width, height, size) => ({
   file: name,
   originalPath: `C:/lib/${name}`,
   currentPath: `C:/lib/${name}`,
   folderPath: "C:/lib",
   evidence: "0",
   width,
   height,
   size,
   modifiedAt: 0,
   previewUrl: "preview://x",
   sourceStatus: "available",
});

const makeSet = (id, similarity, images) => ({ id, similarity, folderPath: "C:/lib", images });

const threeSet = makeSet("set_001", 2, [image("a.jpg", 400, 400, 300), image("b.jpg", 800, 600, 500), image("c.jpg", 800, 600, 700)]);

test("bands group consecutive sets by displayed similarity and share one color", () => {
   const groups = [makeSet("set_001", 0.04, threeSet.images), makeSet("set_002", 0.02, threeSet.images), makeSet("set_003", 3.1, threeSet.images)];
   const bands = getSimilarityBands(groups);
   assert.deepEqual(
      bands.map((band) => ({ label: band.label, size: band.groups.length })),
      [
         { label: "0.0", size: 2 },
         { label: "3.1", size: 1 },
      ]
   );
   assert.equal(getSetRow(groups[0], undefined).differenceText, bands[0].label);
   assert.equal(getSimilarityColor(bands[0].distance), getSimilarityColor(groups[0].similarity));
});

test("auto-keep picks the most pixels, then the largest file, then the first name", () => {
   const pick = (images) => getLargestImage(makeSet("set_002", 1, images)).file;
   assert.equal(pick([image("great_name.jpg", 400, 400, 9000), image("anonymous.png", 1000, 1000, 10)]), "anonymous.png");
   assert.equal(pick([image("x.jpg", 500, 500, 100), image("y.jpg", 500, 500, 900)]), "y.jpg");
   assert.equal(pick([image("b.jpg", 500, 500, 100), image("a.jpg", 500, 500, 100)]), "a.jpg");
});

test("decisions dedupe paths and keep an explicit keep-all choice after clearing", () => {
   const saved = setImageSetDecision({}, "set_001", { deletedImages: ["a", "a", "b"] });
   assert.deepEqual(saved["set_001"]?.deletedImages, ["a", "b"]);
   assert.deepEqual(setImageSetDecision(saved, "set_001", emptyImageSetDecision())["set_001"], { deletedImages: [] });
});

test("set rows report kept over total and whether some or all images are discarded", () => {
   const marked = (count) => ({ deletedImages: threeSet.images.slice(0, count).map((item) => item.originalPath) });
   assert.deepEqual(
      [undefined, marked(1), marked(3)].map((decision) => [getSetRow(threeSet, decision).label, getSetRow(threeSet, decision).state]),
      [
         ["3/3", "open"],
         ["2/3", "someDeleted"],
         ["0/3", "allDeleted"],
      ]
   );
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

test("set insights rank only real differences", () => {
   const identical = makeSet("set_010", 0, [image("a.jpg", 800, 600, 500), image("b.jpg", 800, 600, 500)]);
   const flat = getSetInsights(identical);
   assert.deepEqual(
      [...flat.images.values()],
      [
         { resolution: null, size: null, folderLabel: null },
         { resolution: null, size: null, folderLabel: null },
      ]
   );

   // Re-saves a few bytes apart read as the same size.
   const resaved = getSetInsights(makeSet("set_011", 1, [image("a.jpg", 800, 600, 1000), image("b.jpg", 800, 600, 1010)]));
   assert.equal(resaved.images.get("C:/lib/a.jpg")?.size, null);

   const ranked = getSetInsights(threeSet);
   assert.equal(ranked.images.get("C:/lib/a.jpg")?.resolution, "lower");
   assert.equal(ranked.images.get("C:/lib/b.jpg")?.resolution, "best");
   assert.equal(ranked.images.get("C:/lib/b.jpg")?.size, "lower");
   assert.equal(ranked.images.get("C:/lib/c.jpg")?.size, "best");
});

test("set insights label folders relative to the folder every image shares", () => {
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

test("final review sets pair each move with what the set keeps", () => {
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
