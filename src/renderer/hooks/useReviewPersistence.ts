import { useEffect, useRef } from "react";
import type { Decisions, ImageSet } from "../../shared/types.js";

interface ReviewPersistenceOptions {
   loading: boolean;
   scanId: string | null;
   decisions: Decisions;
   currentSet: ImageSet | null;
   reportError: (title: string, error: unknown, fallback: string) => void;
}

/** Debounced autosave of the review choices and the position inside the review. */
export const useReviewPersistence = ({ loading, scanId, decisions, currentSet, reportError }: ReviewPersistenceOptions): void => {
   const currentScanId = useRef(scanId);
   currentScanId.current = scanId;
   useEffect(() => {
      const api = window.imageDeduplicator;
      if (loading || scanId === null) return undefined;

      const timeout = window.setTimeout(() => {
         void api.saveDecisions(decisions, scanId).catch((error: unknown) => {
            if (currentScanId.current !== scanId) return;
            reportError("Choices weren’t saved", error, "Failed to save choices");
         });
      }, 100);

      return () => window.clearTimeout(timeout);
   }, [decisions, loading, scanId, reportError]);

   useEffect(() => {
      const api = window.imageDeduplicator;
      if (loading || scanId === null || currentSet === null) return undefined;
      const timeout = window.setTimeout(() => {
         void api.saveCurrentSet(currentSet.id, scanId).catch((error: unknown) => {
            if (currentScanId.current !== scanId) return;
            reportError("Position wasn’t saved", error, "Failed to save the current set");
         });
      }, 150);
      return () => window.clearTimeout(timeout);
   }, [currentSet, loading, scanId, reportError]);
};
