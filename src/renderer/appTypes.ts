import type { Decisions, ImageItem, ImageSet } from "../shared/types.js";

export interface CompareState {
   left: ImageItem;
   right: ImageItem;
   leftIndex: number;
   rightIndex: number;
   reveal: number;
}

export type TravelDirection = "idle" | "left" | "right";
export type ImageSetState = "open" | "someDeleted" | "allDeleted";
export type ImageDeleteState = "active" | "deleted";
export type ImageCaptionMode = "none" | "names" | "details";
export type ConfirmKind = "discardSet" | "discardBand" | "applyMoves" | "clearAll" | "trashDuplicate" | "switchFolder";

export interface SimilarityBand {
   label: string;
   distance: number;
   groups: { imageSet: ImageSet; index: number }[];
}

export interface ConfirmAction {
   kind: ConfirmKind;
   title: string;
   body: string;
   confirmLabel: string;
   setId?: string;
   folderPath?: string;
   decisions?: Decisions;
   scanId?: string;
}

export interface MovePreview {
   setId: string;
   file: string;
   originalPath: string;
   previewUrl: string;
   size: number;
}

export interface FileWorkflowState {
   discardedCount: number;
   readyToMoveCount: number;
   movedCount: number;
   recycledCount: number;
   missingCount: number;
}

export interface ScanWarnings {
   count: number;
   paths: string[];
}

export interface TooltipAnchor {
   centerX: number;
   top: number;
   bottom: number;
}

export interface TooltipState {
   title: string;
   body: string;
   hotkey?: string;
   anchor: TooltipAnchor;
}

export type ContextMenuKind = "image" | "imageSet" | "similarityBand";

export type ContextMenuAnchor = { kind: "point"; x: number; y: number } | { kind: "rect"; rect: DOMRect };

export interface ContextMenuState {
   menuKind: ContextMenuKind;
   anchor: ContextMenuAnchor;
   imagePath?: string;
   setId?: string;
}
