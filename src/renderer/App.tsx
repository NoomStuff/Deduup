import { useCallback, useEffect, useMemo, useState } from "react";
import type { DragEvent, MouseEvent } from "react";
import type { FileActionStatus, ImageSet, ImageItem, LoadDataResult, ScanProgress } from "../shared/types.js";
import type { AppView, CompareState, ConfirmAction, ContextMenuState, TravelDirection } from "./appTypes.js";
import { CompareOverlay } from "./components/CompareOverlay.js";
import { ConfirmDialog } from "./components/ConfirmDialog.js";
import { FinalReview } from "./components/FinalReview.js";
import { ImagePreviewOverlay } from "./components/ImagePreviewOverlay.js";
import { InfoPanel } from "./components/InfoPanel.js";
import { NotificationCenter } from "./components/NotificationCenter.js";
import { ReviewContextMenu } from "./components/ReviewContextMenu.js";
import { ReviewHeader } from "./components/ReviewHeader.js";
import { ReviewWorkspace } from "./components/ReviewWorkspace.js";
import { SettingsPanel } from "./components/SettingsPanel.js";
import { TooltipBubble } from "./components/TooltipBubble.js";
import { LoadingScreen, ScanningScreen, StartupScreen } from "./components/AppStatusScreens.js";
import { useDecisionHistory } from "./hooks/useDecisionHistory.js";
import { useFilmstrip } from "./hooks/useFilmstrip.js";
import { useFileWorkflowActions } from "./hooks/useFileWorkflowActions.js";
import { useNotifications } from "./hooks/useNotifications.js";
import { useReviewShortcuts } from "./hooks/useReviewShortcuts.js";
import { useTooltip } from "./hooks/useTooltip.js";
import { createReviewActions } from "./reviewActions.js";
import {
   createConfirmAction,
   emptyImageSetDecision,
   getDecision,
   getDeletedImagePaths,
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

const startupPreferenceKey = "show-start-screen-on-startup";

const getStartupPreference = (): boolean => window.localStorage.getItem(startupPreferenceKey) !== "false";

export const App = () => {
   const [groups, setGroups] = useState<ImageSet[]>([]);
   const {
      decisions,
      canUndo,
      canRedo,
      updateDecisions,
      replaceDecisions,
      clearHistory,
      undo: undoLastDecision,
      redo: redoLastDecision,
   } = useDecisionHistory();
   const [currentIndex, setCurrentIndex] = useState(0);
   const [loading, setLoading] = useState(true);
   const [selectedImagePath, setSelectedImagePath] = useState<string | null>(null);
   const [previewImage, setPreviewImage] = useState<ImageItem | null>(null);
   const [comparePick, setComparePick] = useState<ImageItem | null>(null);
   const [compare, setCompare] = useState<CompareState | null>(null);
   const [view, setView] = useState<AppView>("review");
   const [duplicateFolderHasContent, setDuplicateFolderHasContent] = useState(false);
   const [lastFileAction, setLastFileAction] = useState<FileActionStatus>("idle");
   const [travelDirection, setTravelDirection] = useState<TravelDirection>("idle");
   const [scanRoot, setScanRoot] = useState<string | null>(null);
   const [scanningPath, setScanningPath] = useState<string | null>(null);
   const [duplicateFolderPath, setDuplicateFolderPath] = useState<string | null>(null);
   const [isScanning, setIsScanning] = useState(false);
   const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
   const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
   const [isSettingsOpen, setIsSettingsOpen] = useState(false);
   const [isInfoOpen, setIsInfoOpen] = useState(false);
   const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
   const [isDragOver, setIsDragOver] = useState(false);
   const { tooltip, hideTooltip, getTooltipProps } = useTooltip();
   const { notifications, notify, dismissNotification } = useNotifications();
   const [confirmMajorActions, setConfirmMajorActions] = useState(true);
   const [wrapImageShelf, setWrapImageShelf] = useState(true);
   const [showStartupOnLaunch, setShowStartupOnLaunch] = useState(getStartupPreference);
   const [isStartupOpen, setIsStartupOpen] = useState(getStartupPreference);

   const currentSet = groups[currentIndex] ?? null;
   const currentDecision = currentSet === null ? emptyImageSetDecision() : getDecision(decisions, currentSet.id);
   const reviewedSetCount = useMemo(() => getReviewedSetCount(groups, decisions), [decisions, groups]);
   const movePreview = useMemo(() => getMovePreview(groups, decisions), [decisions, groups]);
   const duplicatePreview = useMemo(() => getDuplicatePreview(groups, decisions), [decisions, groups]);
   const fileWorkflow = useMemo(() => getFileWorkflowState(groups, decisions), [decisions, groups]);
   const similarityBands = useMemo(() => getSimilarityBands(groups), [groups]);
   const selectedImage = currentSet?.images.find((image) => image.originalPath === selectedImagePath) ?? null;
   const { fade: filmstripFade, filmstripRef } = useFilmstrip({
      currentIndex,
      groupCount: groups.length,
      isScanning,
      isStartupOpen,
      loading,
      view,
   });

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
         setView("review");
         setIsStartupOpen(false);
         clearFileResults();
         setDuplicateFolderHasContent(result.duplicateFolderHasContent);
         setLastFileAction(result.lastFileAction);
         notify({
            tone: result.groups.length === 0 ? "info" : "success",
            title: result.groups.length === 0 ? "Scan complete" : "Duplicate sets ready",
            message:
               result.groups.length === 0
                  ? "No matching image sets were found."
                  : `Found ${result.groups.length} set${result.groups.length === 1 ? "" : "s"} of similar images.`,
         });
         if (result.scanWarningCount > 0) {
            notify({
               tone: "warning",
               title: "Some items were skipped",
               message: `${result.scanWarningCount} unreadable image or folder${result.scanWarningCount === 1 ? " was" : "s were"} skipped.`,
            });
         }
      },
      [clearFileResults, notify, replaceDecisions]
   );

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
   }, [notify, replaceDecisions, reportError]);

   useEffect(() => {
      const api = window.imageDeduplicator;
      const unsubscribeProgress = api.onScanProgress(setScanProgress);
      const unsubscribeComplete = api.onScanComplete((result) => {
         applyScanResult(result);
         setIsScanning(false);
         setScanningPath(null);
      });
      const unsubscribeError = api.onAppError((message) => notify({ tone: "error", title: "Scan failed", message }));
      return () => {
         unsubscribeProgress();
         unsubscribeComplete();
         unsubscribeError();
      };
   }, [applyScanResult, notify]);

   useEffect(() => {
      const api = window.imageDeduplicator;
      if (loading) return undefined;

      const timeout = window.setTimeout(() => {
         void api.saveDecisions(decisions).catch((unknownError: unknown) => {
            reportError("Choices weren’t saved", unknownError, "Failed to save choices");
         });
      }, 100);

      return () => window.clearTimeout(timeout);
   }, [decisions, loading, reportError]);

   useEffect(() => {
      const api = window.imageDeduplicator;
      if (loading || currentSet === null) return undefined;
      const timeout = window.setTimeout(() => {
         void api.saveCurrentSet(currentSet.id).catch((unknownError: unknown) => {
            reportError("Position wasn’t saved", unknownError, "Failed to save the current set");
         });
      }, 150);
      return () => window.clearTimeout(timeout);
   }, [currentSet, loading, reportError]);

   useEffect(() => {
      if (currentSet === null) {
         setSelectedImagePath(null);
         return;
      }

      if (selectedImagePath !== null && !currentSet.images.some((image) => image.originalPath === selectedImagePath)) {
         setSelectedImagePath(null);
      }
   }, [currentSet, selectedImagePath]);

   const goTo = useCallback(
      (index: number): void => {
         const nextIndex = Math.max(0, Math.min(groups.length - 1, index));
         if (nextIndex === currentIndex) {
            // Pressing next on the last set still counts as having seen it.
            if (index > currentIndex && currentSet !== null) {
               updateDecisions((existing) => {
                  const decision = getDecision(existing, currentSet.id);
                  return setImageSetDecision(existing, currentSet.id, { ...decision, seen: true });
               });
            }
            return;
         }

         if (currentSet !== null) {
            updateDecisions((existing) => {
               const decision = getDecision(existing, currentSet.id);
               return setImageSetDecision(existing, currentSet.id, { ...decision, seen: true });
            });
         }
         setTravelDirection(nextIndex > currentIndex ? "right" : "left");
         setCompare(null);
         setComparePick(null);
         setSelectedImagePath(null);
         setCurrentIndex(nextIndex);
         window.setTimeout(() => setTravelDirection("idle"), 180);
      },
      [currentSet, currentIndex, groups, updateDecisions]
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

   const autoSelectCurrentBand = (): void => {
      if (currentSet !== null) autoSelectBand(currentSet);
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
      setCompare(null);
      setComparePick(null);
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

   const openImageContextMenu = (event: MouseEvent, image: ImageItem): void => {
      if (currentSet === null) return;
      event.preventDefault();
      event.stopPropagation();
      hideTooltip();
      setSelectedImagePath(image.originalPath);
      setContextMenu({
         menuKind: "image",
         imagePath: image.originalPath,
         setId: currentSet.id,
         anchor: { kind: "point", x: event.clientX, y: event.clientY },
      });
   };

   const openImageMenuFromBadge = (event: MouseEvent, image: ImageItem): void => {
      if (currentSet === null) return;
      event.preventDefault();
      event.stopPropagation();
      hideTooltip();
      setSelectedImagePath(image.originalPath);
      setContextMenu({
         menuKind: "image",
         imagePath: image.originalPath,
         setId: currentSet.id,
         anchor: { kind: "rect", rect: event.currentTarget.getBoundingClientRect() },
      });
   };

   const openSetContextMenu = (event: MouseEvent, imageSet: ImageSet): void => {
      event.preventDefault();
      event.stopPropagation();
      hideTooltip();
      setContextMenu({ menuKind: "imageSet", setId: imageSet.id, anchor: { kind: "point", x: event.clientX, y: event.clientY } });
   };

   const getImageIndex = (image: ImageItem): number => currentSet?.images.findIndex((item) => item.originalPath === image.originalPath) ?? -1;

   const openAdjacentCompare = (image: ImageItem): void => {
      if (currentSet === null || image.sourceStatus !== "available") {
         return;
      }

      const imageIndex = getImageIndex(image);
      const adjacentImage =
         currentSet.images.slice(imageIndex + 1).find((candidate) => candidate.sourceStatus === "available") ??
         currentSet.images
            .slice(0, imageIndex)
            .reverse()
            .find((candidate) => candidate.sourceStatus === "available");
      if (adjacentImage === undefined) {
         return;
      }

      setCompare({ left: image, right: adjacentImage, leftIndex: imageIndex, rightIndex: getImageIndex(adjacentImage), reveal: 0.5 });
      setComparePick(null);
   };

   const beginCompare = (image: ImageItem): void => {
      if (currentSet === null || image.sourceStatus !== "available") {
         return;
      }

      if (comparePick === null) {
         setComparePick(image);
         return;
      }

      if (comparePick.originalPath !== image.originalPath) {
         setCompare({ left: comparePick, right: image, leftIndex: getImageIndex(comparePick), rightIndex: getImageIndex(image), reveal: 0.5 });
         setComparePick(null);
      }
   };

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

   const handleImageDeleteToggle = (event: MouseEvent, image: ImageItem): void => {
      event.preventDefault();
      event.stopPropagation();
      if (currentSet !== null) {
         setSelectedImagePath(image.originalPath);
         toggleImageRemoval(currentSet, image, event.ctrlKey);
      }
   };

   const previewImageOf = (image: ImageItem): void => {
      if (image.sourceStatus === "missing" || image.sourceStatus === "recycledByApp") {
         notify({ tone: "warning", title: "Preview unavailable", message: `${image.file} is no longer available on disk.` });
         return;
      }
      setPreviewImage(image);
   };

   const keepFromFinalReview = (row: { setId: string; originalPath: string }): void => {
      const imageSet = groups.find((candidate) => candidate.id === row.setId);
      const image = imageSet?.images.find((candidate) => candidate.originalPath === row.originalPath);
      if (imageSet !== undefined && image !== undefined) toggleImageRemoval(imageSet, image, false);
   };

   useReviewShortcuts({
      blocked: isStartupOpen || isSettingsOpen || isInfoOpen || contextMenu !== null || confirmAction !== null || previewImage !== null || view !== "review",
      compare,
      hasCurrentSet: currentSet !== null,
      hasSelectedImage: selectedImage !== null,
      onAutoSelectBand: autoSelectCurrentBand,
      onKeepCompareImage: (side) => {
         if (currentSet !== null && compare !== null) toggleOnlyImageKept(currentSet, compare[side], true);
         setCompare(null);
      },
      onNavigate: (offset) => goTo(currentIndex + offset),
      onNavigateBand: goToAdjacentSimilarityBand,
      onCompareSelected: () => {
         if (selectedImage !== null) openAdjacentCompare(selectedImage);
      },
      onPreviewSelected: () => {
         if (selectedImage !== null) previewImageOf(selectedImage);
      },
      onRedo: redoLastDecision,
      onRequestMarkCurrentSet: () => {
         if (currentSet !== null) requestMarkImageSet(currentSet);
      },
      onToggleImageAtIndex: (index, advance) => {
         const image = currentSet?.images[index];
         if (currentSet !== null && image !== undefined) toggleImageRemoval(currentSet, image, advance);
      },
      onToggleSelectedImage: (advance) => {
         if (currentSet !== null && selectedImage !== null) toggleImageRemoval(currentSet, selectedImage, advance);
      },
      onUndo: undoLastDecision,
   });

   // A tooltip shown via keyboard focus must not survive a context change that
   // rewrites the focused button's label (e.g. review ↔ final review).
   useEffect(() => {
      hideTooltip();
   }, [hideTooltip, isInfoOpen, isSettingsOpen, isStartupOpen, view]);

   // Mouse back/forward navigates only while the plain review is interactive;
   // firing under overlays would mark sets seen behind the startup screen or
   // leave a preview showing an image from a set that is no longer current.
   const reviewNavigationActive =
      !loading &&
      !isScanning &&
      !isStartupOpen &&
      !isSettingsOpen &&
      !isInfoOpen &&
      view === "review" &&
      contextMenu === null &&
      confirmAction === null &&
      previewImage === null &&
      compare === null;

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

   const chooseScanFolder = async (): Promise<string | null> => {
      const api = window.imageDeduplicator;
      try {
         return await api.chooseFolder();
      } catch (unknownError: unknown) {
         reportError("Couldn’t choose a folder", unknownError, "Failed to choose a folder");
         return null;
      }
   };

   const startScan = async (rootPath = scanRoot): Promise<void> => {
      const api = window.imageDeduplicator;
      if (rootPath === null) return;

      setIsScanning(true);
      setScanningPath(rootPath);
      setScanProgress({ phase: "discovering", completed: 0, total: 0 });
      try {
         applyScanResult(await api.scanFolder({ rootPath }));
      } catch (unknownError: unknown) {
         reportError("Scan failed", unknownError, "Failed to scan the selected folder");
      } finally {
         setIsScanning(false);
         setScanningPath(null);
      }
   };

   const confirmOrScan = (folderPath: string | null): void => {
      if (folderPath === null) return;
      if (groups.length > 0 && confirmMajorActions) {
         setConfirmAction(createConfirmAction("switchFolder", folderPath));
         return;
      }
      setIsStartupOpen(false);
      void startScan(folderPath);
   };

   const openNewFolder = async (): Promise<void> => {
      confirmOrScan(await chooseScanFolder());
   };

   const updateStartupPreference = (checked: boolean): void => {
      setShowStartupOnLaunch(checked);
      window.localStorage.setItem(startupPreferenceKey, String(checked));
   };

   const handleDragOver = (event: DragEvent): void => {
      event.preventDefault();
      setIsDragOver(true);
   };

   const handleDragLeave = (event: DragEvent): void => {
      if (event.currentTarget === event.target) setIsDragOver(false);
   };

   const handleDrop = (event: DragEvent): void => {
      event.preventDefault();
      setIsDragOver(false);
      const file = event.dataTransfer.files.item(0);
      if (file === null) return;
      const folderPath = window.imageDeduplicator.getPathForFile(file);
      if (folderPath.length === 0) {
         notify({ tone: "warning", title: "Nothing to scan", message: "Drop a folder from Explorer to scan it." });
         return;
      }
      confirmOrScan(folderPath);
   };

   const runConfirmAction = (): void => {
      if (confirmAction === null) {
         return;
      }

      const { kind } = confirmAction;
      if (kind === "markSet") {
         const targetSet = confirmAction.setId === undefined ? currentSet : (groups.find((imageSet) => imageSet.id === confirmAction.setId) ?? currentSet);
         if (targetSet !== null) {
            markImageSet(targetSet);
         }
      } else if (kind === "clearAll") {
         confirmClearAllDecisions();
      } else if (kind === "trashDuplicate") {
         void trashDuplicateFolder();
      } else if (kind === "switchFolder") {
         setIsStartupOpen(false);
         void startScan(confirmAction.folderPath);
      } else {
         setIsStartupOpen(false);
         void startScan();
      }
   };

   if (loading) {
      return (
         <>
            <LoadingScreen />
            <NotificationCenter notifications={notifications} onDismiss={dismissNotification} />
         </>
      );
   }

   if (isScanning) {
      return (
         <>
            <ScanningScreen folderName={getFolderName(scanningPath)} folderPath={scanningPath} progress={scanProgress} />
            <NotificationCenter notifications={notifications} onDismiss={dismissNotification} />
         </>
      );
   }

   if (isStartupOpen || currentSet === null) {
      return (
         <>
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
                     void startScan();
                  }
               }}
               onShowOnLaunchChange={updateStartupPreference}
               showOnLaunch={showStartupOnLaunch}
            />
            {confirmAction !== null && <ConfirmDialog action={confirmAction} onClose={() => setConfirmAction(null)} onConfirm={runConfirmAction} />}
            <NotificationCenter notifications={notifications} onDismiss={dismissNotification} />
         </>
      );
   }

   const reviewPercent = groups.length === 0 ? 0 : Math.round((reviewedSetCount / groups.length) * 100);
   const folderName = getFolderName(scanRoot);
   const duplicateDestination = duplicateFolderPath ?? "No managed duplicate folder";
   const contextSet = contextMenu?.setId === undefined ? currentSet : (groups.find((imageSet) => imageSet.id === contextMenu.setId) ?? currentSet);
   const contextSetDecision = getDecision(decisions, contextSet.id);
   const contextImage =
      contextMenu?.imagePath === undefined ? selectedImage : (contextSet.images.find((image) => image.originalPath === contextMenu.imagePath) ?? selectedImage);
   const contextDeletedPaths = getDeletedImagePaths(contextSetDecision);
   const contextImageIsDeleted = contextImage === null ? false : contextDeletedPaths.has(contextImage.originalPath);
   const contextOnlyImageKept =
      contextImage !== null &&
      !contextImageIsDeleted &&
      contextSet.images.every((image) => image.originalPath === contextImage.originalPath || contextDeletedPaths.has(image.originalPath));
   return (
      <main className={`shell${wrapImageShelf ? " shell--wrapShelf" : ""}`}>
         <ReviewHeader
            canRedo={canRedo}
            canUndo={canUndo}
            currentNumber={getSetNumber(currentSet.id)}
            folderName={folderName}
            readyToMoveCount={fileWorkflow.readyToMoveCount}
            reviewPercent={reviewPercent}
            totalSets={groups.length}
            view={view}
            getTooltipProps={getTooltipProps}
            onOpenInfo={() => setIsInfoOpen(true)}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenStartup={() => {
               setIsSettingsOpen(false);
               setIsInfoOpen(false);
               setIsStartupOpen(true);
            }}
            onRedo={redoLastDecision}
            onToggleView={() => setView(view === "review" ? "final" : "review")}
            onUndo={undoLastDecision}
         />

         {view === "review" ? (
            <ReviewWorkspace
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
               onImageBadgeClick={openImageMenuFromBadge}
               onImageClick={handleImageClick}
               onImageContextMenu={openImageContextMenu}
               onImageDoubleClick={handleImageDoubleClick}
               onImageSetContextMenu={openSetContextMenu}
               onImageToggleDelete={handleImageDeleteToggle}
               onNavigate={goTo}
               onOpenContextMenu={setContextMenu}
            />
         ) : (
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
               onApply={() => void applyMoves()}
               onKeepImage={keepFromFinalReview}
               onOpenFolder={() => {
                  if (duplicateFolderPath !== null) void openFolder(duplicateFolderPath);
               }}
               onRestore={() => void restoreDuplicateFolder()}
               onTrash={() => (confirmMajorActions ? setConfirmAction(createConfirmAction("trashDuplicate")) : void trashDuplicateFolder())}
               restoreResult={restoreResult}
               workflow={fileWorkflow}
            />
         )}

         {isSettingsOpen && (
            <SettingsPanel
               confirmMajorActions={confirmMajorActions}
               onClear={() => setConfirmAction(createConfirmAction("clearAll"))}
               onClose={() => setIsSettingsOpen(false)}
               onConfirmChange={setConfirmMajorActions}
               onStartupChange={updateStartupPreference}
               onWrapChange={setWrapImageShelf}
               showStartupOnLaunch={showStartupOnLaunch}
               wrapImageShelf={wrapImageShelf}
            />
         )}

         {isInfoOpen && <InfoPanel onClose={() => setIsInfoOpen(false)} />}

         {contextMenu !== null && (
            <ReviewContextMenu
               context={contextMenu}
               image={contextImage}
               imageIsDeleted={contextImageIsDeleted}
               onAutoSelectImageSet={() => autoSelectImageSet(contextSet)}
               onAutoSelectBand={() => autoSelectBand(contextSet)}
               onBeginCompare={() => {
                  if (contextImage !== null) beginCompare(contextImage);
               }}
               onClearImageSet={() => clearImageSetChoices(contextSet)}
               onClearBand={() => clearSimilarityBandChoices(contextSet)}
               onClose={() => setContextMenu(null)}
               onMarkImageSet={() => requestMarkImageSet(contextSet)}
               onMarkBand={() => markSimilarityBand(contextSet)}
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

         {compare !== null && (
            <CompareOverlay
               compare={compare}
               onClose={() => {
                  setCompare(null);
                  setComparePick(null);
               }}
               onKeep={(image) => {
                  toggleOnlyImageKept(currentSet, image, false);
                  setCompare(null);
               }}
            />
         )}
         {previewImage !== null && (
            <ImagePreviewOverlay image={previewImage} onClose={() => setPreviewImage(null)} onOpenFolder={() => void openFolder(previewImage.folderPath)} />
         )}
         <NotificationCenter notifications={notifications} onDismiss={dismissNotification} />
      </main>
   );
};
