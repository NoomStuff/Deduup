import { useCallback, useRef, useState } from "react";
import type { FocusEvent, MouseEvent } from "react";
import type { TooltipState } from "../appTypes.js";
import { getTooltipPosition } from "../reviewModel.js";

export interface TooltipProps {
   onBlur: () => void;
   onFocus: (event: FocusEvent<HTMLElement>) => void;
   onMouseEnter: (event: MouseEvent<HTMLElement>) => void;
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
         const show = (rect: DOMRect): void =>
            setTooltip({
               title,
               body,
               ...getTooltipPosition(rect),
               ...(hotkey === undefined ? {} : { hotkey }),
            });
         return {
            onBlur: hideTooltip,
            onFocus: (event) => show(event.currentTarget.getBoundingClientRect()),
            onMouseEnter: (event) => {
               const rect = event.currentTarget.getBoundingClientRect();
               if (timerRef.current !== null) window.clearTimeout(timerRef.current);
               timerRef.current = window.setTimeout(() => show(rect), 520);
            },
            onMouseLeave: hideTooltip,
         };
      },
      [hideTooltip]
   );

   return { tooltip, hideTooltip, getTooltipProps };
};
