import type { MouseEvent } from "react";
import { FolderOpen, X } from "lucide-react";
import type { ImageItem } from "../../shared/types.js";
import { formatBytes } from "../reviewModel.js";
import { OverlayPanel } from "./OverlayPanel.js";
import "./ImagePreviewOverlay.css";

interface ImagePreviewOverlayProps {
   image: ImageItem;
   onClose: () => void;
   onOpenFolder: () => void;
}

export const ImagePreviewOverlay = ({ image, onClose, onOpenFolder }: ImagePreviewOverlayProps) => {
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
            <button aria-label="Close image preview" className="iconButton" onClick={onClose} type="button">
               <X aria-hidden="true" />
            </button>
         </header>
         <figure className="imagePreviewDialog__stage">
            <img alt={image.file} src={image.fullPreviewUrl} />
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
