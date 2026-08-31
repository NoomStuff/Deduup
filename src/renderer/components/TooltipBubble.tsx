import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties } from "react";
import type { TooltipState } from "../appTypes.js";
import { clamp } from "../reviewModel.js";
import "./TooltipBubble.css";

interface Placement {
   left: number;
   top: number;
   arrowX: number;
   placement: "above" | "below";
   ready: boolean;
}

/**
 * Anchors the bubble to the trigger it belongs to: centered above or below
 * (whichever has room), clamped into the viewport, with an arrow that slides
 * along the bubble edge to keep pointing at the trigger.
 */
export const TooltipBubble = ({ tooltip }: { tooltip: TooltipState }) => {
   const bubbleRef = useRef<HTMLDivElement | null>(null);
   const [placement, setPlacement] = useState<Placement>({ left: 0, top: 0, arrowX: 0, placement: "above", ready: false });

   useLayoutEffect(() => {
      const bubble = bubbleRef.current;
      if (bubble === null) return;
      const margin = 12;
      const gap = 10;
      const width = bubble.offsetWidth;
      const height = bubble.offsetHeight;

      const fitsBelow = tooltip.anchor.bottom + gap + height <= window.innerHeight - margin;
      const placement: Placement["placement"] = fitsBelow ? "below" : "above";
      const top = placement === "below" ? tooltip.anchor.bottom + gap : tooltip.anchor.top - gap - height;

      const rawLeft = tooltip.anchor.centerX - width / 2;
      const left = clamp(rawLeft, margin, Math.max(margin, window.innerWidth - width - margin));
      const arrowX = clamp(tooltip.anchor.centerX - left, 16, Math.max(16, width - 16));

      setPlacement({ left, top: clamp(top, margin, Math.max(margin, window.innerHeight - height - margin)), arrowX, placement, ready: true });
   }, [tooltip]);

   return createPortal(
      <div
         className={`tooltipBubble tooltipBubble--${placement.placement}${placement.ready ? "" : " tooltipBubble--measuring"}`}
         ref={bubbleRef}
         role="tooltip"
         style={{ "--arrow-x": `${placement.arrowX}px`, left: placement.left, top: placement.top } as CSSProperties}
      >
         <strong>{tooltip.title}</strong>
         <span>{tooltip.body}</span>
         {tooltip.hotkey !== undefined && <kbd>{tooltip.hotkey}</kbd>}
      </div>,
      document.body
   );
};
