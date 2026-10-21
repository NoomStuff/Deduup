import type { CSSProperties, MouseEvent, RefObject } from "react";
import { Eraser, FolderOpen, MousePointer2, Search, Trash2 } from "lucide-react";
import type { ImageItem, ImageSet, ImageSetDecision } from "../../shared/types.js";
import type { ContextMenuState, ImageCaptionMode, SimilarityBand, TravelDirection } from "../appTypes.js";
import { useBindingDisplay } from "../commands.js";
import { useCtrlHeld } from "../hooks/usePreference.js";
import type { TooltipProps } from "../hooks/useTooltip.js";
import { getDeletedImagePaths, getImageDeleteState, getImageSetLabel, getSetNumber, getSimilarityColor, type LibrarySetRow } from "../reviewModel.js";
import { ReviewFilmstrip } from "./ReviewFilmstrip.js";
import { ImageCard } from "./ImageCard.js";
import "./ReviewWorkspace.css";

interface ReviewWorkspaceProps {
   captions: ImageCaptionMode;
   comparePick: ImageItem | null;
   currentDecision: ImageSetDecision;
   currentSet: ImageSet;
   currentIndex: number;
   decisionRows: Map<string, LibrarySetRow>;
   filmstripFade: { left: boolean; right: boolean };
   filmstripRef: RefObject<HTMLElement | null>;
   selectedImagePath: string | null;
   similarityBands: SimilarityBand[];
   travelDirection: TravelDirection;
   wrapShelf: boolean;
   getTooltipProps: (title: string, body: string, hotkey?: string) => TooltipProps;
   onBeginComparePick: () => void;
   onClearSet: () => void;
   onCompareSelected: () => void;
   onDiscardSelected: () => void;
   onDiscardSet: () => void;
   onImageClick: (event: MouseEvent, image: ImageItem) => void;
   onImageContextMenu: (event: MouseEvent, image: ImageItem) => void;
   onImageDoubleClick: (event: MouseEvent, image: ImageItem) => void;
   onImageSetContextMenu: (event: MouseEvent, imageSet: ImageSet) => void;
   onNavigate: (index: number) => void;
   onOpenContextMenu: (state: ContextMenuState) => void;
   onOpenSetFolder: () => void;
   onPreviewSelected: () => void;
}

