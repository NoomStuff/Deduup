import { useCallback, useEffect, useRef, useState } from "react";
import type { Decisions, FileActionStatus, ImageSet, LoadDataResult } from "../../shared/types.js";
import type { DecisionSetSnapshot } from "../../shared/reconcileDecisions.js";
import type { ScanWarnings } from "../appTypes.js";
import { getResumeIndex } from "../reviewModel.js";
import type { NotificationInput } from "./useNotifications.js";

interface LibrarySyncOptions {
   /** The live review position anchors background updates to the same image. */
   currentIndex: number;
   /** App passes its stable React setters for navigation and overlay state. */
   setCurrentIndex: (index: number) => void;
   setSelectedImagePath: (path: string | null) => void;
   setIsStartupOpen: (open: boolean) => void;
   replaceDecisions: (decisions: Decisions) => void;
   reconcileHistory: (previous: DecisionSetSnapshot[], next: DecisionSetSnapshot[]) => void;
   notify: (notification: NotificationInput) => void;
   reportError: (title: string, error: unknown, fallback: string) => void;
}

type ApplyScanResult = (result: LoadDataResult, clearFileResults: () => void) => void;

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
   const [groups, setGroups] = useState<ImageSet[]>([]);
   const [loading, setLoading] = useState(true);
   const [hydrated, setHydrated] = useState(false);
   const [scanId, setScanId] = useState<string | null>(null);
   const [duplicateFolderHasContent, setDuplicateFolderHasContent] = useState(false);
   const [lastFileAction, setLastFileAction] = useState<FileActionStatus>("idle");
   const [duplicateFolderPath, setDuplicateFolderPath] = useState<string | null>(null);
   const [scanRoot, setScanRoot] = useState<string | null>(null);
   const [scanWarnings, setScanWarnings] = useState<ScanWarnings | null>(null);
   const [scanWarningsDismissed, setScanWarningsDismissed] = useState(false);

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
            setGroups(result.groups);
            setScanId(result.scanId);
            setCurrentIndex(anchoredIndex >= 0 ? anchoredIndex : Math.max(0, Math.min(previous.currentIndex, result.groups.length - 1)));
            setDuplicateFolderHasContent(result.duplicateFolderHasContent);
            setDuplicateFolderPath(result.duplicateFolderPath);
            setLastFileAction(result.lastFileAction);
            setScanWarnings(result.scanWarningCount > 0 ? { count: result.scanWarningCount, paths: result.scanWarningPaths } : null);
         }),
      [reconcileHistory, setCurrentIndex]
   );

   const refreshFileState = useCallback((result: LoadDataResult): void => {
      setGroups(result.groups);
      setDuplicateFolderHasContent(result.duplicateFolderHasContent);
      setDuplicateFolderPath(result.duplicateFolderPath);
      setLastFileAction(result.lastFileAction);
   }, []);
   const applyScanResult = useCallback(
      (result: LoadDataResult, clearFileResults: () => void): void => {
         setHydrated(true);
         setScanId(result.scanId);
         setGroups(result.groups);
         replaceDecisions(result.decisions);
         setScanRoot(result.scanRoot);
         setDuplicateFolderPath(result.duplicateFolderPath);
         setCurrentIndex(0);
         setSelectedImagePath(null);
         setIsStartupOpen(false);
         clearFileResults();
         setDuplicateFolderHasContent(result.duplicateFolderHasContent);
         setLastFileAction(result.lastFileAction);
         setScanWarnings(result.scanWarningCount > 0 ? { count: result.scanWarningCount, paths: result.scanWarningPaths } : null);
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
      [notify, replaceDecisions, setScanRoot, setCurrentIndex, setSelectedImagePath, setIsStartupOpen]
   );

   return {
      groups,
      loading,
      hydrated,
      scanId,
      duplicateFolderHasContent,
      lastFileAction,
      duplicateFolderPath,
      scanRoot,
      scanWarnings,
      scanWarningsDismissed,
      setScanWarningsDismissed,
      refreshFileState,
      applyScanResult,
      bootstrap: {
         notify,
         replaceDecisions,
         reportError,
         setScanRoot,
         setCurrentIndex,
         setHydrated,
         setScanId,
         setGroups,
         setDuplicateFolderPath,
         setDuplicateFolderHasContent,
         setLastFileAction,
         setScanWarnings,
         setLoading,
      },
   };
};

/** File actions receive refreshFileState before supplying their clearResults callback. */
export const useApplyScanResult = (applyScanResult: ApplyScanResult, clearFileResults: () => void) =>
   useCallback((result: LoadDataResult): void => applyScanResult(result, clearFileResults), [applyScanResult, clearFileResults]);

/** Bootstrap stays after the scan event bridges at the original call site. */
export const useLibraryBootstrap = ({
   notify,
   replaceDecisions,
   reportError,
   setScanRoot,
   setCurrentIndex,
   setHydrated,
   setScanId,
   setGroups,
   setDuplicateFolderPath,
   setDuplicateFolderHasContent,
   setLastFileAction,
   setScanWarnings,
   setLoading,
}: ReturnType<typeof useLibrarySync>["bootstrap"]): void => {
   useEffect(() => {
      const api = window.imageDeduplicator;
      api.loadData()
         .then((result) => {
            setHydrated(true);
            setScanId(result.scanId);
            setGroups(result.groups);
            replaceDecisions(result.decisions);
            setScanRoot(result.scanRoot);
            setDuplicateFolderPath(result.duplicateFolderPath);
            setCurrentIndex(getResumeIndex(result.groups, result.currentSetId));
            setDuplicateFolderHasContent(result.duplicateFolderHasContent);
            setLastFileAction(result.lastFileAction);
            setScanWarnings(result.scanWarningCount > 0 ? { count: result.scanWarningCount, paths: result.scanWarningPaths } : null);
         })
         .catch((unknownError: unknown) => reportError("Couldn't load the review", unknownError, "Failed to load duplicate sets"))
         .finally(() => setLoading(false));
   }, [
      notify,
      replaceDecisions,
      reportError,
      setScanRoot,
      setCurrentIndex,
      setHydrated,
      setScanId,
      setGroups,
      setDuplicateFolderPath,
      setDuplicateFolderHasContent,
      setLastFileAction,
      setScanWarnings,
      setLoading,
   ]);
};
