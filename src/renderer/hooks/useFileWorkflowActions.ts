import { useEffect, useState } from "react";
import type { Decisions, LoadDataResult, PatchResult } from "../../shared/types.js";
import type { NotificationInput } from "./useNotifications.js";

interface FileWorkflowActionsOptions {
   decisions: Decisions;
   clearHistory: () => void;
   notify: (notification: NotificationInput) => void;
   onRefresh: (result: LoadDataResult) => void;
   reportError: (title: string, error: unknown, fallback: string) => void;
}

export const useFileWorkflowActions = ({ decisions, clearHistory, notify, onRefresh, reportError }: FileWorkflowActionsOptions) => {
   const [patchResult, setPatchResult] = useState<PatchResult | null>(null);
   const [restoreResult, setRestoreResult] = useState<PatchResult | null>(null);
   const [isApplying, setIsApplying] = useState(false);
   const [isTrashing, setIsTrashing] = useState(false);
   const [isRestoring, setIsRestoring] = useState(false);

   useEffect(() => setPatchResult(null), [decisions]);
   const clearResults = (): void => {
      setPatchResult(null);
      setRestoreResult(null);
   };

   const apply = async (): Promise<void> => {
      const api = window.imageDeduplicator;
      setIsApplying(true);
      setRestoreResult(null);
      try {
         const result = await api.applyPatch(decisions);
         setPatchResult(result);
         onRefresh(await api.loadData());
         clearHistory();
         notify({
            tone: result.errors.length > 0 ? "warning" : "success",
            title: result.errors.length > 0 ? "Move finished with errors" : "Marked images moved",
            message: `Moved ${result.moved.length}, skipped ${result.skipped.length}, errors ${result.errors.length}.`,
         });
      } catch (error: unknown) {
         reportError("Couldn’t move marked images", error, "Failed to move marked images");
      } finally {
         setIsApplying(false);
      }
   };

   const trash = async (): Promise<void> => {
      const api = window.imageDeduplicator;
      setIsTrashing(true);
      try {
         await api.trashDuplicateFolder();
         onRefresh(await api.loadData());
         setRestoreResult(null);
         notify({ tone: "success", title: "Duplicates recycled", message: "The app-managed duplicate folder was moved to the Recycle Bin." });
      } catch (error: unknown) {
         reportError("Couldn’t recycle duplicates", error, "Failed to recycle moved duplicates");
      } finally {
         setIsTrashing(false);
      }
   };

   const restore = async (): Promise<void> => {
      const api = window.imageDeduplicator;
      setIsRestoring(true);
      try {
         const result = await api.restoreDuplicateFolder();
         setRestoreResult(result);
         setPatchResult(null);
         onRefresh(await api.loadData());
         notify({
            tone: result.errors.length > 0 ? "warning" : "success",
            title: result.errors.length > 0 ? "Restore finished with errors" : "Images restored",
            message: `Restored ${result.moved.length}, skipped ${result.skipped.length}, errors ${result.errors.length}.`,
         });
      } catch (error: unknown) {
         reportError("Couldn’t restore images", error, "Failed to restore moved images");
      } finally {
         setIsRestoring(false);
      }
   };

   return { apply, clearResults, isApplying, isRestoring, isTrashing, patchResult, restore, restoreResult, trash };
};