export const ReviewWorkspace = (props: ReviewWorkspaceProps) => {
   const selectedImage = props.currentSet.images.find((image) => image.originalPath === props.selectedImagePath) ?? null;
   const selectedImageIsDiscarded = selectedImage !== null && getDeletedImagePaths(props.currentDecision).has(selectedImage.originalPath);
   const selectedIsAvailable = selectedImage !== null && selectedImage.sourceStatus === "available";
   const selectedIsPreviewable = selectedImage !== null && selectedImage.sourceStatus !== "missing" && selectedImage.sourceStatus !== "recycledByApp";
   const availableCount = props.currentSet.images.filter((image) => image.sourceStatus === "available").length;
   const compareNeedsPick = availableCount > 2;
   const discardCount = getDeletedImagePaths(props.currentDecision).size;
   const ctrlHeld = useCtrlHeld();
   const discardSetHint = useBindingDisplay("discardSet");
   const compareHint = useBindingDisplay("compareSelected");
   const previewHint = useBindingDisplay("previewSelected");
   const toggleHint = useBindingDisplay("toggleSelected");
   const previousHint = useBindingDisplay("previousSet");
   const nextHint = useBindingDisplay("nextSet");

   return (
      <section className={`workFrame imageGrid--${props.travelDirection}`}>
         <section className="reviewWorkspace">
            <div className="reviewWorkspace__main">
               <header className="setHeader">
                  <div className="setHeader__identity">
                     <span className="setHeader__number">{getSetNumber(props.currentSet.id)}</span>
                     <span className="setHeader__kept">{getImageSetLabel(props.currentSet, props.currentDecision)} kept</span>
                     <span
                        className="setHeader__difference"
                        style={{ "--band-color": getSimilarityColor(props.currentSet.similarity) } as CSSProperties}
                        {...props.getTooltipProps("Average pixel difference", "Lower means more alike.")}
                     >
                        difference {props.currentSet.similarity.toFixed(1)}
                     </span>
                     <button
                        className="setHeader__folder"
                        onClick={props.onOpenSetFolder}
                        type="button"
                        {...props.getTooltipProps("Open folder", "Open this set's folder in the file explorer.")}
                     >
                        <FolderOpen aria-hidden="true" />
                        <span>{props.currentSet.folderPath.split(/[\\/]/u).at(-1)}</span>
                     </button>
                  </div>
                  {/* Actions stay visible and disable instead of appearing and
                     vanishing with the selection, so the bar never reflows. */}
                  <div className="setHeader__actions">
                     <button
                        className={`setHeader__action${selectedImageIsDiscarded ? "" : " setHeader__action--danger"}`}
                        disabled={!selectedIsAvailable}
                        onClick={props.onDiscardSelected}
                        type="button"
                        {...props.getTooltipProps(
                           selectedImageIsDiscarded ? "Restore" : "Discard",
                           selectedImageIsDiscarded ? "This image stays in its folder." : "Discarded images move in the final review, nothing moves yet.",
                           toggleHint
                        )}
                     >
                        {selectedImageIsDiscarded ? <Eraser aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
                        <span>{selectedImageIsDiscarded ? "Restore" : "Discard"}</span>
                     </button>
                     <button
                        className="setHeader__action"
                        disabled={!selectedIsAvailable}
                        onClick={compareNeedsPick ? props.onBeginComparePick : props.onCompareSelected}
                        type="button"
                        {...props.getTooltipProps(
                           compareNeedsPick ? "Compare with…" : "Compare",
                           compareNeedsPick ? "Pick the image to compare against on the shelf." : "Wipe between the two images, then keep one.",
                           compareHint
                        )}
                     >
                        <Search aria-hidden="true" />
                        <span>{compareNeedsPick ? "Compare…" : "Compare"}</span>
                     </button>
                     <button
                        className="setHeader__action"
                        disabled={!selectedIsPreviewable}
                        onClick={props.onPreviewSelected}
                        type="button"
                        {...props.getTooltipProps("Preview", "Open this image full size.", previewHint)}
                     >
                        <span>Preview</span>
                     </button>
                     <span aria-hidden="true" className="setHeader__rule" />
                     <button
                        className="setHeader__action setHeader__action--danger"
                        disabled={availableCount === 0}
                        onClick={props.onDiscardSet}
                        type="button"
                        {...props.getTooltipProps("Discard set", "Discard every image in this set.", discardSetHint)}
                     >
                        <Trash2 aria-hidden="true" />
                        <span>Discard set</span>
                     </button>
                     <button
                        className="setHeader__action"
                        disabled={discardCount === 0}
                        onClick={props.onClearSet}
                        type="button"
                        {...props.getTooltipProps("Clear", "Remove every discard in this set.")}
                     >
                        <Eraser aria-hidden="true" />
                        <span>Clear</span>
                     </button>
                  </div>
               </header>
               {props.comparePick !== null && (
                  <div className="comparePrompt">
                     <MousePointer2 aria-hidden="true" />
                     <span>Pick the image to compare against</span>
                     <kbd>Esc</kbd>
                  </div>
               )}
               <section className={`imageShelf${props.wrapShelf ? " imageShelf--wrap" : ""}`} aria-label="Images in current set">
                  {props.currentSet.images.map((image, index) => (
                     <ImageCard
                        captions={props.captions}
                        image={image}
                        index={index}
                        isComparePick={props.comparePick?.originalPath === image.originalPath}
                        isSelected={props.selectedImagePath === image.originalPath}
                        key={image.originalPath}
                        onClick={props.onImageClick}
                        onContextMenu={props.onImageContextMenu}
                        onDoubleClick={props.onImageDoubleClick}
                        showIndexHint={ctrlHeld}
                        state={getImageDeleteState(props.currentDecision, image)}
                     />
                  ))}
               </section>
            </div>
         </section>

         <ReviewFilmstrip
            bands={props.similarityBands}
            currentIndex={props.currentIndex}
            currentSetId={props.currentSet.id}
            fade={props.filmstripFade}
            filmstripRef={props.filmstripRef}
            getTooltipProps={props.getTooltipProps}
            nextHint={nextHint}
            previousHint={previousHint}
            rows={props.decisionRows}
            onBandContextMenu={(event, firstSet) =>
               props.onOpenContextMenu({
                  menuKind: "similarityBand",
                  anchor: { kind: "rect", rect: event.currentTarget.getBoundingClientRect() },
                  setId: firstSet.id,
               })
            }
            onNavigate={props.onNavigate}
            onSetContextMenu={props.onImageSetContextMenu}
         />
      </section>
   );
};
