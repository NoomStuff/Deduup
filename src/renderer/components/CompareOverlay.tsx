import { useCallback, useRef, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import { X } from "lucide-react";
import type { ImageItem } from "../../shared/types.js";
import type { CompareState } from "../appTypes.js";
import { clamp } from "../reviewModel.js";
import { usePanZoom } from "../hooks/usePanZoom.js";
import { OverlayPanel } from "./OverlayPanel.js";
import "./CompareOverlay.css";

export const CompareOverlay = ({ compare, onClose, onKeep }: { compare: CompareState; onClose: () => void; onKeep: (image: ImageItem) => void }) => {
   const [focusedSide, setFocusedSide] = useState<"left" | "right" | null>(null);
   const { stageRef, transform, isZoomed, isPanning, panHandlers } = usePanZoom();
   const revealFrameRef = useRef<number | null>(null);
   const revealTargetRef = useRef<{ target: HTMLElement; value: number } | null>(null);

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
      if (isPanning) return;
      updateRevealFromClientX(event.currentTarget, event.clientX);
   };

   // Thumbnails while at 1:1; full images only once the user zooms in.
   const sourceFor = (image: ImageItem): string => (isZoomed ? image.fullPreviewUrl : image.previewUrl);
   const cssTransform = `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`;

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
               <p className="compare__hint">Move across the image to wipe between the copies. Scroll to zoom, drag to pan while zoomed.</p>
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
               className={`compare__stage${isZoomed ? " compare__stage--zoomable" : ""}${isPanning ? " compare__stage--panning" : ""}`}
               {...panHandlers}
               onPointerEnter={updateRevealFromPointer}
               onPointerMove={(event) => {
                  panHandlers.onPointerMove(event);
                  updateRevealFromPointer(event);
               }}
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
