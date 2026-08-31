import { useEffect } from "react";
import type { CompareState } from "../appTypes.js";

const activatableTargetSelector = "button,a,input,textarea,select,[contenteditable='true'],[role='menuitem']";

const isOnActivatableControl = (event: KeyboardEvent): boolean =>
   event.target instanceof HTMLElement && event.target.closest(activatableTargetSelector) !== null;

interface ReviewShortcuts {
   /** True while an overlay, panel, or menu owns the screen: review keys stand down, undo/redo stay live. */
   blocked: boolean;
   compare: CompareState | null;
   hasCurrentSet: boolean;
   hasSelectedImage: boolean;
   onAutoSelectBand: () => void;
   onKeepCompareImage: (side: "left" | "right") => void;
   onNavigate: (offset: number) => void;
   onNavigateBand: (direction: -1 | 1) => void;
   onPreviewSelected: () => void;
   onCompareSelected: () => void;
   onRedo: () => void;
   onRequestMarkCurrentSet: () => void;
   onToggleImageAtIndex: (index: number, advance: boolean) => void;
   onToggleSelectedImage: (advance: boolean) => void;
   onUndo: () => void;
}

/** Review keys. Panels and menus close themselves (OverlayPanel, ReviewContextMenu); this hook only drives the review. */
export const useReviewShortcuts = (options: ReviewShortcuts): void => {
   useEffect(() => {
      const onKeyDown = (event: KeyboardEvent): void => {
         const key = event.key.toLowerCase();

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
         if (options.blocked) return;

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
         } else if (key === "x" && options.hasCurrentSet) {
            event.preventDefault();
            options.onRequestMarkCurrentSet();
         } else if (key === "v" && options.hasCurrentSet) {
            event.preventDefault();
            options.onAutoSelectBand();
         } else if (key === "c" && options.hasSelectedImage) {
            event.preventDefault();
            options.onCompareSelected();
         } else if (event.key === "Enter" && options.hasSelectedImage && !isOnActivatableControl(event)) {
            event.preventDefault();
            options.onPreviewSelected();
         } else if ((event.key === "Delete" || event.key === "Backspace") && options.hasSelectedImage) {
            event.preventDefault();
            options.onToggleSelectedImage(event.ctrlKey);
         } else if (/^[1-9]$/u.test(event.key) && options.hasCurrentSet) {
            event.preventDefault();
            options.onToggleImageAtIndex(Number.parseInt(event.key, 10) - 1, event.ctrlKey);
         }
      };

      window.addEventListener("keydown", onKeyDown, { capture: true });
      return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
   });
};
