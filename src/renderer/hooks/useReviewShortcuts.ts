import { useEffect } from "react";
import type { CompareState } from "../appTypes.js";

const editableTargetSelector = "input,textarea,select,[contenteditable='true']";

const isEditableShortcut = (event: KeyboardEvent): boolean => {
   const editable = event.target instanceof HTMLElement && event.target.closest(editableTargetSelector) !== null;
   if (!editable) return false;
   const key = event.key.toLowerCase();
   return !((event.ctrlKey || event.metaKey) && (key === "z" || key === "y"));
};

interface ReviewShortcuts {
   blocked: boolean;
   compare: CompareState | null;
   confirmOpen: boolean;
   contextMenuOpen: boolean;
   hasCurrentGroup: boolean;
   hasSelectedImage: boolean;
   previewOpen: boolean;
   onAutoCompleteGroup: () => void;
   onCloseCompare: () => void;
   onCloseConfirm: () => void;
   onCloseContextMenu: () => void;
   onClosePanels: () => void;
   onClosePreview: () => void;
   onKeepCompareImage: (side: "left" | "right") => void;
   onKeepCurrentSet: (advance: boolean) => void;
   onKeepSimilarityGroup: () => void;
   onNavigate: (offset: number) => void;
   onNavigateBand: (direction: -1 | 1) => void;
   onRedo: () => void;
   onRequestDeleteCurrentSet: () => void;
   onToggleImageAtIndex: (index: number, advance: boolean) => void;
   onToggleSelectedImage: (advance: boolean) => void;
   onUndo: () => void;
}

export const useReviewShortcuts = (options: ReviewShortcuts): void => {
   useEffect(() => {
      const onKeyDown = (event: KeyboardEvent): void => {
         const key = event.key.toLowerCase();
         if (event.key === "Escape") {
            if (options.previewOpen) {
               event.preventDefault();
               event.stopPropagation();
               options.onClosePreview();
            } else if (options.contextMenuOpen) options.onCloseContextMenu();
            else if (options.confirmOpen) options.onCloseConfirm();
            else {
               options.onCloseCompare();
               options.onClosePanels();
            }
            return;
         }

         if (options.previewOpen) {
            event.preventDefault();
            event.stopPropagation();
            return;
         }

         if (event.ctrlKey && ((event.shiftKey && key === "z") || key === "y")) {
            event.preventDefault();
            options.onRedo();
            return;
         }
         if (event.ctrlKey && key === "z") {
            event.preventDefault();
            options.onUndo();
            return;
         }
         if (isEditableShortcut(event) || options.blocked) return;

         if (options.compare !== null) {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
               event.preventDefault();
               options.onKeepCompareImage(event.key === "ArrowLeft" ? "left" : "right");
            }
            return;
         }

         if (event.ctrlKey && event.key === "ArrowLeft") {
            event.preventDefault();
            options.onNavigateBand(-1);
         } else if (event.ctrlKey && event.key === "ArrowRight") {
            event.preventDefault();
            options.onNavigateBand(1);
         } else if (event.key === "ArrowLeft" || key === "a") {
            event.preventDefault();
            options.onNavigate(-1);
         } else if (event.key === "ArrowRight" || event.key === " " || key === "d") {
            event.preventDefault();
            options.onNavigate(1);
         } else if ((key === "i" || key === "c") && options.hasCurrentGroup) {
            event.preventDefault();
            options.onKeepCurrentSet(false);
         } else if (key === "x" && options.hasCurrentGroup) {
            event.preventDefault();
            options.onRequestDeleteCurrentSet();
         } else if (key === "u" && options.hasCurrentGroup) {
            event.preventDefault();
            options.onKeepSimilarityGroup();
         } else if (key === "v") {
            event.preventDefault();
            options.onAutoCompleteGroup();
         } else if (event.key === "Enter" && options.hasCurrentGroup) {
            event.preventDefault();
            options.onKeepCurrentSet(event.ctrlKey);
         } else if ((event.key === "Delete" || event.key === "Backspace") && options.hasSelectedImage) {
            event.preventDefault();
            options.onToggleSelectedImage(event.ctrlKey);
         } else if (/^[1-9]$/u.test(event.key) && options.hasCurrentGroup) {
            event.preventDefault();
            options.onToggleImageAtIndex(Number.parseInt(event.key, 10) - 1, event.ctrlKey);
         }
      };

      window.addEventListener("keydown", onKeyDown, { capture: true });
      return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
   });
};
