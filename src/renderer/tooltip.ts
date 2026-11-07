import { useSyncExternalStore } from "react";
import type { TooltipAnchor, TooltipState } from "./appTypes.js";

/**
 * One tooltip for the whole app, held outside React state so hovering a
 * control re-renders only the bubble, never the screen underneath it.
 */
let current: TooltipState | null = null;
let showTimer: number | null = null;
const listeners = new Set<() => void>();

const publish = (next: TooltipState | null): void => {
   if (current === next) return;
   current = next;
   for (const listener of listeners) listener();
};

export const hideTooltip = (): void => {
   if (showTimer !== null) window.clearTimeout(showTimer);
   showTimer = null;
   publish(null);
};

const subscribe = (listener: () => void): (() => void) => {
   listeners.add(listener);
   return () => listeners.delete(listener);
};

export const useTooltipState = (): TooltipState | null => useSyncExternalStore(subscribe, () => current);

interface AnchorEvent {
   currentTarget: { getBoundingClientRect(): DOMRect };
}

export interface TooltipProps {
   onClickCapture: () => void;
   onBlur: () => void;
   onFocus: (event: AnchorEvent) => void;
   onMouseEnter: (event: AnchorEvent) => void;
   onMouseLeave: () => void;
}

/** Spread onto a trigger: hover shows after a short delay, keyboard focus shows at once. */
export const tooltipProps = (title: string, body: string, hotkey?: string): TooltipProps => {
   const show = (rect: DOMRect): void => {
      const anchor: TooltipAnchor = { centerX: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom };
      publish({ title, body, ...(hotkey === undefined ? {} : { hotkey }), anchor });
   };
   return {
      onClickCapture: hideTooltip,
      onBlur: hideTooltip,
      onFocus: (event) => show(event.currentTarget.getBoundingClientRect()),
      onMouseEnter: (event) => {
         const rect = event.currentTarget.getBoundingClientRect();
         if (showTimer !== null) window.clearTimeout(showTimer);
         showTimer = window.setTimeout(() => {
            showTimer = null;
            show(rect);
         }, 420);
      },
      onMouseLeave: hideTooltip,
   };
};
