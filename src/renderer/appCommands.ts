import type { ImageItem, ImageSet } from "../shared/types.js";
import type { CompareState, ConfirmAction } from "./appTypes.js";
import type { Commands } from "./commands.js";
import { createConfirmAction } from "./reviewModel.js";

interface ReviewCommandOptions {
   loading: boolean;
   isScanning: boolean;
   fileOperationActive: boolean;
   openNewFolder: () => Promise<void>;
   setIsSettingsOpen: (open: boolean) => void;
   setIsInfoOpen: (open: boolean) => void;
   setIsStartupOpen: (open: boolean) => void;
   canUndo: boolean;
   canRedo: boolean;
   confirmAction: ConfirmAction | null;
   undoLastDecision: () => void;
   redoLastDecision: () => void;
   groups: ImageSet[];
   setConfirmAction: (action: ConfirmAction) => void;
   reviewCommandsActive: boolean;
   currentSet: ImageSet | null;
   requestDiscardSet: (imageSet: ImageSet) => void;
   autoSelectImageSet: (imageSet: ImageSet) => void;
   requestBandAutoselect: (imageSet: ImageSet) => void;
   clearImageSetChoices: (imageSet: ImageSet) => void;
   selectedImage: ImageItem | null;
   beginCompare: (image: ImageItem) => void;
   openAdjacentCompare: (image: ImageItem) => void;
   previewImageOf: (image: ImageItem) => void;
   toggleImageRemoval: (imageSet: ImageSet, image: ImageItem, advance: boolean) => void;
   reviewActive: boolean;
   compare: CompareState | null;
   keepCompareImage: (image: ImageItem, advance: boolean) => void;
   goTo: (index: number) => void;
   currentIndex: number;
   goToAdjacentSimilarityBand: (direction: -1 | 1) => void;
   isFinalReviewOpen: boolean;
   setIsFinalReviewOpen: (open: boolean) => void;
   setIsAboutOpen: (open: boolean) => void;
   openReleasesPage: () => void;
}

// --- Command registry -----------------------------------------------------
// Availability is re-checked at run time, so commands can never act on a
// surface that is no longer in front of the user. Rebuilt each render;
// useCommands reads the latest object through its ref.
export const buildReviewCommands = ({
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
   openReleasesPage,
}: ReviewCommandOptions): Commands => {
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
            openReleasesPage();
         },
      },
   };
};
