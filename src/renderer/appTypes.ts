import type { ImageItem, ImageSet } from "../shared/types.js";

export interface CompareState {
   left: ImageItem;
   right: ImageItem;
   leftIndex: number;
   rightIndex: number;
   reveal: number;
}

export type PatchView = "review" | "patch";
export type TravelDirection = "idle" | "left" | "right";
export type ImageSetState = "open" | "seen" | "someDeleted" | "allDeleted";
export type ImageDeleteState = "active" | "deleted";
export type ConfirmKind = "deleteAll" | "clearAll" | "trashDuplicate" | "rescan";

export interface SimilarityBand {
   label: string;
   groups: { imageSet: ImageSet; index: number }[];
}

export interface ConfirmAction {
   kind: ConfirmKind;
   title: string;
   body: string;
   confirmLabel: string;
   groupId?: string;
}

export interface MovePreview {
   groupId: string;
   file: string;
   previewUrl: string;
   size: number;
}

export interface FileWorkflowState {
   markedCount: number;
   readyToMoveCount: number;
   movedCount: number;
   recycledCount: number;
   missingCount: number;
}

export interface TooltipState {
   title: string;
   body: string;
   hotkey?: string;
   x: number;
   y: number;
   placement: "top" | "bottom";
}

export type ContextMenuKind = "image" | "imageSet" | "similarityGroup";

export interface ContextMenuState {
   kind: ContextMenuKind;
   imagePath?: string;
   groupId?: string;
   x: number;
   y: number;
}
