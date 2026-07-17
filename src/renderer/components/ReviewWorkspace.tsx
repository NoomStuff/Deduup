import type { CSSProperties, MouseEvent, RefObject } from "react";
import { ChevronLeft, ChevronRight, MousePointer2 } from "lucide-react";
import type { Decisions, ImageItem, ImageSet, ImageSetDecision } from "../../shared/types.js";
import type { ContextMenuKind, SimilarityBand, TravelDirection } from "../appTypes.js";
import type { TooltipProps } from "../hooks/useTooltip.js";
import {
   getDecision,
   getDetectionNumber,
   getImageDeleteState,
   getImageSetLabel,
   getImageSetState,
   getSimilarityColor,
} from "../reviewModel.js";
import { ImageCard } from "./ImageCard.js";

interface ReviewWorkspaceProps {
   comparePick: ImageItem | null;
   currentDecision: ImageSetDecision;
   currentGroup: ImageSet;
   currentIndex: number;
   decisions: Decisions;
   filmstripEdges: { left: boolean; right: boolean };
   filmstripRef: RefObject<HTMLElement | null>;
   selectedImagePath: string | null;
   similarityBands: SimilarityBand[];
   travelDirection: TravelDirection;
   getTooltipProps: (title: string, body: string, hotkey?: string) => TooltipProps;
   onImageBadgeClick: (event: MouseEvent, image: ImageItem) => void;
   onImageClick: (event: MouseEvent, image: ImageItem) => void;
   onImageContextMenu: (event: MouseEvent, image: ImageItem) => void;
   onImageDoubleClick: (event: MouseEvent, image: ImageItem) => void;
   onImageSetContextMenu: (event: MouseEvent, imageSet: ImageSet) => void;
   onImageToggleDelete: (event: MouseEvent, image: ImageItem) => void;
   onNavigate: (index: number) => void;
   onOpenContextMenu: (event: MouseEvent, kind: ContextMenuKind, image?: ImageItem, imageSet?: ImageSet) => void;
   onOpenContextMenuFromButton: (event: MouseEvent, kind: ContextMenuKind, imageSet?: ImageSet) => void;
}

export const ReviewWorkspace = (props: ReviewWorkspaceProps) => (
   <>
      <section className={`reviewWorkspace imageGrid--${props.travelDirection}`}>
         <div className="reviewWorkspace__main">
            {props.comparePick !== null && (
               <div className="comparePrompt">
                  <MousePointer2 aria-hidden="true" />
                  <span>Pick one more image to compare</span>
                  <kbd>Esc</kbd>
               </div>
            )}
            <section className="imageShelf" aria-label="Images in current duplicate set">
               {props.currentGroup.images.map((image, index) => (
                  <ImageCard
                     image={image}
                     index={index}
                     isComparePick={props.comparePick?.originalPath === image.originalPath}
                     isSelected={props.selectedImagePath === image.originalPath}
                     key={image.originalPath}
                     onBadgeClick={props.onImageBadgeClick}
                     onClick={props.onImageClick}
                     onContextMenu={props.onImageContextMenu}
                     onDoubleClick={props.onImageDoubleClick}
                     onToggleDelete={props.onImageToggleDelete}
                     state={getImageDeleteState(props.currentDecision, image)}
                  />
               ))}
            </section>
         </div>
      </section>

      <section className="setTimeline">
         <button
            aria-label="Previous set"
            className="setNav setNav--compact"
            onClick={() => props.onNavigate(props.currentIndex - 1)}
            type="button"
            {...props.getTooltipProps("Previous set", "Move to the previous image set.", "Left arrow")}
         >
            <ChevronLeft aria-hidden="true" />
         </button>
         <div
            className={`filmstripFrame${props.filmstripEdges.left ? " filmstripFrame--fadeLeft" : ""}${props.filmstripEdges.right ? " filmstripFrame--fadeRight" : ""}`}
         >
            <section aria-label="Detection groups" className="filmstrip" ref={props.filmstripRef}>
               {props.similarityBands.map((band) => (
                  <div
                     className="similarityBand"
                     key={band.label}
                     style={{ "--band-color": getSimilarityColor(band.groups[0]?.imageSet.similarity ?? 0) } as CSSProperties}
                  >
                     <button
                        className="similarityBand__tag"
                        onClick={(event) => props.onOpenContextMenuFromButton(event, "similarityGroup", band.groups[0]?.imageSet)}
                        onContextMenu={(event) => props.onOpenContextMenu(event, "similarityGroup", undefined, band.groups[0]?.imageSet)}
                        type="button"
                     >
                        {band.label}
                     </button>
                     <div className="similarityBand__items">
                        {band.groups.map(({ imageSet, index }) => {
                           const state = getImageSetState(imageSet, props.decisions[imageSet.id]);
                           return (
                              <button
                                 aria-current={imageSet.id === props.currentGroup.id ? "true" : undefined}
                                 className={`filmstrip__item${imageSet.id === props.currentGroup.id ? " filmstrip__item--active" : ""} filmstrip__item--${state}`}
                                 key={imageSet.id}
                                 onClick={() => props.onNavigate(index)}
                                 onContextMenu={(event) => props.onImageSetContextMenu(event, imageSet)}
                                 title={`${imageSet.id} / similarity ${imageSet.similarity.toFixed(2)}`}
                                 type="button"
                              >
                                 <span>{getDetectionNumber(imageSet.id)}</span>
                                 <small>{getImageSetLabel(imageSet, getDecision(props.decisions, imageSet.id))}</small>
                              </button>
                           );
                        })}
                     </div>
                  </div>
               ))}
            </section>
         </div>
         <button
            aria-label="Next set"
            className="setNav setNav--compact"
            onClick={() => props.onNavigate(props.currentIndex + 1)}
            type="button"
            {...props.getTooltipProps("Next set", "Move to the next image set.", "Right arrow")}
         >
            <ChevronRight aria-hidden="true" />
         </button>
      </section>
   </>
);
