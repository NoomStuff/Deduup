import assert from "node:assert/strict";
import test from "node:test";
import { reconcileDecisions } from "../src/shared/reconcileDecisions.ts";
import { decisionHistoryReducer } from "../src/renderer/hooks/useDecisionHistory.ts";

const a = { originalPath: "a.jpg", size: 10, modifiedAt: 1 };
const b = { originalPath: "b.jpg", size: 20, modifiedAt: 2 };
const c = { originalPath: "c.jpg", size: 30, modifiedAt: 3 };
const previous = [{ id: "old", images: [a, b, c] }];

test("library refresh carries unchanged choices across regrouping and drops changed or removed candidates", () => {
   const next = [{ id: "new", images: [a, { ...b, modifiedAt: 4 }] }];
   const choices = { old: { deletedImages: [a.originalPath, b.originalPath, c.originalPath] } };
   assert.deepEqual(reconcileDecisions(previous, next, choices), { new: { deletedImages: [a.originalPath] } });
   assert.deepEqual(reconcileDecisions(previous, [{ id: "changed", images: [{ ...a, size: 11 }] }], choices), {});
});

test("explicit keep-all intent survives refresh without inventing choices for untouched sets", () => {
   const next = [
      { id: "new", images: [a, b] },
      { id: "untouched", images: [{ ...c, originalPath: "new.jpg" }] },
   ];
   assert.deepEqual(reconcileDecisions(previous, next, { old: { deletedImages: [] } }), { new: { deletedImages: [] } });
});

test("refresh rebases undo history so undo cannot restore a candidate for a changed file", () => {
   const state = { decisions: { old: { deletedImages: [a.originalPath] } }, undoStack: [{ old: { deletedImages: [b.originalPath] } }], redoStack: [] };
   const next = [{ id: "new", images: [a, { ...b, size: 99 }] }];
   const refreshed = decisionHistoryReducer(state, { type: "reconcile", previous, next });
   assert.deepEqual(refreshed.decisions, { new: { deletedImages: [a.originalPath] } });
   const undone = decisionHistoryReducer(refreshed, { type: "undo" });
   assert.deepEqual(undone.decisions, { new: { deletedImages: [] } });
});
