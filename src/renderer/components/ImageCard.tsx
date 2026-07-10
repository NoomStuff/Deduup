import { memo } from "react";
import type { MouseEvent } from "react";
import { FolderOpen, ImageOff, Trash2 } from "lucide-react";
import type { ImageItem } from "../../shared/types.js";
import type { ImageDeleteState } from "../appTypes.js";
import { formatBytes } from "../reviewModel.js";

export const ImageCard = memo(function ImageCard({
   image,
   index,
   state,
   isComparePick,
   isSelected,
   onClick,
   onContextMenu,
   onBadgeClick,
   onToggleDelete,
}: {
   image: ImageItem;
   index: number;
   state: ImageDeleteState;
   isComparePick: boolean;
   isSelected: boolean;
   onClick: (event: MouseEvent, image: ImageItem) => void;
   onContextMenu: (event: MouseEvent, image: ImageItem) => void;
   onBadgeClick: (event: MouseEvent, image: ImageItem) => void;
   onToggleDelete: (event: MouseEvent, image: ImageItem) => void;
}) {
   const isMutable = image.sourceStatus === "available";
   const unavailableTitle =
      image.sourceStatus === "movedByApp" ? "Moved by the app" : image.sourceStatus === "recycledByApp" ? "Moved to the Recycle Bin" : "Source unavailable";
   const unavailableDescription =
      image.sourceStatus === "movedByApp"
         ? "Stored in the duplicate folder"
         : image.sourceStatus === "recycledByApp"
           ? "The duplicate folder was recycled"
           : "Couldn’t find the original file";

   return (
      <article
         className={`imageCard imageCard--${state}${isSelected ? " imageCard--selected" : ""}${isComparePick ? " imageCard--comparePick" : ""}${isMutable ? "" : " imageCard--immutable"}`}
         onClick={(event) => onClick(event, image)}
         onContextMenu={(event) => onContextMenu(event, image)}
      >
         <button aria-label={`Open actions for image ${index + 1}`} className="imageCard__badge" onClick={(event) => onBadgeClick(event, image)} type="button">
            {index + 1}
         </button>
         <button
            aria-label={state === "deleted" ? `Restore ${image.file}` : `Mark ${image.file} for deletion`}
            className="imageCard__deleteToggle"
            disabled={!isMutable}
            onClick={(event) => onToggleDelete(event, image)}
            type="button"
         >
            <Trash2 aria-hidden="true" />
         </button>
         {isComparePick && <span className="imageCard__compareCount">1/2 selected</span>}
         {state === "deleted" && image.sourceStatus === "available" && (
            <span className="imageCard__reviewState">
               <Trash2 aria-hidden="true" /> Marked for deletion
            </span>
         )}
         {image.sourceStatus === "available" ? (
            <img alt={image.file} draggable={false} loading="eager" src={image.previewUrl} />
         ) : (
            <div className={"imageCard__fallback imageCard__fallback--" + image.sourceStatus}>
               {image.sourceStatus === "movedByApp" ? <FolderOpen aria-hidden="true" /> : <ImageOff aria-hidden="true" />}
               <strong>{unavailableTitle}</strong>
               <span>{unavailableDescription}</span>
            </div>
         )}
         <span className="imageCard__meta">
            <strong>{image.file}</strong>
            <span>
               {image.width}x{image.height} / {formatBytes(image.size)}
            </span>
         </span>
      </article>
   );
});
