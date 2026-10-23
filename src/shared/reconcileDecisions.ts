import type { Decisions } from "./types.js";

export interface DecisionSetSnapshot {
   id: string;
   images: { originalPath: string; hash: string; size: number; modifiedAt: number; changedAt?: number }[];
}

/** Carry choices only for the same unchanged files, even when grouping or set IDs change. */
export const reconcileDecisions = (previous: DecisionSetSnapshot[], next: DecisionSetSnapshot[], decisions: Decisions): Decisions => {
   const choices = new Map<string, { hash: string; size: number; modifiedAt: number; marked: boolean }>();
   for (const set of previous) {
      const decision = decisions[set.id];
      if (decision === undefined) continue;
      const marked = new Set(decision.deletedImages);
      for (const image of set.images)
         choices.set(image.originalPath, { hash: image.hash, size: image.size, modifiedAt: image.modifiedAt, marked: marked.has(image.originalPath) });
   }
   const result: Decisions = {};
   for (const set of next) {
      const deletedImages: string[] = [];
      let hasChoice = false;
      for (const image of set.images) {
         const choice = choices.get(image.originalPath);
         // Compare scan evidence as well as size and modified time. Creation time
         // must not count: the app's own moves re-create files (copy fallback,
         // hardlink bookkeeping), which changes it without changing the image,
         // and a discard must survive a move-and-restore round trip.
         if (choice?.size !== image.size || choice.modifiedAt !== image.modifiedAt || choice.hash !== image.hash) continue;
         hasChoice = true;
         if (choice.marked) deletedImages.push(image.originalPath);
      }
      if (hasChoice) result[set.id] = { deletedImages };
   }
   return result;
};
