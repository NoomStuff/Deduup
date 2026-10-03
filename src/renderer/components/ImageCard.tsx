import { memo, useLayoutEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { FolderOpen, ImageOff, Trash2 } from "lucide-react";
import type { ImageItem } from "../../shared/types.js";
import type { ImageCaptionMode, ImageDeleteState } from "../appTypes.js";
import { formatBytes, formatDate } from "../reviewModel.js";
import "./ImageCard.css";

type CardLoadState = "loading" | "loaded" | "failed";

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
           : "Couldn’t find the original file";
   const captioned = captions !== "none";

   return (
      <article
         className={`imageCard imageCard--${state}${isSelected ? " imageCard--selected" : ""}${isComparePick ? " imageCard--comparePick" : ""}${isAvailable ? "" : " imageCard--immutable"}`}
         onClick={(event) => onClick(event, image)}
         onDoubleClick={(event) => onDoubleClick(event, image)}
         onContextMenu={(event) => onContextMenu(event, image)}
      >
         {showIndexHint && isAvailable && index < 9 && (
            <span className="imageCard__indexHint" aria-hidden="true">
               Ctrl+{index + 1}
            </span>
         )}
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
                     <span>The file couldn’t be read</span>
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
