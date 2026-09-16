import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { clamp } from "../reviewModel.js";

export const panZoomMinScale = 1;
export const panZoomMaxScale = 8;

interface ViewTransform {
   scale: number;
   x: number;
   y: number;
}

const identityTransform: ViewTransform = { scale: 1, x: 0, y: 0 };

const clampOffset = (value: number, scale: number, span: number): number => {
   const limit = Math.max(0, (span * (scale - 1)) / 2);
   return clamp(value, -limit, limit);
};

const applyZoom = (current: ViewTransform, nextScale: number, rect: DOMRect, anchorX: number, anchorY: number): ViewTransform => {
   const scale = clamp(nextScale, panZoomMinScale, panZoomMaxScale);
   if (scale === current.scale) return current;
   const ratio = scale / current.scale;
   const anchorOffsetX = anchorX - (rect.left + rect.width / 2);
   const anchorOffsetY = anchorY - (rect.top + rect.height / 2);
   return {
      scale,
      x: clampOffset(anchorOffsetX - (anchorOffsetX - current.x) * ratio, scale, rect.width),
      y: clampOffset(anchorOffsetY - (anchorOffsetY - current.y) * ratio, scale, rect.height),
   };
};

/**
 * Shared zoom-and-pan stage for the image overlays: cursor-anchored wheel zoom
 * (a native listener, because React's wheel listeners are passive) and drag
 * panning once zoomed in.
 */
export const usePanZoom = () => {
   const stageRef = useRef<HTMLDivElement | null>(null);
   const [transform, setTransform] = useState<ViewTransform>(identityTransform);
   const [isPanning, setIsPanning] = useState(false);
   const panRef = useRef<{ pointerId: number; startX: number; startY: number; baseX: number; baseY: number } | null>(null);

   useEffect(() => {
      const stage = stageRef.current;
      if (stage === null) return undefined;
      const onWheel = (event: WheelEvent): void => {
         event.preventDefault();
         const rect = stage.getBoundingClientRect();
         setTransform((current) => applyZoom(current, current.scale * Math.exp(-event.deltaY * 0.0015), rect, event.clientX, event.clientY));
      };
      stage.addEventListener("wheel", onWheel, { passive: false });
      return () => stage.removeEventListener("wheel", onWheel);
   }, []);

   const startPan = (event: PointerEvent<HTMLDivElement>): void => {
      if (event.button !== 0 || transform.scale <= panZoomMinScale) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      panRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, baseX: transform.x, baseY: transform.y };
      setIsPanning(true);
   };

   const movePan = (event: PointerEvent<HTMLDivElement>): void => {
      const pan = panRef.current;
      const stage = stageRef.current;
      if (pan === null || stage === null || event.pointerId !== pan.pointerId) return;
      const rect = stage.getBoundingClientRect();
      setTransform((current) => ({
         scale: current.scale,
         x: clampOffset(pan.baseX + (event.clientX - pan.startX), current.scale, rect.width),
         y: clampOffset(pan.baseY + (event.clientY - pan.startY), current.scale, rect.height),
      }));
   };

   const endPan = (event: PointerEvent<HTMLDivElement>): void => {
      if (panRef.current?.pointerId !== event.pointerId) return;
      panRef.current = null;
      setIsPanning(false);
   };

   const zoomAt = useCallback((nextScale: number, anchorX: number, anchorY: number): void => {
      const stage = stageRef.current;
      if (stage === null) return;
      setTransform((current) => applyZoom(current, nextScale, stage.getBoundingClientRect(), anchorX, anchorY));
   }, []);

   const zoomBy = useCallback((factor: number): void => {
      const stage = stageRef.current;
      if (stage === null) return;
      const rect = stage.getBoundingClientRect();
      setTransform((current) => applyZoom(current, current.scale * factor, rect, rect.left + rect.width / 2, rect.top + rect.height / 2));
   }, []);

   const reset = useCallback((): void => setTransform(identityTransform), []);

   return {
      stageRef,
      transform,
      isZoomed: transform.scale > panZoomMinScale,
      isPanning,
      zoomAt,
      zoomBy,
      reset,
      panHandlers: { onPointerCancel: endPan, onPointerDown: startPan, onPointerMove: movePan, onPointerUp: endPan },
   };
};
