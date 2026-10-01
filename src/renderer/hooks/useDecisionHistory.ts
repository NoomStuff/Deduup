import { useCallback, useReducer } from "react";
import type { Decisions } from "../../shared/types.js";
import { reconcileDecisions } from "../../shared/reconcileDecisions.js";
import type { DecisionSetSnapshot } from "../../shared/reconcileDecisions.js";

const historyLimit = 30;

interface HistoryState {
   decisions: Decisions;
   undoStack: Decisions[];
   redoStack: Decisions[];
}

type HistoryEvent =
   | {
        type: "update";
        updater: (current: Decisions) => Decisions;
     }
   | { type: "replace"; decisions: Decisions }
   | { type: "undo" }
   | { type: "redo" }
   | { type: "clearHistory" }
   | { type: "reconcile"; previous: DecisionSetSnapshot[]; next: DecisionSetSnapshot[] };

const pushUndo = (state: HistoryState): Pick<HistoryState, "undoStack" | "redoStack"> => ({
   undoStack: [state.decisions, ...state.undoStack].slice(0, historyLimit),
   redoStack: [],
});

/** Exported for unit tests; use the hook below in components. */
export const decisionHistoryReducer = (state: HistoryState, event: HistoryEvent): HistoryState => {
   switch (event.type) {
      case "update": {
         const next = event.updater(state.decisions);
         if (next === state.decisions) return state;
         return { ...state, decisions: next, ...pushUndo(state) };
      }
      case "replace":
         return { decisions: event.decisions, undoStack: [], redoStack: [] };
      case "undo": {
         const [previous, ...remaining] = state.undoStack;
         if (previous === undefined) return state;
         return { decisions: previous, undoStack: remaining, redoStack: [state.decisions, ...state.redoStack].slice(0, historyLimit) };
      }
      case "redo": {
         const [next, ...remaining] = state.redoStack;
         if (next === undefined) return state;
         return { decisions: next, undoStack: [state.decisions, ...state.undoStack].slice(0, historyLimit), redoStack: remaining };
      }
      case "clearHistory":
         return { ...state, undoStack: [], redoStack: [] };
      case "reconcile": {
         const rebase = (choices: Decisions): Decisions => reconcileDecisions(event.previous, event.next, choices);
         return { decisions: rebase(state.decisions), undoStack: state.undoStack.map(rebase), redoStack: state.redoStack.map(rebase) };
      }
   }
};

export const useDecisionHistory = (): {
   decisions: Decisions;
   canUndo: boolean;
   canRedo: boolean;
   updateDecisions: (updater: (current: Decisions) => Decisions) => void;
   replaceDecisions: (decisions: Decisions) => void;
   clearHistory: () => void;
   undo: () => void;
   redo: () => void;
   reconcileHistory: (previous: DecisionSetSnapshot[], next: DecisionSetSnapshot[]) => void;
} => {
   const [state, dispatch] = useReducer(decisionHistoryReducer, { decisions: {}, undoStack: [], redoStack: [] });

   const updateDecisions = useCallback((updater: (current: Decisions) => Decisions): void => dispatch({ type: "update", updater }), []);
   const replaceDecisions = useCallback((decisions: Decisions): void => dispatch({ type: "replace", decisions }), []);
   const clearHistory = useCallback((): void => dispatch({ type: "clearHistory" }), []);
   const undo = useCallback((): void => dispatch({ type: "undo" }), []);
   const redo = useCallback((): void => dispatch({ type: "redo" }), []);
   const reconcileHistory = useCallback(
      (previous: DecisionSetSnapshot[], next: DecisionSetSnapshot[]): void => dispatch({ type: "reconcile", previous, next }),
      []
   );

   return {
      decisions: state.decisions,
      canUndo: state.undoStack.length > 0,
      canRedo: state.redoStack.length > 0,
      updateDecisions,
      replaceDecisions,
      clearHistory,
      undo,
      redo,
      reconcileHistory,
   };
};
