import type { CSSProperties, MouseEvent, RefObject } from "react";
import { ChevronLeft, ChevronRight, MousePointer2 } from "lucide-react";
import type { Decisions, ImageItem, ImageSet, ImageSetDecision } from "../../shared/types.js";
import type { ContextMenuState, SimilarityBand, TravelDirection } from "../appTypes.js";
import type { TooltipProps } from "../hooks/useTooltip.js";
import { getDecision, getSetNumber, getImageDeleteState, getImageSetLabel, getImageSetState, getSimilarityColor } from "../reviewModel.js";
import { ImageCard } from "./ImageCard.js";

interface ReviewWorkspaceProps {
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
   getTooltipProps: (title: string, body: string, hotkey?: string) => TooltipProps;
   onImageBadgeClick: (event: MouseEvent, image: ImageItem) => void;
   onImageClick: (event: MouseEvent, image: ImageItem) => void;
   onImageContextMenu: (event: MouseEvent, image: ImageItem) => void;
   onImageDoubleClick: (event: MouseEvent, image: ImageItem) => void;
   onImageSetContextMenu: (event: MouseEvent, imageSet: ImageSet) => void;
   onImageToggleDelete: (event: MouseEvent, image: ImageItem) => void;
   onNavigate: (index: number) => void;
   onOpenContextMenu: (state: ContextMenuState) => void;
}

export const ReviewWorkspace = (props: ReviewWorkspaceProps) => (
   <section className={`workFrame imageGrid--${props.travelDirection}`}>
      <section className="reviewWorkspace">
         <div className="reviewWorkspace__main">
            {props.comparePick !== null && (
               <div className="comparePrompt">
                  <MousePointer2 aria-hidden="true" />
                  <span>Pick one more image to compare</span>
                  <kbd>Esc</kbd>
               </div>
            )}
            <section className="imageShelf" aria-label="Images in current set">
               {props.currentSet.images.map((image, index) => (
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
            className="setNav"
            onClick={() => props.onNavigate(props.currentIndex - 1)}
            type="button"
            {...props.getTooltipProps("Previous set", "Move to the previous set.", "Left arrow")}
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
                     {...props.getTooltipProps(
                        `Difference ${band.label}`,
                        "Average pixel difference between the sets in this band. Lower means more alike. Click to jump to the band, right-click for band actions."
                     )}
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
            {...props.getTooltipProps("Next set", "Move to the next set.", "Right arrow")}
         >
            <ChevronRight aria-hidden="true" />
         </button>
      </section>
   </section>
);
