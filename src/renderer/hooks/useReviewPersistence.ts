import { useEffect, useRef, useState } from "react";
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
   const [refreshing, setRefreshing] = useState(false);
   const refreshingRef = useRef(false);
   // A refresh commits its scan ID before its async snapshot reaches React.
   // Keep edits local across that interval, then save the reconciled choices.
   useEffect(
      () =>
         window.imageDeduplicator.onLibraryRefreshing((active) => {
            refreshingRef.current = active;
            setRefreshing(active);
         }),
      []
   );
   const currentScanId = useRef(scanId);
   currentScanId.current = scanId;
   useEffect(() => {
      const api = window.imageDeduplicator;
      if (loading || refreshing || scanId === null) return undefined;

      const timeout = window.setTimeout(() => {
         if (refreshingRef.current) return;
         void api.saveDecisions(decisions, scanId).catch((error: unknown) => {
            if (refreshingRef.current || currentScanId.current !== scanId) return;
            reportError("Choices weren't saved", error, "Failed to save choices");
         });
      }, 100);

      return () => window.clearTimeout(timeout);
   }, [decisions, loading, refreshing, scanId, reportError]);

   useEffect(() => {
      const api = window.imageDeduplicator;
      if (loading || refreshing || scanId === null || currentSet === null) return undefined;
      const timeout = window.setTimeout(() => {
         if (refreshingRef.current) return;
         void api.saveCurrentSet(currentSet.id, scanId).catch((error: unknown) => {
            if (refreshingRef.current || currentScanId.current !== scanId) return;
            reportError("Position wasn't saved", error, "Failed to save the current set");
         });
      }, 150);
      return () => window.clearTimeout(timeout);
   }, [currentSet, loading, refreshing, scanId, reportError]);
};
