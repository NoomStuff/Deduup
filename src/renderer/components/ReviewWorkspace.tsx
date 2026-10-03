import type { CSSProperties, MouseEvent, RefObject } from "react";
import { ChevronLeft, ChevronRight, Eraser, FolderOpen, MousePointer2, Search, Trash2 } from "lucide-react";
import type { Decisions, ImageItem, ImageSet, ImageSetDecision } from "../../shared/types.js";
import type { ContextMenuState, ImageCaptionMode, SimilarityBand, TravelDirection } from "../appTypes.js";
import { useBindingDisplay } from "../commands.js";
import { useCtrlHeld } from "../hooks/usePreference.js";
import type { TooltipProps } from "../hooks/useTooltip.js";
import {
   getDecision,
   getDeletedImagePaths,
   getSetNumber,
   getImageDeleteState,
   getImageSetLabel,
   getImageSetState,
   getSimilarityColor,
} from "../reviewModel.js";
import { ImageCard } from "./ImageCard.js";
import "./ReviewWorkspace.css";

interface ReviewWorkspaceProps {
   captions: ImageCaptionMode;
   comparePick: ImageItem | null;
   currentDecision: ImageSetDecision;
   currentSet: ImageSet;
   currentIndex: number;
   decisions: Decisions;
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

         <section className="setTimeline">
            <button
               aria-label="Previous set"
               className="setNav"
               onClick={() => props.onNavigate(props.currentIndex - 1)}
               type="button"
               {...props.getTooltipProps("Previous set", "Move to the previous set.", previousHint)}
            >
               <ChevronLeft aria-hidden="true" />
            </button>
            {/* The fades are overlays instead of a mask on the scroller: a mask
               would fade the scrollbar too, and the scrollbar must stay solid. */}
            <div
               className={`filmstripWrap${props.filmstripFade.left ? " filmstripWrap--fade-left" : ""}${props.filmstripFade.right ? " filmstripWrap--fade-right" : ""}`}
            >
               <section aria-label="Sets grouped by similarity" className="filmstrip" ref={props.filmstripRef}>
                  {props.similarityBands.map((band) => (
                     <div className="similarityBand" key={band.label} style={{ "--band-color": getSimilarityColor(band.distance) } as CSSProperties}>
                        <button
                           className="similarityBand__tag"
                           onClick={() => {
                              const firstGroup = band.groups[0];
                              if (firstGroup !== undefined) props.onNavigate(firstGroup.index);
                           }}
                           onContextMenu={(event) => {
                              const firstSet = band.groups[0]?.imageSet;
                              if (firstSet === undefined) return;
                              event.preventDefault();
                              props.onOpenContextMenu({
                                 menuKind: "similarityBand",
                                 anchor: { kind: "rect", rect: event.currentTarget.getBoundingClientRect() },
                                 setId: firstSet.id,
                              });
                           }}
                           type="button"
                           {...props.getTooltipProps(`Difference ${band.label}`, "Average pixel difference across this band. Lower means more alike.")}
                        >
                           <span aria-hidden="true" className="similarityBand__link" />
                           {band.label}
                        </button>
                        <div className="similarityBand__items">
                           {band.groups.map(({ imageSet, index }) => {
                              const state = getImageSetState(imageSet, props.decisions[imageSet.id]);
                              return (
                                 <button
                                    aria-current={imageSet.id === props.currentSet.id ? "true" : undefined}
                                    className={`filmstrip__item${imageSet.id === props.currentSet.id ? " filmstrip__item--active" : ""} filmstrip__item--${state}`}
                                    key={imageSet.id}
                                    onClick={() => props.onNavigate(index)}
                                    onContextMenu={(event) => props.onImageSetContextMenu(event, imageSet)}
                                    type="button"
                                    {...props.getTooltipProps(
                                       `Set ${getSetNumber(imageSet.id)}`,
                                       `${getImageSetLabel(imageSet, getDecision(props.decisions, imageSet.id))} kept · difference ${imageSet.similarity.toFixed(1)}`
                                    )}
                                 >
                                    <span>{getSetNumber(imageSet.id)}</span>
                                    <small>{getImageSetLabel(imageSet, getDecision(props.decisions, imageSet.id))}</small>
                                 </button>
                              );
                           })}
                        </div>
                     </div>
                  ))}
               </section>
               <span aria-hidden="true" className="filmstrip__fade filmstrip__fade--left" />
               <span aria-hidden="true" className="filmstrip__fade filmstrip__fade--right" />
            </div>
            <button
               aria-label="Next set"
               className="setNav"
               onClick={() => props.onNavigate(props.currentIndex + 1)}
               type="button"
               {...props.getTooltipProps("Next set", "Move to the next set.", nextHint)}
            >
               <ChevronRight aria-hidden="true" />
            </button>
         </section>
      </section>
   );
};
