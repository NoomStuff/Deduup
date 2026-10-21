import { useCallback, useEffect, useMemo, useState } from "react";
import type { ConfirmAction, ImageCaptionMode } from "./appTypes.js";
import { buildReviewCommands } from "./appCommands.js";
import type { ShortcutOverrides } from "./commands.js";
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
import { TitleBar } from "./components/TitleBar.js";
import { TooltipBubble } from "./components/TooltipBubble.js";
import { LoadingScreen, ScanWarningsBanner, ScanningScreen, StartupScreen } from "./components/AppStatusScreens.js";
import { useAppUpdates } from "./hooks/useAppUpdates.js";
import { useDecisionHistory } from "./hooks/useDecisionHistory.js";
import { useFileWorkflowActions } from "./hooks/useFileWorkflowActions.js";
import { useFilmstrip } from "./hooks/useFilmstrip.js";
import { useFolderSelection } from "./hooks/useFolderSelection.js";
import { useApplyScanResult, useLibraryBootstrap, useLibrarySync } from "./hooks/useLibrarySync.js";
import { useNotifications } from "./hooks/useNotifications.js";
import { usePreference, preferenceKeys, useEnumPreference } from "./hooks/usePreference.js";
import { usePreviewPreloader } from "./hooks/usePreviewPreloader.js";
import { useReviewController } from "./hooks/useReviewController.js";
import { useReviewPersistence } from "./hooks/useReviewPersistence.js";
import { useScanController } from "./hooks/useScanController.js";
import { useTooltip } from "./hooks/useTooltip.js";
import {
   createConfirmAction,
   emptyImageSetDecision,
   getDecision,
   getDuplicatePreview,
   getFolderName,
   getFileWorkflowState,
   getMovePreview,
   getSetNumber,
   getSimilarityBands,
} from "./reviewModel.js";

export const App = () => {
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
   const [selectedImagePath, setSelectedImagePath] = useState<string | null>(null);
   const [isFinalReviewOpen, setIsFinalReviewOpen] = useState(false);
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

   useEffect(() => {
      saveShortcutOverrides(shortcutOverrides);
   }, [shortcutOverrides]);

   const reportError = useCallback(
      (title: string, unknownError: unknown, fallback: string): void => {
         notify({ tone: "error", title, message: unknownError instanceof Error ? unknownError.message : fallback });
      },
      [notify]
   );

   const library = useLibrarySync({
      currentIndex,
      setCurrentIndex,
      setSelectedImagePath,
      setIsStartupOpen,
      replaceDecisions,
      reconcileHistory,
      notify,
      reportError,
   });
   const {
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
   } = library;
   const currentSet = groups[currentIndex] ?? null;
   const currentDecision = currentSet === null ? emptyImageSetDecision() : getDecision(decisions, currentSet.id);
   const movePreview = useMemo(() => getMovePreview(groups, decisions), [decisions, groups]);
   const duplicatePreview = useMemo(() => getDuplicatePreview(groups, decisions), [decisions, groups]);
   const fileWorkflow = useMemo(() => getFileWorkflowState(groups, decisions), [decisions, groups]);
   const similarityBands = useMemo(() => getSimilarityBands(groups), [groups]);
   const selectedImage = currentSet?.images.find((image) => image.originalPath === selectedImagePath) ?? null;

   const { availableUpdate, updateActions, updateStatus } = useAppUpdates({ loading, reportError });

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

   const applyScanResult = useApplyScanResult(library.applyScanResult, clearFileResults);
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

   useLibraryBootstrap(library.bootstrap);

   useReviewPersistence({ loading: loading || !hydrated || isScanning || fileOperationActive, scanId, decisions, currentSet, reportError });

   const {
      previewImage,
      setPreviewImage,
      previewImages,
      travelDirection,
      beginCompare,
      closeCompare,
      compare,
      comparePick,
      keepCompareImage,
      openAdjacentCompare,
      goTo,
      goToAdjacentSimilarityBand,
      autoSelectImageSet,
      clearImageSetChoices,
      toggleImageRemoval,
      discardSet,
      discardBand,
      requestBandAutoselect,
      requestDiscardSet,
      confirmClearAllDecisions,
      openFolder,
      contextMenu,
      contextSet,
      contextImage,
      contextImageIsDeleted,
      contextOnlyImageKept,
      previewImageOf,
      keepFromFinalReview,
      getWorkspaceActions,
      getContextMenuActions,
   } = useReviewController({
      groups,
      currentSet,
      currentIndex,
      setCurrentIndex,
      selectedImagePath,
      setSelectedImagePath,
      selectedImage,
      similarityBands,
      decisions,
      updateDecisions,
      confirmMajorActions,
      setConfirmAction,
      clearFileResults,
      notify,
      reportError,
      hideTooltip,
   });

   // The hint bar retires itself after the first discard, so it never nags.
   const hasAnyDiscards = useMemo(() => Object.values(decisions).some((decision) => decision.deletedImages.length > 0), [decisions]);
   useEffect(() => {
      if (!reviewHintsDismissed && hasAnyDiscards) setReviewHintsDismissed(true);
   }, [hasAnyDiscards, reviewHintsDismissed, setReviewHintsDismissed]);

   const reviewCommandsActive = reviewActive && compare === null;

   const commands = buildReviewCommands({
      loading,
      isScanning,
      fileOperationActive,
      openNewFolder,
      setIsSettingsOpen,
      setIsInfoOpen,
      setIsStartupOpen,
      canUndo,
      canRedo,
      confirmAction,
      undoLastDecision,
      redoLastDecision,
      groups,
      setConfirmAction,
      reviewCommandsActive,
      currentSet,
      requestDiscardSet,
      autoSelectImageSet,
      requestBandAutoselect,
      clearImageSetChoices,
      selectedImage,
      beginCompare,
      openAdjacentCompare,
      previewImageOf,
      toggleImageRemoval,
      reviewActive,
      compare,
      keepCompareImage,
      goTo,
      currentIndex,
      goToAdjacentSimilarityBand,
      isFinalReviewOpen,
      setIsFinalReviewOpen,
      setIsAboutOpen,
      openReleasesPage: () => {
         void window.imageDeduplicator
            .openExternal("https://github.com/NoomStuff/Deduup/releases")
            .catch((error: unknown) => reportError("Couldn't open the releases page", error, "Failed to open the releases page"));
      },
   });

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
                        {...getWorkspaceActions(currentSet)}
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
                  onlyImageIsKept={contextOnlyImageKept}
                  {...getContextMenuActions(contextSet)}
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
