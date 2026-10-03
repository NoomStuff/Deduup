import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import type { AvailableUpdate, FileActionStatus, ImageSet, ImageItem, LoadDataResult, UpdateStatus } from "../shared/types.js";
import type { ConfirmAction, ImageCaptionMode, ScanWarnings, TravelDirection } from "./appTypes.js";
import type { Commands, ShortcutOverrides } from "./commands.js";
import { loadShortcutOverrides, saveShortcutOverrides, ShortcutsContext, useCommands } from "./commands.js";
import { AboutPanel } from "./components/AboutPanel.js";
import { CompareOverlay } from "./components/CompareOverlay.js";
import { ConfirmDialog } from "./components/ConfirmDialog.js";
import { FinalReview } from "./components/FinalReview.js";
import { HelpPanel } from "./components/HelpPanel.js";
import { ImagePreviewOverlay } from "./components/ImagePreviewOverlay.js";
import { MenuBar } from "./components/MenuBar.js";
import { NotificationCenter } from "./components/NotificationCenter.js";
import { ReviewContextMenu } from "./components/ReviewContextMenu.js";
import { ReviewHintBar } from "./components/ReviewHintBar.js";
import { ReviewWorkspace } from "./components/ReviewWorkspace.js";
import { SettingsPanel } from "./components/SettingsPanel.js";
import { TitleBar, type UpdateChipActions } from "./components/TitleBar.js";
import { TooltipBubble } from "./components/TooltipBubble.js";
import { LoadingScreen, ScanWarningsBanner, ScanningScreen, StartupScreen } from "./components/AppStatusScreens.js";
import { useCompareController } from "./hooks/useCompareController.js";
import { useDecisionHistory } from "./hooks/useDecisionHistory.js";
import { useFileWorkflowActions } from "./hooks/useFileWorkflowActions.js";
import { useFilmstrip } from "./hooks/useFilmstrip.js";
import { useFolderSelection } from "./hooks/useFolderSelection.js";
import { useNotifications } from "./hooks/useNotifications.js";
import { usePreference, preferenceKeys, useEnumPreference } from "./hooks/usePreference.js";
import { usePreviewPreloader } from "./hooks/usePreviewPreloader.js";
import { useReviewContextMenu } from "./hooks/useReviewContextMenu.js";
import { useReviewPersistence } from "./hooks/useReviewPersistence.js";
import { useScanController } from "./hooks/useScanController.js";
import { useTooltip } from "./hooks/useTooltip.js";
import { countBandDiscardOverrides, countBandSets, createReviewActions } from "./reviewActions.js";
import {
   createConfirmAction,
   emptyImageSetDecision,
   getDecision,
   getDuplicatePreview,
   getFolderName,
   getFileWorkflowState,
   getMovePreview,
   getResumeIndex,
   getSetNumber,
   getSimilarityBands,
} from "./reviewModel.js";

