import { useCallback, useEffect, useRef, useState } from "react";
import type { TooltipAnchor, TooltipState } from "../appTypes.js";

export interface TooltipProps {
   onBlur: () => void;
   onFocus: (event: { currentTarget: { getBoundingClientRect(): DOMRect } }) => void;
   onMouseEnter: (event: { currentTarget: { getBoundingClientRect(): DOMRect } }) => void;
   onMouseLeave: () => void;
}

export const useTooltip = (): {
   tooltip: TooltipState | null;
   hideTooltip: () => void;
   getTooltipProps: (title: string, body: string, hotkey?: string) => TooltipProps;
} => {
   const [tooltip, setTooltip] = useState<TooltipState | null>(null);
   const timerRef = useRef<number | null>(null);

   const hideTooltip = useCallback((): void => {
      if (timerRef.current !== null) {
         window.clearTimeout(timerRef.current);
         timerRef.current = null;
      }
      setTooltip(null);
   }, []);

   const getTooltipProps = useCallback(
      (title: string, body: string, hotkey?: string): TooltipProps => {
         const show = (rect: DOMRect): void => {
            const anchor: TooltipAnchor = { centerX: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom };
            setTooltip({ title, body, ...(hotkey === undefined ? {} : { hotkey }), anchor });
         };
         return {
            onBlur: hideTooltip,
            onFocus: (event) => show(event.currentTarget.getBoundingClientRect()),
            onMouseEnter: (event) => {
               const rect = event.currentTarget.getBoundingClientRect();
               if (timerRef.current !== null) window.clearTimeout(timerRef.current);
               timerRef.current = window.setTimeout(() => show(rect), 420);
            },
            onMouseLeave: hideTooltip,
         };
      },
      [hideTooltip]
   );

   useEffect(
      () => () => {
         if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      },
      []
   );

   return { tooltip, hideTooltip, getTooltipProps };
};
