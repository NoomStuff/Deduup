import { useEffect } from "react";
import type { Decisions, ImageSet } from "../../shared/types.js";

interface ReviewPersistenceOptions {
   loading: boolean;
   decisions: Decisions;
   currentSet: ImageSet | null;
   reportError: (title: string, error: unknown, fallback: string) => void;
}

/** Debounced autosave of the review choices and the position inside the review. */
export const useReviewPersistence = ({ loading, decisions, currentSet, reportError }: ReviewPersistenceOptions): void => {
   useEffect(() => {
      const api = window.imageDeduplicator;
      if (loading) return undefined;

      const timeout = window.setTimeout(() => {
         void api.saveDecisions(decisions).catch((error: unknown) => {
            reportError("Choices weren’t saved", error, "Failed to save choices");
         });
      }, 100);

      return () => window.clearTimeout(timeout);
   }, [decisions, loading, reportError]);

   useEffect(() => {
      const api = window.imageDeduplicator;
      if (loading || currentSet === null) return undefined;
      const timeout = window.setTimeout(() => {
         void api.saveCurrentSet(currentSet.id).catch((error: unknown) => {
            reportError("Position wasn’t saved", error, "Failed to save the current set");
         });
      }, 150);
      return () => window.clearTimeout(timeout);
   }, [currentSet, loading, reportError]);
};
