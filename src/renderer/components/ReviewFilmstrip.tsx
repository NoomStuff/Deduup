import { memo } from "react";
import type { CSSProperties, MouseEvent, RefObject } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ImageSet } from "../../shared/types.js";
import type { SimilarityBand } from "../appTypes.js";
import type { TooltipProps } from "../hooks/useTooltip.js";
import { getSimilarityColor, type LibrarySetRow } from "../reviewModel.js";

interface ReviewFilmstripProps {
   bands: SimilarityBand[];
   currentIndex: number;
   currentSetId: string;
   filmstripRef: RefObject<HTMLElement | null>;
   fade: { left: boolean; right: boolean };
   nextHint: string;
   previousHint: string;
   rows: Map<string, LibrarySetRow>;
   getTooltipProps: (title: string, body: string, hotkey?: string) => TooltipProps;
   onNavigate: (index: number) => void;
   onBandContextMenu: (event: MouseEvent<HTMLElement>, firstSet: ImageSet) => void;
   onSetContextMenu: (event: MouseEvent<HTMLElement>, imageSet: ImageSet) => void;
}

interface FilmstripItemProps {
   number: string;
   label: string;
   state: LibrarySetRow["state"];
   differenceText: string;
   isActive: boolean;
   imageSet: ImageSet;
   index: number;
   getTooltipProps: ReviewFilmstripProps["getTooltipProps"];
   onNavigate: ReviewFilmstripProps["onNavigate"];
   onSetContextMenu: ReviewFilmstripProps["onSetContextMenu"];
}

const FilmstripItem = memo(function FilmstripItem(props: FilmstripItemProps) {
   return (
      <button
         aria-current={props.isActive ? "true" : undefined}
         className={`filmstrip__item${props.isActive ? " filmstrip__item--active" : ""} filmstrip__item--${props.state}`}
         onClick={() => props.onNavigate(props.index)}
         onContextMenu={(event) => props.onSetContextMenu(event, props.imageSet)}
         type="button"
         {...props.getTooltipProps(`Set ${props.number}`, `${props.label} kept · difference ${props.differenceText}`)}
      >
         <span>{props.number}</span>
         <small>{props.label}</small>
      </button>
   );
});

const BandTag = memo(function BandTag(props: {
   label: string;
   firstIndex: number;
   firstSet: ImageSet;
   getTooltipProps: ReviewFilmstripProps["getTooltipProps"];
   onNavigate: ReviewFilmstripProps["onNavigate"];
   onBandContextMenu: ReviewFilmstripProps["onBandContextMenu"];
}) {
   return (
      <button
         className="similarityBand__tag"
         onClick={() => props.onNavigate(props.firstIndex)}
         onContextMenu={(event) => {
            event.preventDefault();
            props.onBandContextMenu(event, props.firstSet);
         }}
         type="button"
         {...props.getTooltipProps(`Difference ${props.label}`, "Sets with this displayed image difference. Lower means more alike.")}
      >
         <span aria-hidden="true" className="similarityBand__link" />
         {props.label}
      </button>
   );
});

/**
 * The set timeline, memoized at the band and tile level: a decision edit
 * re-renders only the tile whose decision changed, and overlays or file actions
 * leave the whole strip untouched. The strip element ref and the class hook the
 * scroll-placement effects in useFilmstrip together, so both stay exact.
 */
export const ReviewFilmstrip = memo(function ReviewFilmstrip(props: ReviewFilmstripProps) {
   return (
      <section className="setTimeline">
         <button
            aria-label="Previous set"
            className="setNav"
            onClick={() => props.onNavigate(props.currentIndex - 1)}
            type="button"
            {...props.getTooltipProps("Previous set", "Move to the previous set.", props.previousHint)}
         >
            <ChevronLeft aria-hidden="true" />
         </button>
         <div className={`filmstripWrap${props.fade.left ? " filmstripWrap--fade-left" : ""}${props.fade.right ? " filmstripWrap--fade-right" : ""}`}>
            <section aria-label="Sets grouped by similarity" className="filmstrip" ref={props.filmstripRef}>
               {props.bands.map((band) => {
                  const firstGroup = band.groups[0];
                  const color = getSimilarityColor(band.distance);
                  return (
                     <div className="similarityBand" key={band.label} style={{ "--band-color": color } as CSSProperties}>
                        {firstGroup !== undefined && (
                           <BandTag
                              firstIndex={firstGroup.index}
                              firstSet={firstGroup.imageSet}
                              getTooltipProps={props.getTooltipProps}
                              label={band.label}
                              onBandContextMenu={props.onBandContextMenu}
                              onNavigate={props.onNavigate}
                           />
                        )}
                        <div className="similarityBand__items">
                           {band.groups.map(({ imageSet, index }) => {
                              const row = props.rows.get(imageSet.id);
                              return (
                                 <FilmstripItem
                                    differenceText={row?.differenceText ?? ""}
                                    getTooltipProps={props.getTooltipProps}
                                    imageSet={imageSet}
                                    index={index}
                                    isActive={imageSet.id === props.currentSetId}
                                    key={imageSet.id}
                                    label={row?.label ?? ""}
                                    number={row?.number ?? ""}
                                    onNavigate={props.onNavigate}
                                    onSetContextMenu={props.onSetContextMenu}
                                    state={row?.state ?? "open"}
                                 />
                              );
                           })}
                        </div>
                     </div>
                  );
               })}
            </section>
            <span aria-hidden="true" className="filmstrip__fade filmstrip__fade--left" />
            <span aria-hidden="true" className="filmstrip__fade filmstrip__fade--right" />
         </div>
         <button
            aria-label="Next set"
            className="setNav"
            onClick={() => props.onNavigate(props.currentIndex + 1)}
            type="button"
            {...props.getTooltipProps("Next set", "Move to the next set.", props.nextHint)}
         >
            <ChevronRight aria-hidden="true" />
         </button>
      </section>
   );
});
