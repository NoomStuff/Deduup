import { useState } from "react";
import type { MouseEvent } from "react";
import type { Decisions, ImageItem, ImageSet } from "../../shared/types.js";
import type { ContextMenuState } from "../appTypes.js";
import { getDecision, getDeletedImagePaths } from "../reviewModel.js";

interface ReviewContextMenuOptions {
   groups: ImageSet[];
   currentSet: ImageSet | null;
   decisions: Decisions;
   selectedImage: ImageItem | null;
   selectImage: (imagePath: string | null) => void;
   hideTooltip: () => void;
}

/**
 * Owns the review context menu: where it anchors, which image, set, or band it
 * targets, and the derived state the menu commands render from.
 */
export const useReviewContextMenu = ({ groups, currentSet, decisions, selectedImage, selectImage, hideTooltip }: ReviewContextMenuOptions) => {
   const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

   const openImageContextMenu = (event: MouseEvent, image: ImageItem): void => {
      if (currentSet === null) return;
      event.preventDefault();
      event.stopPropagation();
      hideTooltip();
      selectImage(image.originalPath);
      setContextMenu({
         menuKind: "image",
         imagePath: image.originalPath,
         setId: currentSet.id,
         anchor: { kind: "point", x: event.clientX, y: event.clientY },
      });
   };

   const openSetContextMenu = (event: MouseEvent, imageSet: ImageSet): void => {
      event.preventDefault();
      event.stopPropagation();
      hideTooltip();
      setContextMenu({ menuKind: "imageSet", setId: imageSet.id, anchor: { kind: "point", x: event.clientX, y: event.clientY } });
   };

   const closeContextMenu = (): void => setContextMenu(null);

   if (contextMenu === null || currentSet === null) {
      return {
         contextMenu,
         setContextMenu,
         openImageContextMenu,
         openSetContextMenu,
         closeContextMenu,
         contextSet: null,
         contextImage: null,
         contextImageIsDeleted: false,
         contextOnlyImageKept: false,
      };
   }

   const contextSet = contextMenu.setId === undefined ? currentSet : (groups.find((imageSet) => imageSet.id === contextMenu.setId) ?? currentSet);
   const contextImage =
      contextMenu.imagePath === undefined ? selectedImage : (contextSet.images.find((image) => image.originalPath === contextMenu.imagePath) ?? selectedImage);
   const contextDeletedPaths = getDeletedImagePaths(getDecision(decisions, contextSet.id));
   const contextImageIsDeleted = contextImage === null ? false : contextDeletedPaths.has(contextImage.originalPath);
   const contextOnlyImageKept =
      contextImage !== null &&
      !contextImageIsDeleted &&
      contextSet.images.every((image) => image.originalPath === contextImage.originalPath || contextDeletedPaths.has(image.originalPath));

   return {
      contextMenu,
      setContextMenu,
      openImageContextMenu,
      openSetContextMenu,
      closeContextMenu,
      contextSet,
      contextImage,
      contextImageIsDeleted,
      contextOnlyImageKept,
   };
};
