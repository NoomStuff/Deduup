import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import { X } from "lucide-react";
import type { ImageItem } from "../../shared/types.js";
import type { CompareState } from "../appTypes.js";
import { clamp } from "../reviewModel.js";
import { usePanZoom } from "../hooks/usePanZoom.js";
import { OverlayPanel } from "./OverlayPanel.js";
import "./CompareOverlay.css";

export const CompareOverlay = ({ compare, onClose, onKeep }: { compare: CompareState; onClose: () => void; onKeep: (image: ImageItem) => void }) => {
   const { stageRef, transform, isZoomed, isPanning, panHandlers } = usePanZoom();
   const [thumbState, setThumbState] = useState({ left: false, right: false });
   const [fullState, setFullState] = useState({ left: false, right: false });
   const leftThumbRef = useRef<HTMLImageElement | null>(null);
   const rightThumbRef = useRef<HTMLImageElement | null>(null);
   const revealFrameRef = useRef<number | null>(null);
   const revealTargetRef = useRef<{ target: HTMLElement; value: number } | null>(null);

   useEffect(() => {
      setThumbState({ left: false, right: false });
      setFullState({ left: false, right: false });
      // A warmed thumbnail can finish before React attaches onLoad.
      const leftImg = leftThumbRef.current;
      const rightImg = rightThumbRef.current;
      setThumbState({
         left: leftImg !== null && leftImg.complete && leftImg.naturalWidth > 0,
         right: rightImg !== null && rightImg.complete && rightImg.naturalWidth > 0,
      });
   }, [compare.left.previewUrl, compare.right.previewUrl]);

   // Warm the full-size decodes up front so zooming in never waits on disk.
   // Off-DOM Image() probes, since fetch() can't cross origins from file://.
   useEffect(() => {
      for (const url of [compare.left.fullPreviewUrl, compare.right.fullPreviewUrl]) {
         const probe = new Image();
         probe.src = url;
      }
   }, [compare.left.fullPreviewUrl, compare.right.fullPreviewUrl]);

   const flushReveal = useCallback((): void => {
      const next = revealTargetRef.current;
      if (next !== null) {
         next.target.style.setProperty("--compare-reveal", String(next.value * 100) + "%");
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

   // Thumbnails while at 1:1; the full decode stacks on top only once the user
   // zooms, so the swap never blanks the stage.
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
               <h2 id="compare-title">Pick the image to keep</h2>
               <p className="compare__hint">Choose between these two images. The others stay unchanged. Move across to wipe, scroll to zoom, drag to pan.</p>
            </div>
            <button aria-label="Close comparison" className="iconButton" onClick={onClose} type="button">
               <X aria-hidden="true" />
            </button>
         </div>
         <div className="compare__content">
            <button className="compare__action compare__action--left" onClick={() => onKeep(compare.left)} type="button">
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
                  } as CSSProperties
               }
            >
               {!(thumbState.left && thumbState.right) && <span className="skeleton compare__skeleton" aria-hidden="true" />}
               <div className="compare__layer">
                  <img
                     alt={compare.left.file}
                     className="compare__bottom"
                     onLoad={() => setThumbState((current) => (current.left ? current : { ...current, left: true }))}
                     ref={leftThumbRef}
                     src={compare.left.previewUrl}
                     style={{ transform: cssTransform }}
                  />
                  {isZoomed && (
                     <img
                        alt=""
                        aria-hidden="true"
                        className={"compare__bottom compare__full" + (fullState.left ? " compare__full--visible" : "")}
                        onLoad={() => setFullState((current) => (current.left ? current : { ...current, left: true }))}
                        src={compare.left.fullPreviewUrl}
                        style={{ transform: cssTransform }}
                     />
                  )}
               </div>
               <div className="compare__layer compare__layer--top">
                  <img
                     alt={compare.right.file}
                     className="compare__top"
                     onLoad={() => setThumbState((current) => (current.right ? current : { ...current, right: true }))}
                     ref={rightThumbRef}
                     src={compare.right.previewUrl}
                     style={{ transform: cssTransform }}
                  />
                  {isZoomed && (
                     <img
                        alt=""
                        aria-hidden="true"
                        className={"compare__top compare__full" + (fullState.right ? " compare__full--visible" : "")}
                        onLoad={() => setFullState((current) => (current.right ? current : { ...current, right: true }))}
                        src={compare.right.fullPreviewUrl}
                        style={{ transform: cssTransform }}
                     />
                  )}
               </div>
               <span className="compare__divider" />
               <span className="compare__label compare__label--left">{compare.leftIndex + 1}</span>
               <span className="compare__label compare__label--right">{compare.rightIndex + 1}</span>
            </div>
            <button className="compare__action compare__action--right" onClick={() => onKeep(compare.right)} type="button">
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
