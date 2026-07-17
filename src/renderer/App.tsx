import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, MouseEvent } from "react";
import type { FileActionStatus, ImageSet, ImageItem, LoadDataResult, ScanProgress } from "../shared/types.js";
import type { CompareState, ConfirmAction, ContextMenuKind, ContextMenuState, PatchView, TravelDirection } from "./appTypes.js";
import { CompareOverlay } from "./components/CompareOverlay.js";
import { ConfirmDialog } from "./components/ConfirmDialog.js";
import { FinalReview } from "./components/FinalReview.js";
import { ImagePreviewOverlay } from "./components/ImagePreviewOverlay.js";
import { NotificationCenter } from "./components/NotificationCenter.js";
import { ReviewContextMenu } from "./components/ReviewContextMenu.js";
import { ReviewHeader } from "./components/ReviewHeader.js";
import { ReviewWorkspace } from "./components/ReviewWorkspace.js";
import { SettingsPanel } from "./components/SidePanels.js";
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
   getAnchoredPosition,
   getButtonMenuPosition,
   getContextMenuSize,
   getDecision,
   getDeletedImagePaths,
   getDetectionNumber,
   getDuplicatePreview,
   getDroppedFolderPath,
   getFolderName,
   getFileWorkflowState,
   getMovePreview,
   getPatchPreview,
   getResumeIndex,
   getSimilarityBands,
} from "./reviewModel.js";
import "./styles.css";
import "./workflow.css";

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
   const [view, setView] = useState<PatchView>("review");
   const [duplicateFolderHasContent, setDuplicateFolderHasContent] = useState(false);
   const [lastFileAction, setLastFileAction] = useState<FileActionStatus>("idle");
   const [travelDirection, setTravelDirection] = useState<TravelDirection>("idle");
   const [scanRoot, setScanRoot] = useState<string | null>(null);
   const [duplicateFolderPath, setDuplicateFolderPath] = useState<string | null>(null);
   const [isScanning, setIsScanning] = useState(false);
   const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
   const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
   const [isSettingsOpen, setIsSettingsOpen] = useState(false);
   const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
   const { tooltip, hideTooltip, getTooltipProps } = useTooltip();
   const { notifications, notify, dismissNotification } = useNotifications();
   const [confirmMajorActions, setConfirmMajorActions] = useState(true);
   const [wrapImageShelf, setWrapImageShelf] = useState(true);
   const [showStartupOnLaunch, setShowStartupOnLaunch] = useState(getStartupPreference);
   const [isStartupOpen, setIsStartupOpen] = useState(getStartupPreference);
   const contextMenuRef = useRef<HTMLDivElement | null>(null);

   const currentGroup = groups[currentIndex] ?? null;
   const currentDecision = currentGroup === null ? emptyImageSetDecision() : getDecision(decisions, currentGroup.id);
   const patchPreview = useMemo(() => getPatchPreview(groups, decisions), [decisions, groups]);
   const movePreview = useMemo(() => getMovePreview(groups, decisions), [decisions, groups]);
   const duplicatePreview = useMemo(() => getDuplicatePreview(groups, decisions), [decisions, groups]);
   const fileWorkflow = useMemo(() => getFileWorkflowState(groups, decisions), [decisions, groups]);
   const similarityBands = useMemo(() => getSimilarityBands(groups), [groups]);
   const selectedImage = currentGroup?.images.find((image) => image.originalPath === selectedImagePath) ?? null;
   const { edges: filmstripEdges, filmstripRef } = useFilmstrip({
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
      apply: applyPatch,
      clearResults: clearFileResults,
      isApplying,
      isRestoring: isRestoringDuplicate,
      isTrashing: isTrashingDuplicate,
      patchResult,
      restore: restoreDuplicateFolder,
      restoreResult,
      trash: trashDuplicateFolder,
   } = useFileWorkflowActions({ decisions, clearHistory, notify, onRefresh: refreshFileState, reportError });

   useEffect(() => {
      const api = window.imageDeduplicator;
      api.loadData()
         .then((result) => {
            setGroups(result.groups);
            replaceDecisions(result.decisions);
            setScanRoot(result.scanRoot);
            setDuplicateFolderPath(result.duplicateFolderPath);
            setCurrentIndex(getResumeIndex(result.groups, result.currentGroupId));
            setDuplicateFolderHasContent(result.duplicateFolderHasContent);
            setLastFileAction(result.lastFileAction);
         })
         .catch((unknownError: unknown) => reportError("Couldn’t load the review", unknownError, "Failed to load duplicate sets"))
         .finally(() => setLoading(false));
   }, [notify, replaceDecisions, reportError]);

   useEffect(() => {
      const api = window.imageDeduplicator;
      return api.onScanProgress(setScanProgress);
   }, []);

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
      if (loading || currentGroup === null) return undefined;
      const timeout = window.setTimeout(() => {
         void api.saveCurrentGroup(currentGroup.id).catch((unknownError: unknown) => {
            reportError("Position wasn’t saved", unknownError, "Failed to save the current set");
         });
      }, 150);
      return () => window.clearTimeout(timeout);
   }, [currentGroup, loading, reportError]);

   useEffect(() => {
      if (currentGroup === null) {
         setSelectedImagePath(null);
         return;
      }

      if (selectedImagePath !== null && !currentGroup.images.some((image) => image.originalPath === selectedImagePath)) {
         setSelectedImagePath(null);
      }
   }, [currentGroup, selectedImagePath]);

   const goTo = useCallback(
      (index: number): void => {
         const nextIndex = Math.max(0, Math.min(groups.length - 1, index));
         if (nextIndex === currentIndex) {
            return;
         }

         setTravelDirection(nextIndex > currentIndex ? "right" : "left");
         setCompare(null);
         setComparePick(null);
         setSelectedImagePath(null);
         setCurrentIndex(nextIndex);
         window.setTimeout(() => setTravelDirection("idle"), 180);
      },
      [currentIndex, groups]
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
      advanceFromImageSet,
      autoCompleteImageSet,
      autoCompleteSimilarityGroup,
      clearAllChoices,
      clearImageSetChoices,
      clearSimilarityGroupChoices,
      deleteImageSet,
      deleteSimilarityGroup,
      markImageSetCompleted,
      markSimilarityGroupCompleted,
      toggleImageDeletion,
      toggleOnlyImageKept,
   } = createReviewActions({ currentIndex, decisions, groups, goTo, updateDecisions });

   const requestDeleteImageSet = (imageSet: ImageSet): void => {
      if (confirmMajorActions) {
         setConfirmAction({ ...createConfirmAction("deleteAll"), groupId: imageSet.id });
         return;
      }
      deleteImageSet(imageSet);
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
         await api.openGroupFolder(folderPath);
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

   const autoCompleteCurrentSimilarity = (): void => {
      if (currentGroup !== null) {
         autoCompleteSimilarityGroup(currentGroup);
      }
   };

   const openContextMenu = (event: MouseEvent, kind: ContextMenuKind, image?: ImageItem, imageSet?: ImageSet): void => {
      event.preventDefault();
      event.stopPropagation();
      hideTooltip();
      if (image !== undefined) {
         setSelectedImagePath(image.originalPath);
      }
      const { width, height } = getContextMenuSize(kind);
      const position = getAnchoredPosition(event.clientX, event.clientY, width, height);
      setContextMenu({
         kind,
         ...position,
         ...(image === undefined ? {} : { imagePath: image.originalPath }),
         ...(imageSet === undefined ? {} : { groupId: imageSet.id }),
      });
   };

   const openContextMenuFromButton = (event: MouseEvent, kind: ContextMenuKind, imageSet?: ImageSet): void => {
      const rect = event.currentTarget.getBoundingClientRect();
      const { width, height } = getContextMenuSize(kind);
      const position = getButtonMenuPosition(rect, width, height);
      setContextMenu({ kind, ...position, ...(imageSet === undefined ? {} : { groupId: imageSet.id }) });
      hideTooltip();
   };

   const openImageContextMenuFromButton = (event: MouseEvent, image: ImageItem): void => {
      event.preventDefault();
      event.stopPropagation();
      if (currentGroup === null) {
         return;
      }

      hideTooltip();
      setSelectedImagePath(image.originalPath);
      const rect = event.currentTarget.getBoundingClientRect();
      const { width, height } = getContextMenuSize("image");
      const position = getButtonMenuPosition(rect, width, height);
      setContextMenu({ kind: "image", imagePath: image.originalPath, groupId: currentGroup.id, ...position });
   };

   const openImageSetContextMenu = (event: MouseEvent, imageSet: ImageSet): void => {
      openContextMenu(event, "imageSet", undefined, imageSet);
   };

   const getImageIndex = (image: ImageItem): number => currentGroup?.images.findIndex((item) => item.originalPath === image.originalPath) ?? -1;

   const openAdjacentCompare = (image: ImageItem): void => {
      if (currentGroup === null || image.sourceStatus !== "available") {
         return;
      }

      const imageIndex = getImageIndex(image);
      const adjacentImage =
         currentGroup.images.slice(imageIndex + 1).find((candidate) => candidate.sourceStatus === "available") ??
         currentGroup.images
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
      if (currentGroup === null || image.sourceStatus !== "available") {
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
      if (currentGroup === null) {
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
         toggleImageDeletion(currentGroup, image, event.ctrlKey);
         return;
      }
   };

   const handleImageDoubleClick = (event: MouseEvent, image: ImageItem): void => {
      event.preventDefault();
      event.stopPropagation();
      if (image.sourceStatus === "missing" || image.sourceStatus === "recycledByApp") {
         notify({ tone: "warning", title: "Preview unavailable", message: `${image.file} is no longer available on disk.` });
         return;
      }
      setPreviewImage(image);
   };

   const handleContextMenu = (event: MouseEvent, image: ImageItem): void => {
      if (currentGroup === null) {
         return;
      }

      if (event.altKey) {
         event.preventDefault();
         openAdjacentCompare(image);
         return;
      }

      if (event.shiftKey) {
         event.preventDefault();
         toggleOnlyImageKept(currentGroup, image, event.ctrlKey);
         return;
      }

      openContextMenu(event, "image", image, currentGroup);
   };

   const handleImageDeleteToggle = (event: MouseEvent, image: ImageItem): void => {
      event.preventDefault();
      event.stopPropagation();
      if (currentGroup !== null) {
         setSelectedImagePath(image.originalPath);
         toggleImageDeletion(currentGroup, image, event.ctrlKey);
      }
   };

   useReviewShortcuts({
      blocked: isStartupOpen || isSettingsOpen || contextMenu !== null || confirmAction !== null || view !== "review",
      compare,
      confirmOpen: confirmAction !== null,
      contextMenuOpen: contextMenu !== null,
      hasCurrentGroup: currentGroup !== null,
      hasSelectedImage: selectedImage !== null,
      previewOpen: previewImage !== null,
      onAutoCompleteGroup: autoCompleteCurrentSimilarity,
      onCloseCompare: () => {
         setCompare(null);
         setComparePick(null);
      },
      onCloseConfirm: () => setConfirmAction(null),
      onCloseContextMenu: () => setContextMenu(null),
      onClosePanels: () => {
         setIsSettingsOpen(false);
      },
      onClosePreview: () => setPreviewImage(null),
      onKeepCompareImage: (side) => {
         if (currentGroup !== null && compare !== null) toggleOnlyImageKept(currentGroup, compare[side], true);
         setCompare(null);
      },
      onKeepCurrentSet: (advance) => {
         if (currentGroup === null) return;
         markImageSetCompleted(currentGroup);
         if (advance) advanceFromImageSet(currentGroup);
      },
      onKeepSimilarityGroup: () => {
         if (currentGroup !== null) markSimilarityGroupCompleted(currentGroup);
      },
      onNavigate: (offset) => goTo(currentIndex + offset),
      onNavigateBand: goToAdjacentSimilarityBand,
      onRedo: redoLastDecision,
      onRequestDeleteCurrentSet: () => {
         if (currentGroup !== null) requestDeleteImageSet(currentGroup);
      },
      onToggleImageAtIndex: (index, advance) => {
         const image = currentGroup?.images[index];
         if (currentGroup !== null && image !== undefined) toggleImageDeletion(currentGroup, image, advance);
      },
      onToggleSelectedImage: (advance) => {
         if (currentGroup !== null && selectedImage !== null) toggleImageDeletion(currentGroup, selectedImage, advance);
      },
      onUndo: undoLastDecision,
   });

   useEffect(() => {
      const onPointerDown = (): void => setContextMenu(null);
      window.addEventListener("pointerdown", onPointerDown);
      return () => window.removeEventListener("pointerdown", onPointerDown);
   }, []);

   useEffect(() => {
      if (contextMenu === null) return undefined;
      const frame = window.requestAnimationFrame(() => contextMenuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus());
      return () => window.cancelAnimationFrame(frame);
   }, [contextMenu]);

   useEffect(() => {
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
   }, [currentIndex, goTo]);

   const chooseScanFolder = async (): Promise<string | null> => {
      const api = window.imageDeduplicator;
      try {
         const selectedPath = await api.chooseFolder();
         return selectedPath;
      } catch (unknownError: unknown) {
         reportError("Couldn’t choose a folder", unknownError, "Failed to choose a folder");
         return null;
      }
   };

   const startScan = async (rootPath = scanRoot): Promise<void> => {
      const api = window.imageDeduplicator;
      if (rootPath === null) return;

      setIsScanning(true);
      setScanProgress({ phase: "discovering", completed: 0, total: 0 });
      try {
         const result = await api.scanFolder({ rootPath });
         setGroups(result.groups);
         replaceDecisions(result.decisions);
         setScanRoot(result.scanRoot);
         setDuplicateFolderPath(result.duplicateFolderPath);
         setCurrentIndex(0);
         setSelectedImagePath(result.groups[0]?.images[0]?.originalPath ?? null);
         setView("review");
         clearFileResults();
         setDuplicateFolderHasContent(result.duplicateFolderHasContent);
         setLastFileAction(result.lastFileAction);
         notify({
            tone: "success",
            title: result.groups.length === 0 ? "Scan complete" : "Duplicate sets ready",
            message: result.groups.length === 0 ? "No matching image sets were found." : `Found ${result.groups.length} duplicate set${result.groups.length === 1 ? "" : "s"}.`,
         });
         if (result.scanWarningCount > 0) {
            notify({
               tone: "warning",
               title: "Some items were skipped",
               message: `${result.scanWarningCount} unreadable image or folder${result.scanWarningCount === 1 ? " was" : "s were"} skipped.`,
            });
         }
      } catch (unknownError: unknown) {
         reportError("Scan failed", unknownError, "Failed to scan the selected folder");
      } finally {
         setIsScanning(false);
      }
   };

   const openNewFolder = async (): Promise<void> => {
      const selectedPath = await chooseScanFolder();
      if (selectedPath === null) {
         return;
      }

      setIsStartupOpen(false);
      await startScan(selectedPath);
   };

   const updateStartupPreference = (checked: boolean): void => {
      setShowStartupOnLaunch(checked);
      window.localStorage.setItem(startupPreferenceKey, String(checked));
   };

   const handleDrop = (event: DragEvent): void => {
      event.preventDefault();
      const folderPath = getDroppedFolderPath(event);
      if (folderPath !== null) {
         setIsStartupOpen(false);
         void startScan(folderPath);
      }
   };

   const runConfirmAction = (): void => {
      if (confirmAction === null) {
         return;
      }

      const { kind } = confirmAction;
      setConfirmAction(null);
      if (kind === "deleteAll") {
         const targetGroup =
            confirmAction.groupId === undefined ? currentGroup : (groups.find((imageSet) => imageSet.id === confirmAction.groupId) ?? currentGroup);
         if (targetGroup !== null) {
            deleteImageSet(targetGroup);
         }
      } else if (kind === "clearAll") {
         confirmClearAllDecisions();
      } else if (kind === "trashDuplicate") {
         void trashDuplicateFolder();
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
            <ScanningScreen progress={scanProgress} />
            <NotificationCenter notifications={notifications} onDismiss={dismissNotification} />
         </>
      );
   }

   if (isStartupOpen || currentGroup === null) {
      return (
         <>
            <StartupScreen
               canRescan={scanRoot !== null}
               hasSavedReview={groups.length > 0}
               onContinue={() => setIsStartupOpen(false)}
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
            {confirmAction !== null && <ConfirmDialog action={confirmAction} onCancel={() => setConfirmAction(null)} onConfirm={runConfirmAction} />}
            <NotificationCenter notifications={notifications} onDismiss={dismissNotification} />
         </>
      );
   }

   const totalGroups = groups.length;
   const reviewedGroups = patchPreview.completedImageSets;
   const reviewProgress = totalGroups === 0 ? 0 : reviewedGroups / totalGroups;
   const reviewPercent = Math.round(reviewProgress * 100);
   const folderName = getFolderName(scanRoot);
   const duplicateDestination = duplicateFolderPath ?? "No managed duplicate folder";
   const contextImageSet = contextMenu?.groupId === undefined ? currentGroup : (groups.find((imageSet) => imageSet.id === contextMenu.groupId) ?? currentGroup);
   const contextImageSetDecision = getDecision(decisions, contextImageSet.id);
   const contextImage =
      contextMenu?.imagePath === undefined
         ? selectedImage
         : (contextImageSet.images.find((image) => image.originalPath === contextMenu.imagePath) ?? selectedImage);
   const contextDeletedPaths = getDeletedImagePaths(contextImageSetDecision);
   const contextImageIsDeleted = contextImage === null ? false : contextDeletedPaths.has(contextImage.originalPath);
   const contextOnlyImageKept =
      contextImage !== null &&
      !contextImageIsDeleted &&
      contextImageSet.images.every((image) => image.originalPath === contextImage.originalPath || contextDeletedPaths.has(image.originalPath));

   return (
      <main className={`shell${wrapImageShelf ? " shell--wrapShelf" : ""}`}>
         <ReviewHeader
            canRedo={canRedo}
            canUndo={canUndo}
            currentNumber={getDetectionNumber(currentGroup.id)}
            folderName={folderName}
            getTooltipProps={getTooltipProps}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenStartup={() => {
               setIsSettingsOpen(false);
               setIsStartupOpen(true);
            }}
            onRedo={redoLastDecision}
            onToggleView={() => setView(view === "review" ? "patch" : "review")}
            onUndo={undoLastDecision}
            reviewPercent={reviewPercent}
            totalSets={groups.length}
            view={view}
         />

         {view === "review" ? (
            <ReviewWorkspace
               comparePick={comparePick}
               currentDecision={currentDecision}
               currentGroup={currentGroup}
               currentIndex={currentIndex}
               decisions={decisions}
               filmstripEdges={filmstripEdges}
               filmstripRef={filmstripRef}
               getTooltipProps={getTooltipProps}
               onImageBadgeClick={openImageContextMenuFromButton}
               onImageClick={handleImageClick}
               onImageContextMenu={handleContextMenu}
               onImageDoubleClick={handleImageDoubleClick}
               onImageSetContextMenu={openImageSetContextMenu}
               onImageToggleDelete={handleImageDeleteToggle}
               onNavigate={goTo}
               onOpenContextMenu={openContextMenu}
               onOpenContextMenuFromButton={openContextMenuFromButton}
               selectedImagePath={selectedImagePath}
               similarityBands={similarityBands}
               travelDirection={travelDirection}
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
               onApply={() => void applyPatch()}
               onOpenFolder={() => void openFolder(currentGroup.folderPath)}
               onRestore={() => void restoreDuplicateFolder()}
               onTrash={() => (confirmMajorActions ? setConfirmAction(createConfirmAction("trashDuplicate")) : void trashDuplicateFolder())}
               patchResult={patchResult}
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

         {contextMenu !== null && (
            <ReviewContextMenu
               context={contextMenu}
               image={contextImage}
               imageIsDeleted={contextImageIsDeleted}
               menuRef={contextMenuRef}
               onAutoCompleteImageSet={() => autoCompleteImageSet(contextImageSet)}
               onAutoCompleteSimilarityGroup={() => autoCompleteSimilarityGroup(contextImageSet)}
               onBeginCompare={() => {
                  if (contextImage !== null) beginCompare(contextImage);
               }}
               onClearImageSet={() => clearImageSetChoices(contextImageSet)}
               onClearSimilarityGroup={() => clearSimilarityGroupChoices(contextImageSet)}
               onClose={() => setContextMenu(null)}
               onDeleteImageSet={() => requestDeleteImageSet(contextImageSet)}
               onDeleteSimilarityGroup={() => deleteSimilarityGroup(contextImageSet)}
               onMarkImageSetCompleted={() => markImageSetCompleted(contextImageSet)}
               onMarkSimilarityGroupCompleted={() => markSimilarityGroupCompleted(contextImageSet)}
               onOpenImage={() => {
                  if (contextImage !== null) void openImage(contextImage);
               }}
               onShowImage={() => {
                  if (contextImage !== null) void showImage(contextImage);
               }}
               onToggleImage={() => {
                  if (contextImage !== null) toggleImageDeletion(contextImageSet, contextImage, false);
               }}
               onToggleOtherImages={() => {
                  if (contextImage !== null) toggleOnlyImageKept(contextImageSet, contextImage, false);
               }}
               onlyImageIsKept={contextOnlyImageKept}
            />
         )}

         {tooltip !== null && (
            <div className={`tooltipBubble tooltipBubble--${tooltip.placement}`} style={{ left: tooltip.x, top: tooltip.y }} role="tooltip">
               <strong>{tooltip.title}</strong>
               <span>{tooltip.body}</span>
               {tooltip.hotkey !== undefined && <kbd>{tooltip.hotkey}</kbd>}
            </div>
         )}

         {confirmAction !== null && <ConfirmDialog action={confirmAction} onCancel={() => setConfirmAction(null)} onConfirm={runConfirmAction} />}

         {compare !== null && (
            <CompareOverlay
               compare={compare}
               onClose={() => setCompare(null)}
               onKeep={(image) => {
                  toggleOnlyImageKept(currentGroup, image, false);
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
