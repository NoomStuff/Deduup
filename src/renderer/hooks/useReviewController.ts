import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentProps, MouseEvent } from "react";
import type { Decisions, ImageItem, ImageSet } from "../../shared/types.js";
import type { ConfirmAction, SimilarityBand, TravelDirection } from "../appTypes.js";
import { countBandDiscardOverrides, countBandSets, createReviewActions } from "../reviewActions.js";
import { createConfirmAction, getResumeIndex } from "../reviewModel.js";
import type { ReviewWorkspace } from "../components/ReviewWorkspace.js";
import type { ReviewContextMenu } from "../components/ReviewContextMenu.js";
import { useCompareController } from "./useCompareController.js";
import type { NotificationInput } from "./useNotifications.js";
import { useReviewContextMenu } from "./useReviewContextMenu.js";

type WorkspaceProps = ComponentProps<typeof ReviewWorkspace>;
type WorkspaceActions = Pick<WorkspaceProps, Extract<keyof WorkspaceProps, `on${Capitalize<string>}`>>;
type ContextMenuProps = ComponentProps<typeof ReviewContextMenu>;
type ContextMenuActions = Pick<ContextMenuProps, Extract<keyof ContextMenuProps, `on${Capitalize<string>}`>>;

interface ReviewControllerOptions {
   groups: ImageSet[];
   currentSet: ImageSet | null;
   currentIndex: number;
   setCurrentIndex: (index: number) => void;
   selectedImagePath: string | null;
   setSelectedImagePath: (path: string | null) => void;
   selectedImage: ImageItem | null;
   similarityBands: SimilarityBand[];
   decisions: Decisions;
   updateDecisions: (updater: (current: Decisions) => Decisions) => void;
   confirmMajorActions: boolean;
   setConfirmAction: (action: ConfirmAction) => void;
   clearFileResults: () => void;
   notify: (notification: NotificationInput) => void;
   reportError: (title: string, error: unknown, fallback: string) => void;
   hideTooltip: () => void;
}

export const useReviewController = ({
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
}: ReviewControllerOptions) => {
   const [previewImage, setPreviewImage] = useState<ImageItem | null>(null);
   const [travelDirection, setTravelDirection] = useState<TravelDirection>("idle");

   useEffect(() => {
      if (currentSet === null) {
         setSelectedImagePath(null);
         return;
      }

      if (selectedImagePath !== null && !currentSet.images.some((image) => image.originalPath === selectedImagePath)) {
         setSelectedImagePath(null);
      }
   }, [currentSet, selectedImagePath, setSelectedImagePath]);

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
      [closeCompare, currentIndex, groups.length, hideTooltip, setCurrentIndex, setSelectedImagePath]
   );

   const goToAdjacentSimilarityBand = useCallback(
      (direction: -1 | 1): void => {
         const currentBandIndex = similarityBands.findIndex((band) => band.groups.some((group) => group.index === currentIndex));
         const targetBand = similarityBands[currentBandIndex + direction];
         if (targetBand === undefined) {
            return;
         }

         const target = direction === 1 ? targetBand.groups[0] : targetBand.groups.at(-1);
         if (target !== undefined) goTo(target.index);
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
   } = useMemo(() => createReviewActions({ currentIndex, groups, goTo, updateDecisions }), [currentIndex, groups, goTo, updateDecisions]);

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
         reportError("Couldn't open the folder", unknownError, "Failed to open the folder");
      }
   };

   const showImage = async (image: ImageItem): Promise<void> => {
      const api = window.imageDeduplicator;
      try {
         await api.showImage(image.currentPath);
      } catch (unknownError: unknown) {
         reportError("Couldn't show the image", unknownError, "Failed to show the image");
      }
   };

   const openImage = async (image: ImageItem): Promise<void> => {
      const api = window.imageDeduplicator;
      try {
         await api.openImage(image.currentPath);
      } catch (unknownError: unknown) {
         reportError("Couldn't open the image", unknownError, "Failed to open the image");
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

   const handleImageClick = useCallback(
      (event: MouseEvent, image: ImageItem): void => {
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
      },
      [beginCompare, comparePick, currentSet, setSelectedImagePath, toggleImageRemoval]
   );

   const previewImageOf = useCallback(
      (image: ImageItem): void => {
         if (image.sourceStatus === "missing" || image.sourceStatus === "recycledByApp") {
            notify({ tone: "warning", title: "Preview unavailable", message: `${image.file} is no longer available on disk.` });
            return;
         }
         setPreviewImage(image);
      },
      [notify]
   );

   const handleImageDoubleClick = useCallback(
      (event: MouseEvent, image: ImageItem): void => {
         event.preventDefault();
         event.stopPropagation();
         previewImageOf(image);
      },
      [previewImageOf]
   );

   const handleImageContextMenu = useCallback(
      (event: MouseEvent, image: ImageItem): void => {
         if (event.shiftKey && currentSet !== null) {
            event.preventDefault();
            event.stopPropagation();
            setSelectedImagePath(image.originalPath);
            toggleOnlyImageKept(currentSet, image, event.ctrlKey);
         } else openImageContextMenu(event, image);
      },
      [currentSet, openImageContextMenu, setSelectedImagePath, toggleOnlyImageKept]
   );

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

   const getWorkspaceActions = (currentSet: ImageSet): WorkspaceActions => ({
      onBeginComparePick: () => {
         if (selectedImage !== null) beginCompare(selectedImage);
      },
      onClearSet: () => clearImageSetChoices(currentSet),
      onCompareSelected: () => {
         if (selectedImage !== null) openAdjacentCompare(selectedImage);
      },
      onDiscardSelected: () => {
         if (selectedImage !== null) toggleImageRemoval(currentSet, selectedImage, false);
      },
      onDiscardSet: () => requestDiscardSet(currentSet),
      onImageClick: handleImageClick,
      onImageContextMenu: handleImageContextMenu,
      onImageDoubleClick: handleImageDoubleClick,
      onImageSetContextMenu: openSetContextMenu,
      onNavigate: goTo,
      onOpenContextMenu: setContextMenu,
      onOpenSetFolder: () => void openFolder(currentSet.folderPath),
      onPreviewSelected: () => {
         if (selectedImage !== null) previewImageOf(selectedImage);
      },
   });

   const getContextMenuActions = (contextSet: ImageSet): ContextMenuActions => ({
      onAutoSelectImageSet: () => autoSelectImageSet(contextSet),
      onAutoSelectBand: () => requestBandAutoselect(contextSet),
      onBeginCompare: () => {
         if (contextImage !== null) beginCompare(contextImage);
      },
      onClearImageSet: () => clearImageSetChoices(contextSet),
      onClearBand: () => clearSimilarityBandChoices(contextSet),
      onClose: closeContextMenu,
      onDiscardSet: () => requestDiscardSet(contextSet),
      onDiscardBand: () => requestDiscardBand(contextSet),
      onOpenImage: () => {
         if (contextImage !== null) void openImage(contextImage);
      },
      onPreviewImage: () => {
         if (contextImage !== null) previewImageOf(contextImage);
      },
      onShowImage: () => {
         if (contextImage !== null) void showImage(contextImage);
      },
      onToggleImage: () => {
         if (contextImage !== null) toggleImageRemoval(contextSet, contextImage, false);
      },
      onToggleOtherImages: () => {
         if (contextImage !== null) toggleOnlyImageKept(contextSet, contextImage, false);
      },
   });

   return {
      getWorkspaceActions,
      getContextMenuActions,
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
   };
};
