import assert from "node:assert/strict";
import test from "node:test";
import { countBandAutoselectOverrides, countBandMarkOverrides, createReviewActions } from "../src/renderer/reviewActions.ts";

// reviewActions reaches for window timers when advancing; stub them for Node.
// Assignment (not declaration): a module-scope declaration would shadow the real global.
globalThis.window ??= {
   setTimeout: (callback, ms) => setTimeout(callback, ms),
   clearTimeout: (id) => clearTimeout(id),
   requestAnimationFrame: (callback) => setTimeout(callback, 16),
   cancelAnimationFrame: (id) => clearTimeout(id),
};

const image = (name, width = 100, height = 100, size = 1) => ({
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

const twoSet = makeSet("set_001", 2, [image("a.jpg"), image("b.jpg")]);

const bind = (groups, decisions = {}, goToEvents = []) => {
   let next = decisions;
   const actions = createReviewActions({
      currentIndex: 0,
      decisions,
      groups,
      goTo: (index) => goToEvents.push(index),
      updateDecisions: (updater) => {
         next = updater(next);
      },
   });
   return { actions, result: () => next };
};

test("toggling marks one image and toggling again clears it", () => {
   const first = bind([twoSet]);
   first.actions.toggleImageRemoval(twoSet, twoSet.images[0], false);
   assert.deepEqual(first.result()["set_001"]?.deletedImages, ["C:/lib/a.jpg"]);
   assert.equal(first.result()["set_001"]?.seen, true);

   // The set itself stays marked as seen; only the removal choice is undone.
   const second = bind([twoSet], first.result());
   second.actions.toggleImageRemoval(twoSet, twoSet.images[0], false);
   assert.deepEqual(second.result()["set_001"], { deletedImages: [], seen: true });
});

test("toggling an image that is no longer at its source changes nothing", () => {
   const movedSet = makeSet("set_001", 1, [{ ...image("gone.jpg"), sourceStatus: "movedByApp" }]);
   const run = bind([movedSet]);
   run.actions.toggleImageRemoval(movedSet, movedSet.images[0], false);
   assert.deepEqual(run.result(), {});
});

test("keep only this marks the others and a second use restores them", () => {
   const first = bind([twoSet]);
   first.actions.toggleOnlyImageKept(twoSet, twoSet.images[1], false);
   assert.deepEqual(first.result()["set_001"]?.deletedImages, ["C:/lib/a.jpg"]);

   const second = bind([twoSet], first.result());
   second.actions.toggleOnlyImageKept(twoSet, twoSet.images[1], false);
   assert.deepEqual(second.result()["set_001"], { deletedImages: [], seen: true });
});

test("marking a set marks every available copy as seen", () => {
   const mixed = makeSet("set_001", 1, [image("a.jpg"), { ...image("b.jpg"), sourceStatus: "movedByApp" }]);
   const run = bind([mixed]);
   run.actions.markImageSet(mixed);
   assert.deepEqual(run.result()["set_001"]?.deletedImages, ["C:/lib/a.jpg"]);
   assert.equal(run.result()["set_001"]?.seen, true);
});

test("autoselect keeps the largest copy and marks the rest", () => {
   const sized = makeSet("set_001", 1, [image("small.jpg", 100, 100), image("big.jpg", 800, 600)]);
   const run = bind([sized]);
   run.actions.autoSelectImageSet(sized);
   assert.deepEqual(run.result()["set_001"]?.deletedImages, ["C:/lib/small.jpg"]);
});

test("advancing toggles and then moves to the next set", async () => {
   const events = [];
   const run = bind([twoSet, makeSet("set_002", 3, [image("c.jpg")])], {}, events);
   run.actions.toggleImageRemoval(twoSet, twoSet.images[0], true);
   assert.deepEqual(run.result()["set_001"]?.deletedImages, ["C:/lib/a.jpg"]);
   await new Promise((resolve) => setTimeout(resolve, 40));
   assert.deepEqual(events, [1]);
});

test("band actions apply to every set that shares the displayed similarity", () => {
   const band = [makeSet("set_001", 2.04, [image("a.jpg")]), makeSet("set_002", 2.02, [image("b.jpg")])];
   const beyond = makeSet("set_003", 5, [image("c.jpg")]);
   const groups = [...band, beyond];

   const marked = bind(groups);
   marked.actions.markSimilarityBand(band[0]);
   assert.deepEqual(marked.result()["set_001"]?.deletedImages, ["C:/lib/a.jpg"]);
   assert.deepEqual(marked.result()["set_002"]?.deletedImages, ["C:/lib/b.jpg"]);
   assert.equal(marked.result()["set_003"], undefined);

   const cleared = bind(groups, marked.result());
   cleared.actions.clearSimilarityBandChoices(band[0]);
   assert.equal(cleared.result()["set_001"], undefined);
   assert.equal(cleared.result()["set_002"], undefined);

   const seen = bind(groups);
   seen.actions.markSimilarityBandSeen(band[0]);
   assert.deepEqual(seen.result()["set_001"]?.deletedImages, []);
   assert.equal(seen.result()["set_001"]?.seen, true);
   assert.deepEqual(seen.result()["set_002"]?.deletedImages, []);
   assert.equal(seen.result()["set_003"], undefined);
});

test("autoselecting a band keeps the largest of every set in it", () => {
   const groups = [
      makeSet("set_001", 1.2, [image("a_small.jpg", 100, 100), image("a_big.jpg", 900, 700)]),
      makeSet("set_002", 1.2, [image("b_big.jpg", 900, 700), image("b_small.jpg", 100, 100)]),
   ];
   const run = bind(groups);
   run.actions.autoSelectBand(groups[0]);
   assert.deepEqual(run.result()["set_001"]?.deletedImages, ["C:/lib/a_small.jpg"]);
   assert.deepEqual(run.result()["set_002"]?.deletedImages, ["C:/lib/b_small.jpg"]);
});

test("band override counters flag only sets whose choices would change", () => {
   const groups = [
      makeSet("set_001", 1.2, [image("a_small.jpg", 100, 100), image("a_big.jpg", 900, 700)]),
      makeSet("set_002", 1.2, [image("b_big.jpg", 900, 700), image("b_small.jpg", 100, 100)]),
   ];

   // A fresh band has nothing to overwrite.
   assert.equal(countBandAutoselectOverrides(groups, {}, groups[0]), 0);
   assert.equal(countBandMarkOverrides(groups, {}, groups[0]), 0);

   // Keeping the smaller copy of set 1 is a manual choice autoselect would
   // re-pick; set 2's marks already match the autoselect outcome.
   const manual = {
      set_001: { deletedImages: ["C:/lib/a_big.jpg"], seen: true },
      set_002: { deletedImages: ["C:/lib/b_small.jpg"], seen: true },
   };
   assert.equal(countBandAutoselectOverrides(groups, manual, groups[0]), 1);
   // Marking the whole band would still add marks to both sets.
   assert.equal(countBandMarkOverrides(groups, manual, groups[0]), 2);
});

test("clearing a set keeps marks on images that are no longer at their source", () => {
   const mixed = makeSet("set_001", 1, [image("a.jpg"), { ...image("b.jpg"), sourceStatus: "movedByApp" }]);
   const decisions = { set_001: { deletedImages: ["C:/lib/a.jpg", "C:/lib/b.jpg"], seen: true } };
   const run = bind([mixed], decisions);
   run.actions.clearImageSetChoices(mixed);
   assert.deepEqual(run.result()["set_001"]?.deletedImages, ["C:/lib/b.jpg"]);
   assert.equal(run.result()["set_001"]?.seen, false);
});

test("clearing all choices resets every set", () => {
   const groups = [twoSet, makeSet("set_002", 5, [image("c.jpg")])];
   const decisions = {
      set_001: { deletedImages: ["C:/lib/a.jpg"], seen: true },
      set_002: { deletedImages: ["C:/lib/c.jpg"], seen: true },
   };
   const run = bind(groups, decisions);
   run.actions.clearAllChoices();
   assert.deepEqual(run.result(), {});
});
