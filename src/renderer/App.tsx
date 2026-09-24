import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import type { FileActionStatus, ImageSet, ImageItem, LoadDataResult } from "../shared/types.js";
import type { ConfirmAction, ImageCaptionMode, ScanWarnings, TravelDirection } from "./appTypes.js";
import type { Commands, ShortcutOverrides } from "./commands.js";
import { loadShortcutOverrides, saveShortcutOverrides, ShortcutsContext, useCommands } from "./commands.js";
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
import { TitleBar } from "./components/TitleBar.js";
import { TooltipBubble } from "./components/TooltipBubble.js";
import { LoadingScreen, ScanWarningsBanner, ScanningScreen, StartupScreen } from "./components/AppStatusScreens.js";
import { useCompareController } from "./hooks/useCompareController.js";
import { useDecisionHistory } from "./hooks/useDecisionHistory.js";
import { useFileWorkflowActions } from "./hooks/useFileWorkflowActions.js";
import { useFilmstrip } from "./hooks/useFilmstrip.js";
import { useFolderSelection } from "./hooks/useFolderSelection.js";
import { useNotifications } from "./hooks/useNotifications.js";
import { preferenceKeys, useEnumPreference, usePreference } from "./hooks/usePreference.js";
import { useReviewContextMenu } from "./hooks/useReviewContextMenu.js";
import { useReviewPersistence } from "./hooks/useReviewPersistence.js";
import { useScanController } from "./hooks/useScanController.js";
import { useTooltip } from "./hooks/useTooltip.js";
import { countBandAutoselectOverrides, countBandMarkOverrides, countBandSets, createReviewActions } from "./reviewActions.js";
import {
   createConfirmAction,
   emptyImageSetDecision,
   getDecision,
   getDuplicatePreview,
   getFolderName,
   getFileWorkflowState,
   getMovePreview,
   getReviewedSetCount,
   getResumeIndex,
   getSetNumber,
   getSimilarityBands,
   setImageSetDecision,
} from "./reviewModel.js";

