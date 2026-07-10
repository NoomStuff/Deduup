import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import { X } from "lucide-react";
import type { ImageItem } from "../../shared/types.js";
import type { CompareState } from "../appTypes.js";
import { clamp } from "../reviewModel.js";

export const CompareOverlay = ({ compare, onClose, onKeep }: { compare: CompareState; onClose: () => void; onKeep: (image: ImageItem) => void }) => {
   const [focusedSide, setFocusedSide] = useState<"left" | "right" | null>(null);
   const stageRef = useRef<HTMLDivElement | null>(null);
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
      updateRevealFromClientX(event.currentTarget, event.clientX);
   };

   useEffect(() => {
      const followPointer = (event: globalThis.PointerEvent): void => {
         if (stageRef.current !== null) {
            updateRevealFromClientX(stageRef.current, event.clientX);
         }
      };

      window.addEventListener("pointermove", followPointer);
      return () => {
         window.removeEventListener("pointermove", followPointer);
         if (revealFrameRef.current !== null) {
            window.cancelAnimationFrame(revealFrameRef.current);
         }
      };
   }, [updateRevealFromClientX]);

   return (
      <div className="compare">
         <div className="compare__header">
            <div>
               <p className="sectionLabel">Compare</p>
               <h2>Choose the image to keep</h2>
            </div>
            <button aria-label="Close comparison" className="iconButton" onClick={onClose} title="Close comparison" type="button">
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
               <strong aria-label={`Image ${compare.leftIndex + 1}`} className="compare__actionIndex">{compare.leftIndex + 1}</strong>
               <span>Keep image {compare.leftIndex + 1}</span>
               <small title={compare.left.file}>{compare.left.file}</small>
            </button>
            <div
               className="compare__stage"
               onPointerEnter={updateRevealFromPointer}
               onPointerMove={updateRevealFromPointer}
               ref={stageRef}
               style={
                  {
                     "--compare-reveal": String(compare.reveal * 100) + "%",
                     "--compare-reveal-opacity": compare.reveal,
                  } as CSSProperties
               }
            >
               <img
                  alt={compare.left.file}
                  className={"compare__bottom" + (focusedSide === "left" ? " compare__image--focused" : "")}
                  src={compare.left.previewUrl}
               />
               <img
                  alt={compare.right.file}
                  className={"compare__top" + (focusedSide === "right" ? " compare__image--focused" : "")}
                  src={compare.right.previewUrl}
               />
               <span className="compare__divider" />
               <span className="compare__label compare__label--left">{compare.rightIndex + 1}</span>
               <span className="compare__label compare__label--right">{compare.leftIndex + 1}</span>
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
               <strong aria-label={`Image ${compare.rightIndex + 1}`} className="compare__actionIndex">{compare.rightIndex + 1}</strong>
               <span>Keep image {compare.rightIndex + 1}</span>
               <small title={compare.right.file}>{compare.right.file}</small>
            </button>
         </div>
      </div>
   );
};
