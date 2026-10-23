import { useCallback, useEffect, useRef, useState } from "react";
import type { Decisions, ImageSet, LoadDataResult } from "../../shared/types.js";
import type { DecisionSetSnapshot } from "../../shared/reconcileDecisions.js";
import type { ScanWarnings } from "../appTypes.js";
import { getResumeIndex } from "../reviewModel.js";
import type { NotificationInput } from "./useNotifications.js";

interface LibrarySyncOptions {
   currentIndex: number;
   setCurrentIndex: (index: number) => void;
   setSelectedImagePath: (path: string | null) => void;
   setIsStartupOpen: (open: boolean) => void;
   replaceDecisions: (decisions: Decisions) => void;
   reconcileHistory: (previous: DecisionSetSnapshot[], next: DecisionSetSnapshot[]) => void;
   notify: (notification: NotificationInput) => void;
   reportError: (title: string, error: unknown, fallback: string) => void;
}

type ApplyScanResult = (result: LoadDataResult, clearFileResults: () => void) => void;
const emptyGroups: ImageSet[] = [];

export const useLibrarySync = ({
   currentIndex,
   setCurrentIndex,
   setSelectedImagePath,
   setIsStartupOpen,
   replaceDecisions,
   reconcileHistory,
   notify,
   reportError,
}: LibrarySyncOptions) => {
   // One main-process snapshot owns library metadata. Live choices and undo
   // remain in useDecisionHistory, including edits made during a refresh.
   const [library, setLibrary] = useState<LoadDataResult | null>(null);
   const [loading, setLoading] = useState(true);
   const [scanWarningsDismissed, setScanWarningsDismissed] = useState(false);
   const groups = library?.groups ?? emptyGroups;
   const scanRoot = library?.scanRoot ?? null;
   const librarySessionRef = useRef({ groups, currentIndex, scanRoot });
   librarySessionRef.current = { groups, currentIndex, scanRoot };

   useEffect(
      () =>
         window.imageDeduplicator.onLibraryUpdate((result) => {
            const previous = librarySessionRef.current;
            if (result.scanRoot !== previous.scanRoot) return;
            const anchor = previous.groups[previous.currentIndex]?.images[0]?.originalPath;
            const anchoredIndex = result.groups.findIndex((group) => group.images.some((image) => image.originalPath === anchor));
            reconcileHistory(previous.groups, result.groups);
            setLibrary(result);
            setCurrentIndex(anchoredIndex >= 0 ? anchoredIndex : Math.max(0, Math.min(previous.currentIndex, result.groups.length - 1)));
         }),
      [reconcileHistory, setCurrentIndex]
   );

   const applyLoadedResult = useCallback(
      (result: LoadDataResult): void => {
         setLibrary(result);
         replaceDecisions(result.decisions);
         setCurrentIndex(getResumeIndex(result.groups, result.currentSetId));
      },
      [replaceDecisions, setCurrentIndex]
   );
   const refreshFileState = useCallback((result: LoadDataResult): void => setLibrary(result), []);
   const applyScanResult = useCallback(
      (result: LoadDataResult, clearFileResults: () => void): void => {
         applyLoadedResult(result);
         setSelectedImagePath(null);
         setIsStartupOpen(false);
         clearFileResults();
         setScanWarningsDismissed(false);
         notify({
            tone: result.groups.length === 0 ? "info" : "success",
            title: result.groups.length === 0 ? "Scan complete" : "Duplicate sets ready",
            message:
               result.groups.length === 0
                  ? "No matching image sets were found."
                  : `Found ${result.groups.length} set${result.groups.length === 1 ? "" : "s"} of similar images.`,
         });
      },
      [applyLoadedResult, notify, setSelectedImagePath, setIsStartupOpen]
   );

   const scanWarnings: ScanWarnings | null =
      library !== null && library.scanWarningCount > 0 ? { count: library.scanWarningCount, paths: library.scanWarningPaths } : null;
   return {
      groups,
      loading,
      hydrated: library !== null,
      scanId: library?.scanId ?? null,
      duplicateFolderHasContent: library?.duplicateFolderHasContent ?? false,
      lastFileAction: library?.lastFileAction ?? "idle",
      duplicateFolderPath: library?.duplicateFolderPath ?? null,
      scanRoot,
      scanWarnings,
      scanWarningsDismissed,
      setScanWarningsDismissed,
      refreshFileState,
      applyScanResult,
      bootstrap: { applyLoadedResult, reportError, setLoading },
   };
};

/** File actions receive refreshFileState before supplying their clearResults callback. */
export const useApplyScanResult = (applyScanResult: ApplyScanResult, clearFileResults: () => void) =>
   useCallback((result: LoadDataResult): void => applyScanResult(result, clearFileResults), [applyScanResult, clearFileResults]);

/** Attach after the scan event bridges so startup rehash progress is visible. */
export const useLibraryBootstrap = ({ applyLoadedResult, reportError, setLoading }: ReturnType<typeof useLibrarySync>["bootstrap"]): void => {
   useEffect(() => {
      let active = true;
      void window.imageDeduplicator
         .loadData()
         .then((result) => {
            if (active) applyLoadedResult(result);
         })
         .catch((error: unknown) => {
            if (active) reportError("Couldn't load the review", error, "Failed to load duplicate sets");
         })
         .finally(() => {
            if (active) setLoading(false);
         });
      return () => {
         active = false;
      };
   }, [applyLoadedResult, reportError, setLoading]);
};