export const App = () => {
   const [groups, setGroups] = useState<ImageSet[]>([]);
   const {
      decisions,
      canUndo,
      canRedo,
      updateDecisions,
      updateDecisionsEphemeral,
      replaceDecisions,
      clearHistory,
      undo: undoLastDecision,
      redo: redoLastDecision,
   } = useDecisionHistory();
   const [currentIndex, setCurrentIndex] = useState(0);
   const [loading, setLoading] = useState(true);
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
   const [confirmMajorActions, setConfirmMajorActions] = usePreference(preferenceKeys.confirmMajorActions, true);
   const [wrapImageShelf, setWrapImageShelf] = usePreference(preferenceKeys.wrapImageShelf, true);
   const [showStartupOnLaunch, setShowStartupOnLaunch] = usePreference(preferenceKeys.showStartupOnLaunch, true);
   const [reviewHintsDismissed, setReviewHintsDismissed] = usePreference(preferenceKeys.reviewHintsDismissed, false);
   const [captions, setCaptions] = useEnumPreference<ImageCaptionMode>(preferenceKeys.imageCaptions, ["none", "names", "details"], "details");
   const [shortcutOverrides, setShortcutOverrides] = useState<ShortcutOverrides>(loadShortcutOverrides);
   const [isStartupOpen, setIsStartupOpen] = useState(showStartupOnLaunch);
   const { tooltip, hideTooltip, getTooltipProps } = useTooltip();
   const { notifications, notify, dismissNotification } = useNotifications();

   useEffect(() => {
      saveShortcutOverrides(shortcutOverrides);
   }, [shortcutOverrides]);

   const currentSet = groups[currentIndex] ?? null;
   const currentDecision = currentSet === null ? emptyImageSetDecision() : getDecision(decisions, currentSet.id);
   const reviewedSetCount = useMemo(() => getReviewedSetCount(groups, decisions), [decisions, groups]);
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
   const refreshFileState = useCallback((result: LoadDataResult): void => {
      setGroups(result.groups);
      setDuplicateFolderHasContent(result.duplicateFolderHasContent);
      setDuplicateFolderPath(result.duplicateFolderPath);
      setLastFileAction(result.lastFileAction);
   }, []);
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
   } = useFileWorkflowActions({ decisions, clearHistory, notify, onRefresh: refreshFileState, reportError });

   const applyScanResult = useCallback(
      (result: LoadDataResult): void => {
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

   const reviewActive = !loading && !isScanning && !isStartupOpen && currentSet !== null;

   const { isDragOver, openNewFolder, handleDragOver, handleDragLeave, handleDrop } = useFolderSelection({
      hasReview: groups.length > 0,
      confirmMajorActions,
      setConfirmAction,
      setScanRoot,
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
            setGroups(result.groups);
            replaceDecisions(result.decisions);
            setScanRoot(result.scanRoot);
            setDuplicateFolderPath(result.duplicateFolderPath);
            setCurrentIndex(getResumeIndex(result.groups, result.currentSetId));
            setDuplicateFolderHasContent(result.duplicateFolderHasContent);
            setLastFileAction(result.lastFileAction);
         })
         .catch((unknownError: unknown) => reportError("Couldn’t load the review", unknownError, "Failed to load duplicate sets"))
         .finally(() => setLoading(false));
   }, [notify, replaceDecisions, reportError, setScanRoot]);

   useReviewPersistence({ loading, decisions, currentSet, reportError });

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
   const keepImageRef = useRef<(image: ImageItem, advance: boolean) => void>(() => undefined);
   const { beginCompare, closeCompare, compare, comparePick, keepCompareImage, openAdjacentCompare } = useCompareController({
      currentSet,
      onKeep: (image, advance) => keepImageRef.current(image, advance),
   });

   const goTo = useCallback(
      (index: number): void => {
         const nextIndex = Math.max(0, Math.min(groups.length - 1, index));
         if (nextIndex === currentIndex) {
            // Pressing next on the last set still counts as having seen it.
            if (index > currentIndex && currentSet !== null) {
               updateDecisionsEphemeral((existing) => {
                  const decision = getDecision(existing, currentSet.id);
                  return setImageSetDecision(existing, currentSet.id, { ...decision, seen: true });
               });
            }
            return;
         }

         if (currentSet !== null) {
            updateDecisionsEphemeral((existing) => {
               const decision = getDecision(existing, currentSet.id);
               return setImageSetDecision(existing, currentSet.id, { ...decision, seen: true });
            });
         }
         hideTooltip();
         setTravelDirection(nextIndex > currentIndex ? "right" : "left");
         closeCompare();
         setSelectedImagePath(null);
         setCurrentIndex(nextIndex);
         window.setTimeout(() => setTravelDirection("idle"), 180);
      },
      [closeCompare, currentSet, currentIndex, groups.length, hideTooltip, updateDecisionsEphemeral]
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
      markImageSet,
      markSimilarityBand,
      markSimilarityBandSeen,
      toggleImageRemoval,
      toggleOnlyImageKept,
   } = createReviewActions({ currentIndex, decisions, groups, goTo, updateDecisions });

   useEffect(() => {
      keepImageRef.current = (image, advance) => {
         if (currentSet !== null) toggleOnlyImageKept(currentSet, image, advance);
      };
   });

   // Band actions sweep many sets at once, so they confirm before overwriting
   // choices the user made by hand. File moves and recycling always confirm.
   const requestBandAutoselect = (imageSet: ImageSet): void => {
      const overrides = countBandAutoselectOverrides(groups, decisions, imageSet);
      if (confirmMajorActions && overrides > 0) {
         setConfirmAction({ ...createConfirmAction("autoSelectBand", { count: overrides }), setId: imageSet.id });
         return;
      }
      autoSelectBand(imageSet);
   };

   const requestMarkBand = (imageSet: ImageSet): void => {
      const overrides = countBandMarkOverrides(groups, decisions, imageSet);
      if (confirmMajorActions && overrides > 0) {
         setConfirmAction({ ...createConfirmAction("markBand", { count: countBandSets(groups, imageSet) }), setId: imageSet.id });
         return;
      }
      markSimilarityBand(imageSet);
   };

   const requestMarkImageSet = (imageSet: ImageSet): void => {
      if (confirmMajorActions) {
         setConfirmAction({ ...createConfirmAction("markSet"), setId: imageSet.id });
         return;
      }
      markImageSet(imageSet);
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
         reportError("Couldn’t show the folder", unknownError, "Failed to show the folder");
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

   // The hint bar retires itself after the first mark, so it never nags.
   const hasAnyMarks = useMemo(() => Object.values(decisions).some((decision) => decision.deletedImages.length > 0), [decisions]);
   useEffect(() => {
      if (!reviewHintsDismissed && hasAnyMarks) setReviewHintsDismissed(true);
   }, [hasAnyMarks, reviewHintsDismissed, setReviewHintsDismissed]);

   const reviewCommandsActive = reviewActive && compare === null;

   // --- Command registry -----------------------------------------------------
   // Availability is re-checked at run time, so commands can never act on a
   // surface that is no longer in front of the user. Rebuilt each render;
   // useCommands reads the latest object through its ref.

   const commands: Commands = (() => {
      const requestRescan = (): void => {
         if (scanRoot === null) return;
         if (confirmMajorActions) setConfirmAction(createConfirmAction("rescan"));
         else {
            setIsStartupOpen(false);
            void startScan(scanRoot);
         }
      };

      return {
         openFolder: {
            enabled: () => !loading && !isScanning,
            run: () => void openNewFolder(),
         },
         rescan: {
            enabled: () => scanRoot !== null && !loading && !isScanning,
            run: requestRescan,
         },
         startScreen: {
            enabled: () => !loading && !isScanning,
            run: () => {
               setIsSettingsOpen(false);
               setIsInfoOpen(false);
               setIsStartupOpen(true);
            },
         },
         undo: {
            enabled: () => canUndo && !isScanning,
            run: () => undoLastDecision(),
         },
         redo: {
            enabled: () => canRedo && !isScanning,
            run: () => redoLastDecision(),
         },
         clearAll: {
            enabled: () => groups.length > 0 && !isScanning,
            run: () => setConfirmAction(createConfirmAction("clearAll")),
         },
         markSet: {
            enabled: () => reviewCommandsActive,
            run: () => {
               if (currentSet !== null) requestMarkImageSet(currentSet);
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
               // Two copies compare directly; with more, the user picks the partner.
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
         // While a compare is open the arrows keep the shown copy instead.
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
      isStartupOpen;
   useCommands(commands, commandsBlocked, shortcutOverrides);

   // A tooltip shown via keyboard focus must not survive a context change that
   // rewrites the focused button's label (e.g. review ↔ final review).
   useEffect(() => {
      hideTooltip();
   }, [hideTooltip, isInfoOpen, isSettingsOpen, isFinalReviewOpen, isStartupOpen]);

   // Mouse back/forward navigates only while the plain review is interactive;
   // firing under overlays would mark sets seen behind the startup screen or
   // leave a preview showing an image from a set that is no longer current.
   const reviewNavigationActive =
      reviewActive &&
      menu === null &&
      contextMenu === null &&
      confirmAction === null &&
      previewImage === null &&
      compare === null &&
      !isFinalReviewOpen &&
      !isSettingsOpen &&
      !isInfoOpen;

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

      const targetSet = confirmAction.setId === undefined ? currentSet : (groups.find((imageSet) => imageSet.id === confirmAction.setId) ?? currentSet);
      switch (confirmAction.kind) {
         case "markSet":
            if (targetSet !== null) markImageSet(targetSet);
            break;
         case "autoSelectBand":
            if (targetSet !== null) autoSelectBand(targetSet);
            break;
         case "markBand":
            if (targetSet !== null) markSimilarityBand(targetSet);
            break;
         case "applyMoves":
            void applyMoves();
            break;
         case "clearAll":
            confirmClearAllDecisions();
            break;
         case "trashDuplicate":
            void trashDuplicateFolder();
            break;
         case "rescan":
            setIsStartupOpen(false);
            void startScan(scanRoot);
            break;
         case "switchFolder":
            setIsStartupOpen(false);
            void startScan(confirmAction.folderPath ?? null);
            break;
      }
   };

   const folderName = getFolderName(scanRoot);
   const duplicateDestination = duplicateFolderPath ?? "No managed duplicate folder";
   const reviewPercent = groups.length === 0 ? 0 : Math.round((reviewedSetCount / groups.length) * 100);

   return (
      <ShortcutsContext.Provider value={shortcutOverrides}>
         <div className="app">
            <TitleBar title={isScanning ? getFolderName(scanningPath) : folderName} />
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
               reviewPercent={reviewPercent}
               onMenuChange={setMenu}
               onToggleFinalReview={() => setIsFinalReviewOpen(!isFinalReviewOpen)}
               totalSets={groups.length}
            />

            <div className="app__content">
               {loading ? (
                  <LoadingScreen />
               ) : isScanning ? (
                  <ScanningScreen folderName={getFolderName(scanningPath)} folderPath={scanningPath} progress={scanProgress} onCancel={cancelScan} />
               ) : isStartupOpen || currentSet === null ? (
                  <StartupScreen
                     canRescan={scanRoot !== null}
                     hasSavedReview={groups.length > 0}
                     savedSetCount={groups.length}
                     isDragOver={isDragOver}
                     onContinue={() => setIsStartupOpen(false)}
                     onDragLeave={handleDragLeave}
                     onDragOver={handleDragOver}
                     onDrop={handleDrop}
                     onOpenFolder={() => void openNewFolder()}
                     onRescan={() => {
                        if (confirmMajorActions) setConfirmAction(createConfirmAction("rescan"));
                        else {
                           setIsStartupOpen(false);
                           void startScan(scanRoot);
                        }
                     }}
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
                        onAutoselectSet={() => autoSelectImageSet(currentSet)}
                        onBeginComparePick={() => {
                           if (selectedImage !== null) beginCompare(selectedImage);
                        }}
                        onClearSet={() => clearImageSetChoices(currentSet)}
                        onCompareSelected={() => {
                           if (selectedImage !== null) openAdjacentCompare(selectedImage);
                        }}
                        onImageClick={handleImageClick}
                        onImageContextMenu={openImageContextMenu}
                        onImageDoubleClick={handleImageDoubleClick}
                        onImageSetContextMenu={openSetContextMenu}
                        onMarkSelected={() => {
                           if (selectedImage !== null) toggleImageRemoval(currentSet, selectedImage, false);
                        }}
                        onMarkSet={() => requestMarkImageSet(currentSet)}
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
                  onMarkImageSet={() => requestMarkImageSet(contextSet)}
                  onMarkBand={() => requestMarkBand(contextSet)}
                  onMarkBandSeen={() => markSimilarityBandSeen(contextSet)}
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
                  onApply={() =>
                     setConfirmAction(
                        createConfirmAction("applyMoves", {
                           count: fileWorkflow.readyToMoveCount,
                           destination: duplicateFolderPath ?? "the managed duplicate folder",
                        })
                     )
                  }
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
