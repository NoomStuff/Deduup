import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { ChevronLeft, ChevronRight, FolderOpen, X, ZoomIn, ZoomOut } from "lucide-react";
import type { ImageItem } from "../../shared/types.js";
import { formatBytes, formatDate } from "../reviewModel.js";
import { panZoomMaxScale, usePanZoom } from "../hooks/usePanZoom.js";
import { OverlayPanel } from "./OverlayPanel.js";
import "./ImagePreviewOverlay.css";

interface ImagePreviewOverlayProps {
   image: ImageItem;
   /** Previewable images of the set, so arrows and buttons can flip between copies. */
   images: ImageItem[];
   onClose: () => void;
   onNavigate: (image: ImageItem) => void;
   onOpenFolder: () => void;
}

export const ImagePreviewOverlay = ({ image, images, onClose, onNavigate, onOpenFolder }: ImagePreviewOverlayProps) => {
   const { stageRef, transform, isZoomed, isPanning, zoomAt, zoomBy, reset, panHandlers } = usePanZoom();
   const [thumbLoaded, setThumbLoaded] = useState(false);
   const [fullLoaded, setFullLoaded] = useState(false);
   const thumbImgRef = useRef<HTMLImageElement | null>(null);
   const fullImgRef = useRef<HTMLImageElement | null>(null);

   useEffect(() => {
      setThumbLoaded(false);
      setFullLoaded(false);
      // Either layer can come back from cache having finished before React
      // attached onLoad.
      const thumbImg = thumbImgRef.current;
      if (thumbImg?.complete) setThumbLoaded(thumbImg.naturalWidth > 0);
      const fullImg = fullImgRef.current;
      if (fullImg?.complete) setFullLoaded(fullImg.naturalWidth > 0);
   }, [image.previewUrl, image.fullPreviewUrl]);

   useEffect(() => reset(), [image.originalPath, reset]);

   const imageIndex = images.findIndex((candidate) => candidate.originalPath === image.originalPath);
   const canFlip = images.length > 1 && imageIndex >= 0;

   const flip = (offset: number): void => {
      if (!canFlip) return;
      const next = images[(imageIndex + offset + images.length) % images.length];
      if (next !== undefined) onNavigate(next);
   };

   // One listener for the overlay's lifetime; the refs keep it reading fresh state.
   const flipRef = useRef(flip);
   flipRef.current = flip;
   const canFlipRef = useRef(canFlip);
   canFlipRef.current = canFlip;
   useEffect(() => {
      const onKeyDown = (event: KeyboardEvent): void => {
         if (!canFlipRef.current || event.isComposing || event.defaultPrevented) return;
         if (event.key === "ArrowLeft") {
            event.preventDefault();
            flipRef.current(-1);
         } else if (event.key === "ArrowRight") {
            event.preventDefault();
            flipRef.current(1);
         }
      };
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
   }, []);

   const handleDoubleClick = (event: MouseEvent<HTMLDivElement>): void => {
      event.preventDefault();
      if (isZoomed) reset();
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
               {canFlip && (
                  <>
                     <button aria-label="Previous image in set" className="iconButton" onClick={() => flip(-1)} type="button">
                        <ChevronLeft aria-hidden="true" />
                     </button>
                     <span className="imagePreviewDialog__counter">
                        {imageIndex + 1} / {images.length}
                     </span>
                     <button aria-label="Next image in set" className="iconButton" onClick={() => flip(1)} type="button">
                        <ChevronRight aria-hidden="true" />
                     </button>
                     <span aria-hidden="true" className="imagePreviewDialog__toolDivider" />
                  </>
               )}
               <button aria-label="Zoom out" className="iconButton" disabled={!isZoomed} onClick={() => zoomBy(1 / 1.4)} type="button">
                  <ZoomOut aria-hidden="true" />
               </button>
               <span aria-live="polite" className="imagePreviewDialog__zoom">
                  {Math.round(transform.scale * 100)}%
               </span>
               <button aria-label="Zoom in" className="iconButton" disabled={transform.scale >= panZoomMaxScale} onClick={() => zoomBy(1.4)} type="button">
                  <ZoomIn aria-hidden="true" />
               </button>
               <button aria-label="Close image preview" className="iconButton" onClick={onClose} type="button">
                  <X aria-hidden="true" />
               </button>
            </div>
         </header>
         <figure
            className={`imagePreviewDialog__stage${isZoomed ? " imagePreviewDialog__stage--zoomed" : ""}${isPanning ? " imagePreviewDialog__stage--panning" : ""}`}
            onDoubleClick={handleDoubleClick}
            {...panHandlers}
            ref={stageRef}
         >
            {!(thumbLoaded || fullLoaded) && <span className="skeleton imagePreviewDialog__skeleton" aria-hidden="true" />}
            <img
               alt={image.file}
               className="imagePreviewDialog__img"
               draggable={false}
               onLoad={() => setThumbLoaded(true)}
               ref={thumbImgRef}
               src={image.previewUrl}
               style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}
            />
            <img
               alt=""
               aria-hidden="true"
               className={`imagePreviewDialog__img imagePreviewDialog__imgFull${fullLoaded ? " imagePreviewDialog__imgFull--visible" : ""}`}
               draggable={false}
               onLoad={() => setFullLoaded(true)}
               ref={fullImgRef}
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
