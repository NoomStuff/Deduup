import { useCallback, useState } from "react";
import type { Decisions } from "../../shared/types.js";

const historyLimit = 30;

interface DecisionHistory {
   decisions: Decisions;
   canUndo: boolean;
   canRedo: boolean;
   updateDecisions: (updater: (current: Decisions) => Decisions) => void;
   replaceDecisions: (decisions: Decisions) => void;
   clearHistory: () => void;
   undo: () => void;
   redo: () => void;
}

export const useDecisionHistory = (): DecisionHistory => {
   const [decisions, setDecisions] = useState<Decisions>({});
   const [undoStack, setUndoStack] = useState<Decisions[]>([]);
   const [redoStack, setRedoStack] = useState<Decisions[]>([]);

   const updateDecisions = useCallback((updater: (current: Decisions) => Decisions): void => {
      setDecisions((current) => {
         const next = updater(current);
         if (next !== current) {
            setUndoStack((history) => [current, ...history].slice(0, historyLimit));
            setRedoStack([]);
         }
         return next;
      });
   }, []);

   const replaceDecisions = useCallback((next: Decisions): void => {
      setDecisions(next);
      setUndoStack([]);
      setRedoStack([]);
   }, []);

   const clearHistory = useCallback((): void => {
      setUndoStack([]);
      setRedoStack([]);
   }, []);

   const undo = useCallback((): void => {
      setUndoStack((history) => {
         const [previous, ...remaining] = history;
         if (previous !== undefined) {
            setDecisions((current) => {
               setRedoStack((redoHistory) => [current, ...redoHistory].slice(0, historyLimit));
               return previous;
            });
         }
         return remaining;
      });
   }, []);

   const redo = useCallback((): void => {
      setRedoStack((history) => {
         const [next, ...remaining] = history;
         if (next !== undefined) {
            setDecisions((current) => {
               setUndoStack((undoHistory) => [current, ...undoHistory].slice(0, historyLimit));
               return next;
            });
         }
         return remaining;
      });
   }, []);

   return {
      decisions,
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
      updateDecisions,
      replaceDecisions,
      clearHistory,
      undo,
      redo,
   };
};
