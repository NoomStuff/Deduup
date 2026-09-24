import type { CSSProperties, MouseEvent, RefObject } from "react";
import { ChevronLeft, ChevronRight, Eraser, FolderOpen, MousePointer2, Search, Sparkles, Trash2 } from "lucide-react";
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
   filmstripRef: RefObject<HTMLElement | null>;
   filmstripFade: { left: boolean; right: boolean };
   selectedImagePath: string | null;
   similarityBands: SimilarityBand[];
   travelDirection: TravelDirection;
   wrapShelf: boolean;
   getTooltipProps: (title: string, body: string, hotkey?: string) => TooltipProps;
   onAutoselectSet: () => void;
   onBeginComparePick: () => void;
   onClearSet: () => void;
   onCompareSelected: () => void;
   onImageClick: (event: MouseEvent, image: ImageItem) => void;
   onImageContextMenu: (event: MouseEvent, image: ImageItem) => void;
   onImageDoubleClick: (event: MouseEvent, image: ImageItem) => void;
   onImageSetContextMenu: (event: MouseEvent, imageSet: ImageSet) => void;
   onMarkSelected: () => void;
   onMarkSet: () => void;
   onNavigate: (index: number) => void;
   onOpenContextMenu: (state: ContextMenuState) => void;
   onOpenSetFolder: () => void;
   onPreviewSelected: () => void;
}

export const ReviewWorkspace = (props: ReviewWorkspaceProps) => {
   const selectedImage = props.currentSet.images.find((image) => image.originalPath === props.selectedImagePath) ?? null;
   const selectedImageIsMarked = selectedImage !== null && getDeletedImagePaths(props.currentDecision).has(selectedImage.originalPath);
   const availableCount = props.currentSet.images.filter((image) => image.sourceStatus === "available").length;
   const compareNeedsPick = availableCount > 2;
   const ctrlHeld = useCtrlHeld();
   const markSetHint = useBindingDisplay("markSet");
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
                        {...props.getTooltipProps("Average pixel difference", "How far the copies in this set sit from each other. Lower means more alike.")}
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
                  <div className="setHeader__actions">
                     {selectedImage !== null && (
                        <>
                           <button
                              className={`setHeader__action${selectedImageIsMarked ? "" : " setHeader__action--danger"}`}
                              onClick={props.onMarkSelected}
                              type="button"
                              {...props.getTooltipProps(
                                 selectedImageIsMarked ? "Unmark" : "Mark for removal",
                                 selectedImageIsMarked ? "This copy stays in its folder." : "Marked copies move in the final review, nothing moves yet.",
                                 toggleHint
                              )}
                           >
                              {selectedImageIsMarked ? <Eraser aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
                              <span>{selectedImageIsMarked ? "Unmark" : "Mark"}</span>
                           </button>
                           <button
                              className="setHeader__action"
                              onClick={compareNeedsPick ? props.onBeginComparePick : props.onCompareSelected}
                              type="button"
                              {...props.getTooltipProps(
                                 compareNeedsPick ? "Compare with…" : "Compare",
                                 compareNeedsPick ? "Pick the copy to compare against on the shelf." : "Wipe between the two copies, then keep one.",
                                 compareHint
                              )}
                           >
                              <Search aria-hidden="true" />
                              <span>{compareNeedsPick ? "Compare with…" : "Compare"}</span>
                           </button>
                           <button
                              className="setHeader__action"
                              onClick={props.onPreviewSelected}
                              type="button"
                              {...props.getTooltipProps("Preview", "Open this copy full size.", previewHint)}
                           >
                              <span>Preview</span>
                           </button>
                           <span aria-hidden="true" className="setHeader__rule" />
                        </>
                     )}
                     <button
                        className="setHeader__action"
                        onClick={props.onAutoselectSet}
                        type="button"
                        {...props.getTooltipProps("Autoselect", "Keep the largest copy of this set and mark the rest.")}
                     >
                        <Sparkles aria-hidden="true" />
                        <span>Autoselect</span>
                     </button>
                     <button
                        className="setHeader__action setHeader__action--danger"
                        onClick={props.onMarkSet}
                        type="button"
                        {...props.getTooltipProps("Mark set", "Mark every copy in this set for removal.", markSetHint)}
                     >
                        <Trash2 aria-hidden="true" />
                        <span>Mark set</span>
                     </button>
                     <button
                        className="setHeader__action"
                        onClick={props.onClearSet}
                        type="button"
                        {...props.getTooltipProps("Clear", "Remove every mark in this set.")}
                     >
                        <Eraser aria-hidden="true" />
                        <span>Clear</span>
                     </button>
                  </div>
               </header>
               {props.comparePick !== null && (
                  <div className="comparePrompt">
                     <MousePointer2 aria-hidden="true" />
                     <span>Pick the copy to compare against</span>
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
            <section
               aria-label="Sets grouped by similarity"
               className={`filmstrip${props.filmstripFade.left ? " filmstrip--fade-left" : ""}${props.filmstripFade.right ? " filmstrip--fade-right" : ""}`}
               ref={props.filmstripRef}
            >
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
