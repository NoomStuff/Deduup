import { useEffect, useRef, useState } from "react";
import type { MouseEvent, PointerEvent } from "react";
import { FolderOpen, X, ZoomIn, ZoomOut } from "lucide-react";
import type { ImageItem } from "../../shared/types.js";
import { clamp, formatBytes, formatDate } from "../reviewModel.js";
import { OverlayPanel } from "./OverlayPanel.js";
import "./ImagePreviewOverlay.css";

const minScale = 1;
const maxScale = 8;

interface ViewTransform {
   scale: number;
   x: number;
   y: number;
}

const identityTransform: ViewTransform = { scale: 1, x: 0, y: 0 };

/** Keeps panning inside roughly one viewport of slack so the image never gets lost. */
const clampOffset = (value: number, scale: number, span: number): number => {
   const limit = Math.max(0, (span * (scale - 1)) / 2);
   return clamp(value, -limit, limit);
};

interface ImagePreviewOverlayProps {
   image: ImageItem;
   onClose: () => void;
   onOpenFolder: () => void;
}

export const ImagePreviewOverlay = ({ image, onClose, onOpenFolder }: ImagePreviewOverlayProps) => {
   const stageRef = useRef<HTMLDivElement | null>(null);
   const [transform, setTransform] = useState<ViewTransform>(identityTransform);
   const [isPanning, setIsPanning] = useState(false);
   const panRef = useRef<{ pointerId: number; startX: number; startY: number; baseX: number; baseY: number } | null>(null);

   useEffect(() => setTransform(identityTransform), [image.originalPath]);

   useEffect(() => {
      // React registers wheel listeners as passive, so this one is native to
      // allow preventDefault while zooming.
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

   const zoomAt = (nextScale: number, anchorX: number, anchorY: number): void => {
      const stage = stageRef.current;
      if (stage === null) return;
      const rect = stage.getBoundingClientRect();
      setTransform((current) => {
         const scale = clamp(nextScale, minScale, maxScale);
         if (scale === current.scale) return current;
         const ratio = scale / current.scale;
         const anchorOffsetX = anchorX - (rect.left + rect.width / 2);
         const anchorOffsetY = anchorY - (rect.top + rect.height / 2);
         return {
            scale,
            x: clampOffset(anchorOffsetX - (anchorOffsetX - current.x) * ratio, scale, rect.width),
            y: clampOffset(anchorOffsetY - (anchorOffsetY - current.y) * ratio, scale, rect.height),
         };
      });
   };

   const zoomBy = (factor: number): void => {
      const stage = stageRef.current;
      if (stage === null) return;
      const rect = stage.getBoundingClientRect();
      zoomAt(transform.scale * factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
   };

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

   const handleDoubleClick = (event: MouseEvent<HTMLDivElement>): void => {
      event.preventDefault();
      if (transform.scale > minScale) setTransform(identityTransform);
      else zoomAt(2.5, event.clientX, event.clientY);
   };

   const openFolder = (event: MouseEvent<HTMLButtonElement>): void => {
      event.stopPropagation();
      onOpenFolder();
   };

   return (
      <OverlayPanel
         backdropClassName="imagePreviewOverlay__backdrop"
         closeLabel="Close image preview"
         labelledBy="image-preview-title"
         rootClassName="imagePreviewOverlay"
         surfaceClassName="imagePreviewDialog"
         onClose={onClose}
      >
         <header className="imagePreviewDialog__header">
            <div>
               <p className="overlayLabel">Image preview</p>
               <h2 id="image-preview-title" title={image.file}>
                  {image.file}
               </h2>
            </div>
            <div className="imagePreviewDialog__tools">
               <button aria-label="Zoom out" className="iconButton" disabled={transform.scale <= minScale} onClick={() => zoomBy(1 / 1.4)} type="button">
                  <ZoomOut aria-hidden="true" />
               </button>
               <span aria-live="polite" className="imagePreviewDialog__zoom">
                  {Math.round(transform.scale * 100)}%
               </span>
               <button aria-label="Zoom in" className="iconButton" disabled={transform.scale >= maxScale} onClick={() => zoomBy(1.4)} type="button">
                  <ZoomIn aria-hidden="true" />
               </button>
               <button aria-label="Close image preview" className="iconButton" onClick={onClose} type="button">
                  <X aria-hidden="true" />
               </button>
            </div>
         </header>
         <figure
            className={`imagePreviewDialog__stage${transform.scale > minScale ? " imagePreviewDialog__stage--zoomed" : ""}${isPanning ? " imagePreviewDialog__stage--panning" : ""}`}
            onDoubleClick={handleDoubleClick}
            onPointerCancel={endPan}
            onPointerDown={startPan}
            onPointerMove={movePan}
            onPointerUp={endPan}
            ref={stageRef}
         >
            <img
               alt={image.file}
               draggable={false}
               src={image.fullPreviewUrl}
               style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}
            />
         </figure>
         <dl className="imagePreviewDialog__meta">
            <div>
               <dt>Dimensions</dt>
               <dd>
                  {image.width} × {image.height}
               </dd>
            </div>
            <div>
               <dt>File size</dt>
               <dd>{formatBytes(image.size)}</dd>
            </div>
            <div>
               <dt>Modified</dt>
               <dd>{formatDate(image.modifiedAt)}</dd>
            </div>
            <div>
               <dt>Source</dt>
               <dd>
                  {image.sourceStatus === "available" ? "Original folder" : image.sourceStatus === "movedByApp" ? "Managed duplicate folder" : "Unavailable"}
               </dd>
            </div>
            <div className="imagePreviewDialog__location">
               <dt>Folder</dt>
               <dd>
                  <button onClick={openFolder} title={`Open ${image.folderPath}`} type="button">
                     <FolderOpen aria-hidden="true" />
                     <span>{image.folderPath}</span>
                  </button>
               </dd>
            </div>
         </dl>
      </OverlayPanel>
   );
};
