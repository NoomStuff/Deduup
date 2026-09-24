import { memo } from "react";
import type { MouseEvent } from "react";
import { FolderOpen, ImageOff, Trash2 } from "lucide-react";
import type { ImageItem } from "../../shared/types.js";
import type { ImageCaptionMode, ImageDeleteState } from "../appTypes.js";
import { formatBytes, formatDate } from "../reviewModel.js";

export const ImageCard = memo(function ImageCard({
   image,
   index,
   state,
   captions,
   showIndexHint,
   isComparePick,
   isSelected,
   onClick,
   onDoubleClick,
   onContextMenu,
}: {
   image: ImageItem;
   index: number;
   state: ImageDeleteState;
   captions: ImageCaptionMode;
   showIndexHint: boolean;
   isComparePick: boolean;
   isSelected: boolean;
   onClick: (event: MouseEvent, image: ImageItem) => void;
   onDoubleClick: (event: MouseEvent, image: ImageItem) => void;
   onContextMenu: (event: MouseEvent, image: ImageItem) => void;
}) {
   const isAvailable = image.sourceStatus === "available";
   const unavailableTitle =
      image.sourceStatus === "movedByApp" ? "In the duplicate folder" : image.sourceStatus === "recycledByApp" ? "Recycled" : "Source unavailable";
   const unavailableDescription =
      image.sourceStatus === "movedByApp"
         ? "Moved here by the app, still undoable"
         : image.sourceStatus === "recycledByApp"
           ? "The duplicate folder was recycled"
           : "Couldn’t find the original file";
   const captioned = captions !== "none";

   return (
      <article
         className={`imageCard imageCard--${state}${isSelected ? " imageCard--selected" : ""}${isComparePick ? " imageCard--comparePick" : ""}${isAvailable ? "" : " imageCard--immutable"}`}
         onClick={(event) => onClick(event, image)}
         onDoubleClick={(event) => onDoubleClick(event, image)}
         onContextMenu={(event) => onContextMenu(event, image)}
      >
         {showIndexHint && isAvailable && (
            <span className="imageCard__indexHint" aria-hidden="true">
               Ctrl+{index + 1}
            </span>
         )}
         {isComparePick && <span className="imageCard__chip imageCard__chip--compare">1/2 picked</span>}
         {state === "deleted" && isAvailable && (
            <span className="imageCard__chip imageCard__chip--marked">
               <Trash2 aria-hidden="true" /> Marked
            </span>
         )}
         {isAvailable ? (
            <img alt={image.file} draggable={false} loading="lazy" src={image.previewUrl} />
         ) : (
            <div className={"imageCard__fallback imageCard__fallback--" + image.sourceStatus}>
               {image.sourceStatus === "movedByApp" ? <FolderOpen aria-hidden="true" /> : <ImageOff aria-hidden="true" />}
               <strong>{unavailableTitle}</strong>
               <span>{unavailableDescription}</span>
            </div>
         )}
         {captioned && (
            <span className="imageCard__caption">
               <strong title={image.file}>{image.file}</strong>
               {captions === "details" && (
                  <span className="imageCard__details">
                     {image.width}x{image.height} · {formatBytes(image.size)} · {formatDate(image.modifiedAt)}
                  </span>
               )}
            </span>
         )}
      </article>
   );
});
