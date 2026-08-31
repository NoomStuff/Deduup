import { useEffect, useId, useRef, useState } from "react";
import type { HTMLAttributes, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import "./OverlayPanel.css";

/** Slightly above the closing animations in OverlayPanel.css, so the panel unmounts only after it finished closing. */
export const PANEL_CLOSE_MS = 240;

const focusableSelector = [
   "a[href]",
   "button:not([disabled])",
   "input:not([disabled])",
   "select:not([disabled])",
   "textarea:not([disabled])",
   '[tabindex]:not([tabindex="-1"])',
].join(",");

interface OverlayPanelProps {
   children: ReactNode;
   /** Class for the fixed full-screen root; component CSS keys z-index and layout off it. */
   rootClassName: string;
   backdropClassName?: string;
   surfaceClassName?: string;
   closeLabel: string;
   labelledBy?: string;
   label?: string;
   dialogRole?: "dialog" | "alertdialog";
   placement?: "center" | "right";
   onClose: () => void;
   surfaceProps?: HTMLAttributes<HTMLElement>;
}

const overlayStack: string[] = [];
const overlayRoots = new Map<string, HTMLElement>();

/** While any overlay is open the app root becomes inert, and stacked overlays below the topmost one too. */
const syncOverlayInertness = (): void => {
   const topmostId = overlayStack.at(-1);
   const appRoot = document.getElementById("root");
   if (appRoot !== null) {
      appRoot.inert = topmostId !== undefined;
      appRoot.setAttribute("aria-hidden", topmostId === undefined ? "false" : "true");
   }

   overlayRoots.forEach((root, id) => {
      const isBackgroundOverlay = id !== topmostId;
      root.inert = isBackgroundOverlay;
      root.setAttribute("aria-hidden", isBackgroundOverlay ? "true" : "false");
   });
};

const trapTabFocus = (event: ReactKeyboardEvent<HTMLElement>, surface: HTMLElement): void => {
   const focusableElements = [...surface.querySelectorAll<HTMLElement>(focusableSelector)].filter(
      (element) => element.getClientRects().length > 0 && element.getAttribute("aria-hidden") !== "true"
   );
   const first = focusableElements[0];
   const last = focusableElements.at(-1);

   if (first === undefined || last === undefined) {
      event.preventDefault();
      surface.focus();
      return;
   }

   if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
   } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
   }
};

/**
 * Shared modal plumbing: portal, a backdrop that is a real button, focus trap with
 * return focus, stack-aware Escape, and open/close animations — the surface unmounts
 * only after the closing animation finished. Dialogs provide content and a skin.
 */
export const OverlayPanel = ({
   children,
   rootClassName,
   backdropClassName,
   surfaceClassName,
   closeLabel,
   labelledBy,
   label,
   dialogRole = "dialog",
   placement = "center",
   onClose,
   surfaceProps,
}: OverlayPanelProps) => {
   const overlayId = useId();
   const rootRef = useRef<HTMLDivElement | null>(null);
   const surfaceRef = useRef<HTMLElement | null>(null);
   const returnFocusRef = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null);
   const [isClosing, setIsClosing] = useState(false);
   const closeTimerRef = useRef<number | null>(null);
   const closeRef = useRef<() => void>(() => undefined);

   const close = (): void => {
      if (isClosing) return;
      setIsClosing(true);
      closeTimerRef.current = window.setTimeout(() => {
         closeTimerRef.current = null;
         onClose();
      }, PANEL_CLOSE_MS);
   };
   closeRef.current = close;

   useEffect(() => {
      const previouslyFocused = returnFocusRef.current;
      const overlayIdValue = overlayId;
      overlayStack.push(overlayIdValue);
      const root = rootRef.current;
      if (root !== null) overlayRoots.set(overlayIdValue, root);
      syncOverlayInertness();

      const focusFrame = window.requestAnimationFrame(() => {
         const surface = surfaceRef.current;
         const firstFocusable = surface?.querySelector<HTMLElement>(focusableSelector);
         (firstFocusable ?? surface)?.focus({ preventScroll: true });
      });

      const onKeyDown = (event: KeyboardEvent): void => {
         if (overlayStack.at(-1) !== overlayIdValue) return;
         if (event.key !== "Escape" || event.defaultPrevented || event.isComposing || event.repeat) return;
         event.preventDefault();
         event.stopImmediatePropagation();
         closeRef.current();
      };
      document.addEventListener("keydown", onKeyDown);

      return () => {
         window.cancelAnimationFrame(focusFrame);
         if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
         document.removeEventListener("keydown", onKeyDown);
         const stackIndex = overlayStack.lastIndexOf(overlayIdValue);
         if (stackIndex >= 0) overlayStack.splice(stackIndex, 1);
         overlayRoots.delete(overlayIdValue);
         syncOverlayInertness();
         if (previouslyFocused?.isConnected) {
            previouslyFocused.focus({ preventScroll: true });
            if (document.activeElement !== previouslyFocused) {
               window.requestAnimationFrame(() => previouslyFocused.focus({ preventScroll: true }));
            }
         }
      };
      // Mount and unmount only: the stack entry, listeners, and focus return belong
      // to this instance; onClose is reached through closeRef.
   }, [overlayId]);

   useEffect(
      () => () => {
         if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
      },
      []
   );

   return createPortal(
      <div
         ref={rootRef}
         className={`overlay-panel overlay-panel--${placement} ${rootClassName}`}
         data-closing={isClosing ? "true" : undefined}
         role="presentation"
      >
         <button
            aria-label={closeLabel}
            className={`overlay-panel__backdrop${backdropClassName === undefined ? "" : ` ${backdropClassName}`}`}
            onClick={() => closeRef.current()}
            type="button"
         />
         <section
            {...surfaceProps}
            aria-modal="true"
            aria-labelledby={labelledBy}
            aria-label={label}
            className={`overlay-panel__surface${surfaceClassName === undefined ? "" : ` ${surfaceClassName}`}`}
            onKeyDown={(event) => {
               surfaceProps?.onKeyDown?.(event);
               if (!event.defaultPrevented && event.key === "Tab") trapTabFocus(event, event.currentTarget);
            }}
            ref={surfaceRef}
            role={dialogRole}
            tabIndex={-1}
         >
            {children}
         </section>
      </div>,
      document.body
   );
};
