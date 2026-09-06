import assert from "node:assert/strict";
import test from "node:test";
import { decisionHistoryReducer } from "../dist-test/renderer/hooks/useDecisionHistory.js";

const empty = { decisions: {}, undoStack: [], redoStack: [] };
const addOne = (state) =>
   decisionHistoryReducer(state, {
      type: "update",
      updater: (current) => ({ ...current, [`set_${Object.keys(current).length + 1}`]: { deletedImages: [], seen: true } }),
   });

test("an update pushes history and clears redo", () => {
   const one = addOne(empty);
   const two = addOne(one);
   assert.deepEqual(Object.keys(two.decisions), ["set_1", "set_2"]);
   assert.equal(two.undoStack.length, 2);
   assert.equal(two.redoStack.length, 0);

   const undone = decisionHistoryReducer(two, { type: "undo" });
   assert.deepEqual(Object.keys(undone.decisions), ["set_1"]);
   assert.equal(undone.redoStack.length, 1);

   // A fresh update after an undo must drop the redo branch.
   const updatedAgain = addOne(undone);
   assert.deepEqual(Object.keys(updatedAgain.decisions), ["set_1", "set_2"]);
   assert.equal(updatedAgain.redoStack.length, 0);
   assert.equal(updatedAgain.undoStack.length, 2);
});

test("an update that changes nothing is ignored", () => {
   const untouched = decisionHistoryReducer(empty, { type: "update", updater: (current) => current });
   assert.equal(untouched, empty);
});

test("undo and redo walk the stacks", () => {
   const one = addOne(empty);
   const two = addOne(one);

   const afterUndo = decisionHistoryReducer(two, { type: "undo" });
   assert.deepEqual(Object.keys(afterUndo.decisions), ["set_1"]);
   assert.deepEqual(Object.keys(afterUndo.redoStack[0]), ["set_1", "set_2"]);

   const afterRedo = decisionHistoryReducer(afterUndo, { type: "redo" });
   assert.deepEqual(Object.keys(afterRedo.decisions), ["set_1", "set_2"]);

   const bottomedOut = decisionHistoryReducer(afterRedo, { type: "undo" });
   const again = decisionHistoryReducer(bottomedOut, { type: "undo" });
   const onceMore = decisionHistoryReducer(again, { type: "undo" });
   assert.deepEqual(Object.keys(onceMore.decisions), []);
   assert.equal(onceMore, again);
});

test("replacing decisions resets the history", () => {
   const one = addOne(empty);
   const replaced = decisionHistoryReducer(one, { type: "replace", decisions: { set_009: { deletedImages: [], seen: false } } });
   assert.deepEqual(Object.keys(replaced.decisions), ["set_009"]);
   assert.equal(replaced.undoStack.length, 0);
   assert.equal(replaced.redoStack.length, 0);
});

test("clearing history keeps the current decisions", () => {
   const one = addOne(empty);
   const cleared = decisionHistoryReducer(one, { type: "clearHistory" });
   assert.deepEqual(Object.keys(cleared.decisions), ["set_1"]);
   assert.equal(cleared.undoStack.length, 0);
   assert.equal(cleared.redoStack.length, 0);
});

test("history is capped so memory stays bounded", () => {
   let state = empty;
   for (let index = 0; index < 40; index += 1) {
      state = addOne(state);
   }
   assert.equal(state.undoStack.length, 30);

   for (let index = 0; index < 40; index += 1) {
      state = decisionHistoryReducer(state, { type: "undo" });
   }
   // Thirty undos rewind to the tenth update; the rest bottom out.
   assert.equal(Object.keys(state.decisions).length, 10);
   assert.equal(state.redoStack.length, 30);
   assert.equal(decisionHistoryReducer(state, { type: "undo" }), state);
});
