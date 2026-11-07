import { memo, useLayoutEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { Folder, FolderOpen, ImageOff, Trash2 } from "lucide-react";
import type { ImageItem } from "../../shared/types.js";
import type { ImageDeleteState } from "../appTypes.js";
import { formatBytes, formatDate, type ImageInsight } from "../reviewModel.js";
import "./ImageCard.css";

type CardLoadState = "loading" | "loaded" | "failed";

const rankClass = (rank: ImageInsight["resolution"] | undefined): string | undefined =>
   rank === "best" ? "imageCard__value--best" : rank === "lower" ? "imageCard__value--lower" : undefined;

export const ImageCard = memo(function ImageCard({
   image,
   index,
   state,
   isComparePick,
   isSelected,
   insight,
   onClick,
   onPreview,
   onContextMenu,
}: {
   image: ImageItem;
   index: number;
   state: ImageDeleteState;
   isComparePick: boolean;
   isSelected: boolean;
   insight: ImageInsight | undefined;
   onClick: (event: MouseEvent, image: ImageItem) => void;
   onPreview: (image: ImageItem) => void;
   onContextMenu: (event: MouseEvent, image: ImageItem) => void;
}) {
   const [loadState, setLoadState] = useState<CardLoadState>("loading");
   const imgRef = useRef<HTMLImageElement | null>(null);
   const previewUrl = image.previewUrl;

   // Checked in a layout effect so preloaded bytes (the preloader has almost
   // always fetched them) paint on the first render: no skeleton frame, no fade.
   useLayoutEffect(() => {
      setLoadState("loading");
      // A cached image can finish before React attaches onLoad.
      const img = imgRef.current;
      if (img?.complete) setLoadState(img.naturalWidth > 0 ? "loaded" : "failed");
   }, [previewUrl]);

   const isAvailable = image.sourceStatus === "available";
   const unavailableTitle =
      image.sourceStatus === "movedByApp" ? "In the duplicate folder" : image.sourceStatus === "recycledByApp" ? "Recycled" : "Source unavailable";
   const unavailableDescription =
      image.sourceStatus === "movedByApp"
         ? "Moved here by the app, still undoable"
         : image.sourceStatus === "recycledByApp"
           ? "The duplicate folder was recycled"
           : "Couldn't find the original file";

   return (
      <button
         aria-label={`${image.file}${state === "deleted" ? ", discarded" : ""}${isAvailable ? "" : `, ${unavailableTitle}`}`}
         aria-pressed={isSelected}
         className={`imageCard imageCard--${state}${isSelected ? " imageCard--selected" : ""}${isComparePick ? " imageCard--comparePick" : ""}${isAvailable ? "" : " imageCard--immutable"}`}
         onClick={(event) => onClick(event, image)}
         onDoubleClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onPreview(image);
         }}
         onKeyDown={(event) => {
            // Enter keeps the existing image-preview shortcut. Space uses the
            // native button activation to select without changing a choice.
            if (event.key !== "Enter" || event.repeat) return;
            event.preventDefault();
            onPreview(image);
         }}
         onContextMenu={(event) => onContextMenu(event, image)}
         onMouseDown={(event) => {
            if (event.button !== 0) return;
            // Pointer selection keeps the app's Space-to-next workflow. Tab
            // still focuses the button, where Space selects and Enter previews.
            event.preventDefault();
            if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
         }}
         type="button"
      >
         {isComparePick && <span className="imageCard__chip imageCard__chip--compare">1/2 picked</span>}
         {state === "deleted" && isAvailable && (
            <span className="imageCard__chip imageCard__chip--discarded">
               <Trash2 aria-hidden="true" /> Discarded
            </span>
         )}
         {isAvailable ? (
            <div className="imageCard__media">
               {loadState === "loading" && <span className="skeleton imageCard__skeleton" aria-hidden="true" />}
               <img
                  alt={image.file}
                  className="imageCard__img"
                  decoding="async"
                  draggable={false}
                  loading="lazy"
                  onError={() => setLoadState("failed")}
                  onLoad={() => setLoadState("loaded")}
                  ref={imgRef}
                  src={previewUrl}
               />
               {loadState === "failed" && (
                  <div className="imageCard__fallback">
                     <ImageOff aria-hidden="true" />
                     <strong>Preview unavailable</strong>
                     <span>The file couldn't be read</span>
                  </div>
               )}
            </div>
         ) : (
            <div className={"imageCard__fallback imageCard__fallback--" + image.sourceStatus}>
               {image.sourceStatus === "movedByApp" ? <FolderOpen aria-hidden="true" /> : <ImageOff aria-hidden="true" />}
               <strong>{unavailableTitle}</strong>
               <span>{unavailableDescription}</span>
            </div>
         )}
         <span className="imageCard__caption">
            <span className="imageCard__title">
               {isAvailable && index < 9 && (
                  <kbd aria-hidden="true" className="imageCard__key">
                     {index + 1}
                  </kbd>
               )}
               <strong title={image.file}>{image.file}</strong>
            </span>
            <span className="imageCard__details">
               <span className={rankClass(insight?.resolution)}>
                  {image.width}x{image.height}
               </span>
               {" · "}
               <span className={rankClass(insight?.size)}>{formatBytes(image.size)}</span>
               {" · "}
               {formatDate(image.modifiedAt)}
            </span>
            {insight?.folderLabel != null && (
               <span className="imageCard__folder" title={image.folderPath}>
                  <Folder aria-hidden="true" />
                  <span>{insight.folderLabel}</span>
               </span>
            )}
         </span>
      </button>
   );
});
