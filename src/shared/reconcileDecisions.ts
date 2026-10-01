import type { Decisions } from "./types.js";

export interface DecisionSetSnapshot {
   id: string;
   images: { originalPath: string; size: number; modifiedAt: number; changedAt?: number }[];
}

/** Carry choices only for the same unchanged files, even when grouping or set IDs change. */
export const reconcileDecisions = (previous: DecisionSetSnapshot[], next: DecisionSetSnapshot[], decisions: Decisions): Decisions => {
   const choices = new Map<string, { size: number; modifiedAt: number; changedAt?: number; marked: boolean }>();
   for (const set of previous) {
      const decision = decisions[set.id];
      if (decision === undefined) continue;
      const marked = new Set(decision.deletedImages);
      for (const image of set.images) choices.set(image.originalPath, { ...image, marked: marked.has(image.originalPath) });
   }
   const result: Decisions = {};
   for (const set of next) {
      const deletedImages: string[] = [];
      let hasChoice = false;
      for (const image of set.images) {
         const choice = choices.get(image.originalPath);
         if (
            choice?.size !== image.size ||
            choice.modifiedAt !== image.modifiedAt ||
            (choice.changedAt !== undefined && choice.changedAt !== 0 && choice.changedAt !== image.changedAt)
         )
            continue;
         hasChoice = true;
         if (choice.marked) deletedImages.push(image.originalPath);
      }
      if (hasChoice) result[set.id] = { deletedImages };
   }
   return result;
};