export const App = () => {
   const [groups, setGroups] = useState<ImageSet[]>([]);
   const {
      decisions,
      canUndo,
      canRedo,
      updateDecisions,
      replaceDecisions,
      clearHistory,
      reconcileHistory,
      undo: undoLastDecision,
      redo: redoLastDecision,
   } = useDecisionHistory();
   const [currentIndex, setCurrentIndex] = useState(0);
   const [loading, setLoading] = useState(true);
   const [hydrated, setHydrated] = useState(false);
   const [scanId, setScanId] = useState<string | null>(null);
   const [selectedImagePath, setSelectedImagePath] = useState<string | null>(null);
   const [previewImage, setPreviewImage] = useState<ImageItem | null>(null);
   const [isFinalReviewOpen, setIsFinalReviewOpen] = useState(false);
   const [duplicateFolderHasContent, setDuplicateFolderHasContent] = useState(false);
   const [lastFileAction, setLastFileAction] = useState<FileActionStatus>("idle");
   const [travelDirection, setTravelDirection] = useState<TravelDirection>("idle");
   const [duplicateFolderPath, setDuplicateFolderPath] = useState<string | null>(null);
   const [scanRoot, setScanRoot] = useState<string | null>(null);
   const [scanWarnings, setScanWarnings] = useState<ScanWarnings | null>(null);
   const [scanWarningsDismissed, setScanWarningsDismissed] = useState(false);
   const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
   const [menu, setMenu] = useState<string | null>(null);
   const [isSettingsOpen, setIsSettingsOpen] = useState(false);
   const [isInfoOpen, setIsInfoOpen] = useState(false);
   const [isAboutOpen, setIsAboutOpen] = useState(false);
   const [confirmMajorActions, setConfirmMajorActions] = usePreference(preferenceKeys.confirmMajorActions, true);
   const [wrapImageShelf, setWrapImageShelf] = usePreference(preferenceKeys.wrapImageShelf, true);
   const [showStartupOnLaunch, setShowStartupOnLaunch] = usePreference(preferenceKeys.showStartupOnLaunch, true);
   const [reviewHintsDismissed, setReviewHintsDismissed] = usePreference(preferenceKeys.reviewHintsDismissed, false);
   const [captions, setCaptions] = useEnumPreference<ImageCaptionMode>(preferenceKeys.imageCaptions, ["none", "names", "details"], "details");
   const [shortcutOverrides, setShortcutOverrides] = useState<ShortcutOverrides>(loadShortcutOverrides);
   const [isStartupOpen, setIsStartupOpen] = useState(showStartupOnLaunch);
   const { tooltip, hideTooltip, getTooltipProps } = useTooltip();
   const { notifications, notify, dismissNotification } = useNotifications();
   const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null);
   const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);

   useEffect(() => {
      saveShortcutOverrides(shortcutOverrides);
   }, [shortcutOverrides]);

   const currentSet = groups[currentIndex] ?? null;
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
      [reconcileHistory]
   );
   const currentDecision = currentSet === null ? emptyImageSetDecision() : getDecision(decisions, currentSet.id);
   const movePreview = useMemo(() => getMovePreview(groups, decisions), [decisions, groups]);
   const duplicatePreview = useMemo(() => getDuplicatePreview(groups, decisions), [decisions, groups]);
   const fileWorkflow = useMemo(() => getFileWorkflowState(groups, decisions), [decisions, groups]);
   const similarityBands = useMemo(() => getSimilarityBands(groups), [groups]);
   const selectedImage = currentSet?.images.find((image) => image.originalPath === selectedImagePath) ?? null;

   const reportError = useCallback(
      (title: string, unknownError: unknown, fallback: string): void => {
         notify({ tone: "error", title, message: unknownError instanceof Error ? unknownError.message : fallback });
      },
      [notify]
   );

   // One update check per launch once the app is up; failures stay silent, the
   // chip only appears when a newer release exists.
   useEffect(() => {
      if (loading) return undefined;
      let active = true;
      void window.imageDeduplicator
         .checkForUpdate()
         .then((update) => {
            if (active) setAvailableUpdate(update);
         })
         .catch(() => undefined);
      return () => {
         active = false;
      };
   }, [loading]);
   useEffect(() => window.imageDeduplicator.onUpdateStatus(setUpdateStatus), []);

   const updateActions = useMemo<UpdateChipActions>(
      () => ({
         download: () => {
            if (availableUpdate === null) return;
            void window.imageDeduplicator.downloadUpdate(availableUpdate.version).catch(() => undefined);
         },
         restart: () => {
            void window.imageDeduplicator
               .restartToUpdate()
               .catch((error: unknown) => reportError("Couldn’t apply the update", error, "Failed to restart into the update"));
         },
         release: () => {
            if (availableUpdate === null) return;
            void window.imageDeduplicator.openExternal(availableUpdate.url).catch(() => undefined);
         },
         reveal: () => {
            void window.imageDeduplicator.revealUpdateDownload().catch(() => undefined);
         },
      }),
      [availableUpdate, reportError]
   );

   const refreshFileState = useCallback((result: LoadDataResult): void => {
      setGroups(result.groups);
      setDuplicateFolderHasContent(result.duplicateFolderHasContent);
      setDuplicateFolderPath(result.duplicateFolderPath);
      setLastFileAction(result.lastFileAction);
   }, []);
   useEffect(() => window.imageDeduplicator.onLibraryError((message) => notify({ tone: "error", title: "Library update failed", message })), [notify]);
   const {
      apply: applyMoves,
      clearResults: clearFileResults,
      isApplying,
      isRestoring: isRestoringDuplicate,
      isTrashing: isTrashingDuplicate,
      moveResult,
      restore: restoreDuplicateFolder,
      restoreResult,
      trash: trashDuplicateFolder,
   } = useFileWorkflowActions({ clearHistory, notify, onRefresh: refreshFileState, reportError });
   const fileOperationActive = isApplying || isRestoringDuplicate || isTrashingDuplicate;

   const applyScanResult = useCallback(
      (result: LoadDataResult): void => {
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
      [clearFileResults, notify, replaceDecisions, setScanRoot]
   );
   const { cancelScan, isScanning, scanProgress, scanningPath, startScan } = useScanController({
      notify,
      onScanApplied: applyScanResult,
      reportError,
   });

   const reviewActive = !loading && !isScanning && !fileOperationActive && !isStartupOpen && currentSet !== null;
   usePreviewPreloader(reviewActive ? groups : [], currentIndex);

   const { isDragOver, openNewFolder, handleDragOver, handleDragLeave, handleDrop } = useFolderSelection({
      hasReview: groups.length > 0,
      confirmMajorActions,
      setConfirmAction,
      startScan,
      setIsStartupOpen,
      notify,
      reportError,
   });

   const { fade: filmstripFade, filmstripRef } = useFilmstrip({
      currentIndex,
      groupCount: groups.length,
      isScanning,
      isStartupOpen,
      loading,
      reviewActive,
   });

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
         .catch((unknownError: unknown) => reportError("Couldn’t load the review", unknownError, "Failed to load duplicate sets"))
         .finally(() => setLoading(false));
   }, [notify, replaceDecisions, reportError, setScanRoot]);

   useReviewPersistence({ loading: loading || !hydrated || isScanning || fileOperationActive, scanId, decisions, currentSet, reportError });

   useEffect(() => {
      if (currentSet === null) {
         setSelectedImagePath(null);
         return;
      }

      if (selectedImagePath !== null && !currentSet.images.some((image) => image.originalPath === selectedImagePath)) {
         setSelectedImagePath(null);
      }
   }, [currentSet, selectedImagePath]);

   // The compare controller sits above the review actions in the dependency
   // chain (goTo closes it, its keep uses the actions), so the keep callback is
   // wired through a ref once the actions exist below.
   const keepImageRef = useRef<(image: ImageItem, other: ImageItem, advance: boolean) => void>(() => undefined);
   const travelTimerRef = useRef<number | null>(null);
   const { beginCompare, closeCompare, compare, comparePick, keepCompareImage, openAdjacentCompare } = useCompareController({
      currentSet,
      onKeep: (image, other, advance) => keepImageRef.current(image, other, advance),
   });

   const goTo = useCallback(
      (index: number): void => {
         const nextIndex = Math.max(0, Math.min(groups.length - 1, index));
         if (nextIndex === currentIndex) return;
         hideTooltip();
         setTravelDirection(nextIndex > currentIndex ? "right" : "left");
         closeCompare();
         setSelectedImagePath(null);
         setCurrentIndex(nextIndex);
         // Rapid navigation must not let an older timer reset the direction
         // mid-flight, or the shelf animation restarts from the wrong side.
         if (travelTimerRef.current !== null) window.clearTimeout(travelTimerRef.current);
         travelTimerRef.current = window.setTimeout(() => {
            travelTimerRef.current = null;
            setTravelDirection("idle");
         }, 180);
      },
      [closeCompare, currentIndex, groups.length, hideTooltip]
   );

   const goToAdjacentSimilarityBand = useCallback(
      (direction: -1 | 1): void => {
         const currentBandIndex = similarityBands.findIndex((band) => band.groups.some((group) => group.index === currentIndex));
         const targetBand = similarityBands[currentBandIndex + direction];
         if (targetBand === undefined) {
            return;
         }

         let nearestIndex = targetBand.groups[0]?.index ?? null;
         for (const candidate of targetBand.groups) {
            if (nearestIndex === null || Math.abs(candidate.index - currentIndex) < Math.abs(nearestIndex - currentIndex)) {
               nearestIndex = candidate.index;
            }
         }

         if (nearestIndex !== null) {
            goTo(nearestIndex);
         }
      },
      [currentIndex, goTo, similarityBands]
   );

   const {
      autoSelectImageSet,
      autoSelectBand,
      clearAllChoices,
      clearImageSetChoices,
      clearSimilarityBandChoices,
      discardSet,
      discardBand,
      toggleImageRemoval,
      toggleOnlyImageKept,
      keepComparedImage,
   } = createReviewActions({ currentIndex, groups, goTo, updateDecisions });

   useEffect(() => {
      keepImageRef.current = (image, other, advance) => {
         if (currentSet !== null) keepComparedImage(currentSet, image, other, advance);
      };
   });

   // Band actions sweep many sets at once, so they confirm before overwriting
   // choices the user made by hand. File moves and recycling always confirm.
   const requestBandAutoselect = (imageSet: ImageSet): void => {
      autoSelectBand(imageSet);
   };

   const requestDiscardBand = (imageSet: ImageSet): void => {
      const overrides = countBandDiscardOverrides(groups, decisions, imageSet);
      if (confirmMajorActions && overrides > 0) {
         setConfirmAction({ ...createConfirmAction("discardBand", { count: countBandSets(groups, imageSet) }), setId: imageSet.id });
         return;
      }
      discardBand(imageSet);
   };

   const requestDiscardSet = (imageSet: ImageSet): void => {
      if (confirmMajorActions) {
         setConfirmAction({ ...createConfirmAction("discardSet"), setId: imageSet.id });
         return;
      }
      discardSet(imageSet);
   };

   const confirmClearAllDecisions = (): void => {
      clearAllChoices();
      clearFileResults();
      closeCompare();
      setCurrentIndex(getResumeIndex(groups, null));
   };

   const openFolder = async (folderPath: string): Promise<void> => {
      const api = window.imageDeduplicator;
      try {
         await api.openSetFolder(folderPath);
      } catch (unknownError: unknown) {
         reportError("Couldn’t open the folder", unknownError, "Failed to open the folder");
      }
   };

   const showImage = async (image: ImageItem): Promise<void> => {
      const api = window.imageDeduplicator;
      try {
         await api.showImage(image.currentPath);
      } catch (unknownError: unknown) {
         reportError("Couldn’t show the image", unknownError, "Failed to show the image");
      }
   };

   const openImage = async (image: ImageItem): Promise<void> => {
      const api = window.imageDeduplicator;
      try {
         await api.openImage(image.currentPath);
      } catch (unknownError: unknown) {
         reportError("Couldn’t open the image", unknownError, "Failed to open the image");
      }
   };

   const {
      contextMenu,
      setContextMenu,
      openImageContextMenu,
      openSetContextMenu,
      closeContextMenu,
      contextSet,
      contextImage,
      contextImageIsDeleted,
      contextOnlyImageKept,
   } = useReviewContextMenu({ groups, currentSet, decisions, selectedImage, selectImage: setSelectedImagePath, hideTooltip });

   const handleImageClick = (event: MouseEvent, image: ImageItem): void => {
      setSelectedImagePath(image.originalPath);
      if (currentSet === null) {
         return;
      }

      if (comparePick !== null && comparePick.originalPath !== image.originalPath) {
         beginCompare(image);
         return;
      }

      if (event.altKey) {
         event.preventDefault();
         beginCompare(image);
         return;
      }

      if (event.shiftKey) {
         toggleImageRemoval(currentSet, image, event.ctrlKey);
         return;
      }
   };

   const handleImageDoubleClick = (event: MouseEvent, image: ImageItem): void => {
      event.preventDefault();
      event.stopPropagation();
      previewImageOf(image);
   };

   const previewImageOf = (image: ImageItem): void => {
      if (image.sourceStatus === "missing" || image.sourceStatus === "recycledByApp") {
         notify({ tone: "warning", title: "Preview unavailable", message: `${image.file} is no longer available on disk.` });
         return;
      }
      setPreviewImage(image);
   };

   // The preview can flip through the current set, but only images a preview
   // can actually show; a lone preview (set unknown) stays alone.
   const previewImages = useMemo(() => {
      if (previewImage === null) return [];
      const previewable = currentSet?.images.filter((image) => image.sourceStatus !== "missing" && image.sourceStatus !== "recycledByApp") ?? [];
      return previewable.some((image) => image.originalPath === previewImage.originalPath) ? previewable : [previewImage];
   }, [currentSet, previewImage]);

   const keepFromFinalReview = (row: { setId: string; originalPath: string }): void => {
      const imageSet = groups.find((candidate) => candidate.id === row.setId);
      const image = imageSet?.images.find((candidate) => candidate.originalPath === row.originalPath);
      if (imageSet !== undefined && image !== undefined) toggleImageRemoval(imageSet, image, false);
   };

   // The hint bar retires itself after the first discard, so it never nags.
   const hasAnyDiscards = useMemo(() => Object.values(decisions).some((decision) => decision.deletedImages.length > 0), [decisions]);
   useEffect(() => {
      if (!reviewHintsDismissed && hasAnyDiscards) setReviewHintsDismissed(true);
   }, [hasAnyDiscards, reviewHintsDismissed, setReviewHintsDismissed]);

   const reviewCommandsActive = reviewActive && compare === null;

   // --- Command registry -----------------------------------------------------
   // Availability is re-checked at run time, so commands can never act on a
   // surface that is no longer in front of the user. Rebuilt each render;
   // useCommands reads the latest object through its ref.

   const commands: Commands = (() => {
      return {
         openFolder: {
            enabled: () => !loading && !isScanning && !fileOperationActive,
            run: () => void openNewFolder(),
         },
         startScreen: {
            enabled: () => !loading && !isScanning && !fileOperationActive,
            run: () => {
               setIsSettingsOpen(false);
               setIsInfoOpen(false);
               setIsStartupOpen(true);
            },
         },
         undo: {
            enabled: () => canUndo && !isScanning && !fileOperationActive && confirmAction === null,
            run: () => undoLastDecision(),
         },
         redo: {
            enabled: () => canRedo && !isScanning && !fileOperationActive && confirmAction === null,
            run: () => redoLastDecision(),
         },
         clearAll: {
            enabled: () => groups.length > 0 && !isScanning && !fileOperationActive,
            run: () => setConfirmAction(createConfirmAction("clearAll")),
         },
         discardSet: {
            enabled: () => reviewCommandsActive,
            run: () => {
               if (currentSet !== null) requestDiscardSet(currentSet);
            },
         },
         autoselectSet: {
            enabled: () => reviewCommandsActive,
            run: () => {
               if (currentSet !== null) autoSelectImageSet(currentSet);
            },
         },
         autoselectBand: {
            enabled: () => reviewCommandsActive,
            run: () => {
               if (currentSet !== null) requestBandAutoselect(currentSet);
            },
         },
         clearSet: {
            enabled: () => reviewCommandsActive,
            run: () => {
               if (currentSet !== null) clearImageSetChoices(currentSet);
            },
         },
         compareSelected: {
            enabled: () => reviewCommandsActive && selectedImage !== null,
            run: () => {
               if (currentSet === null || selectedImage === null) return;
               // Two images compare directly; with more, the user picks the partner.
               const availableCount = currentSet.images.filter((image) => image.sourceStatus === "available").length;
               if (availableCount > 2) beginCompare(selectedImage);
               else openAdjacentCompare(selectedImage);
            },
         },
         previewSelected: {
            enabled: () => reviewCommandsActive && selectedImage !== null,
            run: () => {
               if (selectedImage !== null) previewImageOf(selectedImage);
            },
         },
         toggleSelected: {
            enabled: () => reviewCommandsActive && selectedImage !== null,
            run: (event) => {
               if (currentSet !== null && selectedImage !== null) toggleImageRemoval(currentSet, selectedImage, event?.ctrlKey === true);
            },
         },
         toggleImageByNumber: {
            enabled: () => reviewCommandsActive,
            run: (event) => {
               const index = Number.parseInt(event?.key ?? "", 10) - 1;
               const image = currentSet?.images[index];
               if (currentSet !== null && image !== undefined) toggleImageRemoval(currentSet, image, event?.ctrlKey === true);
            },
         },
         // While a compare is open the arrows keep the shown image instead.
         previousSet: {
            enabled: () => reviewActive,
            run: () => {
               if (compare !== null && currentSet !== null) keepCompareImage(compare.left, true);
               else goTo(currentIndex - 1);
            },
         },
         nextSet: {
            enabled: () => reviewActive,
            run: () => {
               if (compare !== null && currentSet !== null) keepCompareImage(compare.right, true);
               else goTo(currentIndex + 1);
            },
         },
         previousBand: {
            enabled: () => reviewCommandsActive,
            run: () => goToAdjacentSimilarityBand(-1),
         },
         nextBand: {
            enabled: () => reviewCommandsActive,
            run: () => goToAdjacentSimilarityBand(1),
         },
         finalReview: {
            enabled: () => reviewActive && !isFinalReviewOpen,
            run: () => setIsFinalReviewOpen(true),
         },
         help: {
            enabled: () => !loading && !isScanning && !isFinalReviewOpen,
            run: () => setIsInfoOpen(true),
         },
         settings: {
            enabled: () => !loading && !isScanning && !isFinalReviewOpen,
            run: () => setIsSettingsOpen(true),
         },
         about: {
            enabled: () => !loading && !isScanning && !isFinalReviewOpen,
            run: () => {
               setIsSettingsOpen(false);
               setIsInfoOpen(false);
               setIsAboutOpen(true);
            },
         },
         releasesPage: {
            enabled: () => !loading && !isScanning && !isFinalReviewOpen,
            run: () => {
               void window.imageDeduplicator
                  .openExternal("https://github.com/NoomStuff/Deduup/releases")
                  .catch((error: unknown) => reportError("Couldn’t open the releases page", error, "Failed to open the releases page"));
            },
         },
      };
   })();

   const commandsBlocked =
      loading ||
      isScanning ||
      menu !== null ||
      contextMenu !== null ||
      confirmAction !== null ||
      previewImage !== null ||
      isFinalReviewOpen ||
      isSettingsOpen ||
      isInfoOpen ||
      isAboutOpen ||
      isStartupOpen;
   useCommands(commands, commandsBlocked, shortcutOverrides);

   // A tooltip shown via keyboard focus must not survive a context change that
   // rewrites the focused button's label (e.g. review ↔ final review).
   useEffect(() => {
      hideTooltip();
   }, [hideTooltip, isInfoOpen, isSettingsOpen, isFinalReviewOpen, isStartupOpen]);

   // Mouse back/forward navigates only while the plain review is interactive;
   // Navigating under an overlay would leave its image tied to a different set.
   const reviewNavigationActive =
      reviewActive &&
      menu === null &&
      contextMenu === null &&
      confirmAction === null &&
      previewImage === null &&
      compare === null &&
      !isFinalReviewOpen &&
      !isSettingsOpen &&
      !isInfoOpen &&
      !isAboutOpen;

   const reviewBusy =
      loading ||
      isScanning ||
      fileOperationActive ||
      menu !== null ||
      contextMenu !== null ||
      confirmAction !== null ||
      previewImage !== null ||
      compare !== null ||
      comparePick !== null ||
      isFinalReviewOpen ||
      isSettingsOpen ||
      isInfoOpen ||
      isAboutOpen;
   useEffect(() => {
      void window.imageDeduplicator
         .setReviewBusy(reviewBusy)
         .catch((error: unknown) => reportError("Library updates paused", error, "Unable to update review activity"));
   }, [reviewBusy, reportError]);

   useEffect(() => {
      if (!reviewNavigationActive) return undefined;
      const onMouseUp = (event: globalThis.MouseEvent): void => {
         if (event.button === 3) {
            event.preventDefault();
            goTo(currentIndex - 1);
         } else if (event.button === 4) {
            event.preventDefault();
            goTo(currentIndex + 1);
         }
      };

      window.addEventListener("mouseup", onMouseUp);
      return () => window.removeEventListener("mouseup", onMouseUp);
   }, [reviewNavigationActive, currentIndex, goTo]);

   const runConfirmAction = (): void => {
      if (confirmAction === null) {
         return;
      }

      const targetSet = confirmAction.setId === undefined ? currentSet : (groups.find((imageSet) => imageSet.id === confirmAction.setId) ?? null);
      switch (confirmAction.kind) {
         case "discardSet":
            if (targetSet !== null) discardSet(targetSet);
            break;
         case "discardBand":
            if (targetSet !== null) discardBand(targetSet);
            break;
         case "applyMoves":
            if (confirmAction.decisions !== undefined && confirmAction.scanId !== undefined) void applyMoves(confirmAction.decisions, confirmAction.scanId);
            break;
         case "clearAll":
            confirmClearAllDecisions();
            break;
         case "trashDuplicate":
            void trashDuplicateFolder();
            break;
         case "switchFolder":
            setIsStartupOpen(false);
            void startScan(confirmAction.folderPath ?? null);
            break;
      }
   };

   const folderName = getFolderName(scanRoot);
   const duplicateDestination = duplicateFolderPath ?? "No managed duplicate folder";

   return (
      <ShortcutsContext.Provider value={shortcutOverrides}>
         <div className="app">
            <TitleBar
               title={isScanning ? getFolderName(scanningPath) : folderName}
               update={availableUpdate}
               updateActions={updateActions}
               updateStatus={updateStatus}
            />
            <MenuBar
               canRedo={canRedo}
               canUndo={canUndo}
               commands={commands}
               currentNumber={currentSet === null ? "#0" : getSetNumber(currentSet.id)}
               finalReviewOpen={isFinalReviewOpen}
               getTooltipProps={getTooltipProps}
               menu={menu}
               readyToMoveCount={fileWorkflow.readyToMoveCount}
               reviewActive={reviewActive}
               onMenuChange={setMenu}
               onToggleFinalReview={() => setIsFinalReviewOpen(!isFinalReviewOpen)}
               totalSets={groups.length}
            />

            <div className="app__content" inert={fileOperationActive}>
               {loading ? (
                  <LoadingScreen />
               ) : isScanning ? (
                  <ScanningScreen folderName={getFolderName(scanningPath)} folderPath={scanningPath} progress={scanProgress} onCancel={cancelScan} />
               ) : isStartupOpen || currentSet === null ? (
                  <StartupScreen
                     hasSavedReview={groups.length > 0}
                     savedSetCount={groups.length}
                     isDragOver={isDragOver}
                     onContinue={() => setIsStartupOpen(false)}
                     onDragLeave={handleDragLeave}
                     onDragOver={handleDragOver}
                     onDrop={handleDrop}
                     onOpenFolder={() => void openNewFolder()}
                     onShowOnLaunchChange={setShowStartupOnLaunch}
                     showOnLaunch={showStartupOnLaunch}
                  />
               ) : (
                  <>
                     {scanWarnings !== null && !scanWarningsDismissed && (
                        <ScanWarningsBanner warnings={scanWarnings} onDismiss={() => setScanWarningsDismissed(true)} />
                     )}
                     {!reviewHintsDismissed && <ReviewHintBar onDismiss={() => setReviewHintsDismissed(true)} />}
                     <ReviewWorkspace
                        captions={captions}
                        comparePick={comparePick}
                        currentDecision={currentDecision}
                        currentSet={currentSet}
                        currentIndex={currentIndex}
                        decisions={decisions}
                        filmstripRef={filmstripRef}
                        filmstripFade={filmstripFade}
                        getTooltipProps={getTooltipProps}
                        selectedImagePath={selectedImagePath}
                        similarityBands={similarityBands}
                        travelDirection={travelDirection}
                        wrapShelf={wrapImageShelf}
                        onBeginComparePick={() => {
                           if (selectedImage !== null) beginCompare(selectedImage);
                        }}
                        onClearSet={() => clearImageSetChoices(currentSet)}
                        onCompareSelected={() => {
                           if (selectedImage !== null) openAdjacentCompare(selectedImage);
                        }}
                        onDiscardSelected={() => {
                           if (selectedImage !== null) toggleImageRemoval(currentSet, selectedImage, false);
                        }}
                        onDiscardSet={() => requestDiscardSet(currentSet)}
                        onImageClick={handleImageClick}
                        onImageContextMenu={(event, image) => {
                           if (event.shiftKey) {
                              event.preventDefault();
                              event.stopPropagation();
                              setSelectedImagePath(image.originalPath);
                              toggleOnlyImageKept(currentSet, image, event.ctrlKey);
                           } else openImageContextMenu(event, image);
                        }}
                        onImageDoubleClick={handleImageDoubleClick}
                        onImageSetContextMenu={openSetContextMenu}
                        onNavigate={goTo}
                        onOpenContextMenu={setContextMenu}
                        onOpenSetFolder={() => void openFolder(currentSet.folderPath)}
                        onPreviewSelected={() => {
                           if (selectedImage !== null) previewImageOf(selectedImage);
                        }}
                     />
                  </>
               )}
            </div>

            {isSettingsOpen && (
               <SettingsPanel
                  captions={captions}
                  confirmMajorActions={confirmMajorActions}
                  shortcuts={shortcutOverrides}
                  showStartupOnLaunch={showStartupOnLaunch}
                  wrapImageShelf={wrapImageShelf}
                  onCaptionsChange={setCaptions}
                  onClose={() => setIsSettingsOpen(false)}
                  onConfirmChange={setConfirmMajorActions}
                  onShortcutsChange={setShortcutOverrides}
                  onStartupChange={setShowStartupOnLaunch}
                  onWrapChange={setWrapImageShelf}
               />
            )}

            {isInfoOpen && <HelpPanel onClose={() => setIsInfoOpen(false)} />}

            {isAboutOpen && <AboutPanel onClose={() => setIsAboutOpen(false)} />}

            {contextMenu !== null && contextSet !== null && (
               <ReviewContextMenu
                  context={contextMenu}
                  image={contextImage}
                  imageIsDeleted={contextImageIsDeleted}
                  onAutoSelectImageSet={() => autoSelectImageSet(contextSet)}
                  onAutoSelectBand={() => requestBandAutoselect(contextSet)}
                  onBeginCompare={() => {
                     if (contextImage !== null) beginCompare(contextImage);
                  }}
                  onClearImageSet={() => clearImageSetChoices(contextSet)}
                  onClearBand={() => clearSimilarityBandChoices(contextSet)}
                  onClose={closeContextMenu}
                  onDiscardSet={() => requestDiscardSet(contextSet)}
                  onDiscardBand={() => requestDiscardBand(contextSet)}
                  onOpenImage={() => {
                     if (contextImage !== null) void openImage(contextImage);
                  }}
                  onPreviewImage={() => {
                     if (contextImage !== null) previewImageOf(contextImage);
                  }}
                  onShowImage={() => {
                     if (contextImage !== null) void showImage(contextImage);
                  }}
                  onToggleImage={() => {
                     if (contextImage !== null) toggleImageRemoval(contextSet, contextImage, false);
                  }}
                  onToggleOtherImages={() => {
                     if (contextImage !== null) toggleOnlyImageKept(contextSet, contextImage, false);
                  }}
                  onlyImageIsKept={contextOnlyImageKept}
               />
            )}

            {tooltip !== null && <TooltipBubble tooltip={tooltip} />}

            {confirmAction !== null && <ConfirmDialog action={confirmAction} onClose={() => setConfirmAction(null)} onConfirm={runConfirmAction} />}

            {isFinalReviewOpen && (
               <FinalReview
                  destination={duplicateDestination}
                  duplicateFolderHasContent={duplicateFolderHasContent}
                  duplicatePreview={duplicatePreview}
                  getTooltipProps={getTooltipProps}
                  isApplying={isApplying}
                  isRestoring={isRestoringDuplicate}
                  isTrashing={isTrashingDuplicate}
                  lastFileAction={lastFileAction}
                  movePreview={movePreview}
                  moveResult={moveResult}
                  onApply={() => {
                     if (scanId === null) return;
                     setConfirmAction({
                        ...createConfirmAction("applyMoves", {
                           count: fileWorkflow.readyToMoveCount,
                           destination: duplicateFolderPath ?? "the managed duplicate folder",
                        }),
                        decisions,
                        scanId,
                     });
                  }}
                  onClose={() => setIsFinalReviewOpen(false)}
                  onKeepImage={keepFromFinalReview}
                  onOpenFolder={() => {
                     if (duplicateFolderPath !== null) void openFolder(duplicateFolderPath);
                  }}
                  onRestore={() => void restoreDuplicateFolder()}
                  onTrash={() => setConfirmAction(createConfirmAction("trashDuplicate"))}
                  restoreResult={restoreResult}
                  workflow={fileWorkflow}
               />
            )}

            {compare !== null && <CompareOverlay compare={compare} onClose={closeCompare} onKeep={(image) => keepCompareImage(image, false)} />}
            {previewImage !== null && (
               <ImagePreviewOverlay
                  image={previewImage}
                  images={previewImages}
                  onClose={() => setPreviewImage(null)}
                  onNavigate={setPreviewImage}
                  onOpenFolder={() => void openFolder(previewImage.folderPath)}
               />
            )}
            <NotificationCenter notifications={notifications} onDismiss={dismissNotification} />
         </div>
      </ShortcutsContext.Provider>
   );
};
