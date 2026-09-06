import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import { X } from "lucide-react";
import type { ImageItem } from "../../shared/types.js";
import type { CompareState } from "../appTypes.js";
import { clamp } from "../reviewModel.js";
import { OverlayPanel } from "./OverlayPanel.js";
import "./CompareOverlay.css";

const minScale = 1;
const maxScale = 8;

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

const asCssTransform = ({ scale, x, y }: ViewTransform): string => `translate(${x}px, ${y}px) scale(${scale})`;

export const CompareOverlay = ({ compare, onClose, onKeep }: { compare: CompareState; onClose: () => void; onKeep: (image: ImageItem) => void }) => {
   const [focusedSide, setFocusedSide] = useState<"left" | "right" | null>(null);
   const [transform, setTransform] = useState<ViewTransform>(identityTransform);
   const [isPanning, setIsPanning] = useState(false);
   const stageRef = useRef<HTMLDivElement | null>(null);
   const revealFrameRef = useRef<number | null>(null);
   const revealTargetRef = useRef<{ target: HTMLElement; value: number } | null>(null);
   const panRef = useRef<{ pointerId: number; startX: number; startY: number; baseX: number; baseY: number } | null>(null);

   const flushReveal = useCallback((): void => {
      const next = revealTargetRef.current;
      if (next !== null) {
         next.target.style.setProperty("--compare-reveal", String(next.value * 100) + "%");
         next.target.style.setProperty("--compare-reveal-opacity", String(next.value));
      }
      revealFrameRef.current = null;
   }, []);

   const updateRevealFromClientX = useCallback(
      (target: HTMLElement, clientX: number): void => {
         const rect = target.getBoundingClientRect();
         revealTargetRef.current = { target, value: clamp((clientX - rect.left) / rect.width, 0, 1) };
         revealFrameRef.current ??= window.requestAnimationFrame(flushReveal);
      },
      [flushReveal]
   );

   const updateRevealFromPointer = (event: PointerEvent<HTMLElement>): void => {
      // While drag-panning a zoomed stage the wipe stays put.
      if (panRef.current !== null) return;
      updateRevealFromClientX(event.currentTarget, event.clientX);
   };

   useEffect(() => {
      // Native listener so wheel zoom can preventDefault (React's is passive).
      const stage = stageRef.current;
      if (stage === null) return undefined;
      const onWheel = (event: WheelEvent): void => {
         event.preventDefault();
         const rect = stage.getBoundingClientRect();
         setTransform((current) => {
            const scale = clamp(current.scale * Math.exp(-event.deltaY * 0.0015), minScale, maxScale);
            if (scale === current.scale) return current;
            const ratio = scale / current.scale;
            const cursorX = event.clientX - (rect.left + rect.width / 2);
            const cursorY = event.clientY - (rect.top + rect.height / 2);
            return {
               scale,
               x: clampOffset(cursorX - (cursorX - current.x) * ratio, scale, rect.width),
               y: clampOffset(cursorY - (cursorY - current.y) * ratio, scale, rect.height),
            };
         });
      };
      stage.addEventListener("wheel", onWheel, { passive: false });
      return () => stage.removeEventListener("wheel", onWheel);
   }, []);

   const startPan = (event: PointerEvent<HTMLDivElement>): void => {
      if (event.button !== 0 || transform.scale <= minScale) return;
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
         ...current,
         x: clampOffset(pan.baseX + (event.clientX - pan.startX), current.scale, rect.width),
         y: clampOffset(pan.baseY + (event.clientY - pan.startY), current.scale, rect.height),
      }));
   };

   const endPan = (event: PointerEvent<HTMLDivElement>): void => {
      if (panRef.current?.pointerId !== event.pointerId) return;
      panRef.current = null;
      setIsPanning(false);
   };

   // Thumbnails while at 1:1; full images only once the user zooms in.
   const sourceFor = (image: ImageItem): string => (transform.scale > minScale ? image.fullPreviewUrl : image.previewUrl);
   const cssTransform = asCssTransform(transform);

   return (
      <OverlayPanel
         backdropClassName="compare__backdrop"
         closeLabel="Close comparison"
         labelledBy="compare-title"
         rootClassName="compare"
         surfaceClassName="compare__surface"
         onClose={onClose}
      >
         <div className="compare__header">
            <div>
               <p className="overlayLabel">Compare</p>
               <h2 id="compare-title">Pick the copy to keep</h2>
               <p className="compare__hint">Move across the stage to wipe between the two copies. Scroll to zoom, drag to pan while zoomed.</p>
            </div>
            <button aria-label="Close comparison" className="iconButton" onClick={onClose} type="button">
               <X aria-hidden="true" />
            </button>
         </div>
         <div className="compare__content">
            <button
               className="compare__action compare__action--left"
               onClick={() => onKeep(compare.left)}
               onBlur={() => setFocusedSide(null)}
               onFocus={() => setFocusedSide("left")}
               onMouseEnter={() => setFocusedSide("left")}
               onMouseLeave={() => setFocusedSide(null)}
               type="button"
            >
               <strong aria-label={`Image ${compare.leftIndex + 1}`} className="compare__actionIndex">
                  {compare.leftIndex + 1}
               </strong>
               <span>Keep image {compare.leftIndex + 1}</span>
               <small title={compare.left.file}>{compare.left.file}</small>
               <kbd>←</kbd>
            </button>
            <div
               className={`compare__stage${transform.scale > minScale ? " compare__stage--zoomable" : ""}${isPanning ? " compare__stage--panning" : ""}`}
               onPointerCancel={endPan}
               onPointerDown={startPan}
               onPointerEnter={updateRevealFromPointer}
               onPointerMove={(event) => {
                  movePan(event);
                  updateRevealFromPointer(event);
               }}
               onPointerUp={endPan}
               ref={stageRef}
               style={
                  {
                     "--compare-reveal": String(compare.reveal * 100) + "%",
                     "--compare-reveal-opacity": compare.reveal,
                  } as CSSProperties
               }
            >
               <div className="compare__layer">
                  <img
                     alt={compare.left.file}
                     className={"compare__bottom" + (focusedSide === "left" ? " compare__image--focused" : "")}
                     src={sourceFor(compare.left)}
                     style={{ transform: cssTransform }}
                  />
               </div>
               <div className="compare__layer compare__layer--top">
                  <img
                     alt={compare.right.file}
                     className={"compare__top" + (focusedSide === "right" ? " compare__image--focused" : "")}
                     src={sourceFor(compare.right)}
                     style={{ transform: cssTransform }}
                  />
               </div>
               <span className="compare__divider" />
               <span className="compare__label compare__label--left">{compare.leftIndex + 1}</span>
               <span className="compare__label compare__label--right">{compare.rightIndex + 1}</span>
            </div>
            <button
               className="compare__action compare__action--right"
               onClick={() => onKeep(compare.right)}
               onBlur={() => setFocusedSide(null)}
               onFocus={() => setFocusedSide("right")}
               onMouseEnter={() => setFocusedSide("right")}
               onMouseLeave={() => setFocusedSide(null)}
               type="button"
            >
               <strong aria-label={`Image ${compare.rightIndex + 1}`} className="compare__actionIndex">
                  {compare.rightIndex + 1}
               </strong>
               <span>Keep image {compare.rightIndex + 1}</span>
               <small title={compare.right.file}>{compare.right.file}</small>
               <kbd>→</kbd>
            </button>
         </div>
      </OverlayPanel>
   );
};
