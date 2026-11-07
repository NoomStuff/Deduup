import { useMemo } from "react";
import type { CSSProperties, MouseEvent, RefObject } from "react";
import { CircleCheck, Eraser, FolderOpen, MousePointer2, Search, Trash2 } from "lucide-react";
import type { ImageItem, ImageSet, ImageSetDecision } from "../../shared/types.js";
import type { ContextMenuState, SimilarityBand, TravelDirection } from "../appTypes.js";
import { useBindingDisplay } from "../commands.js";
import type { TooltipProps } from "../hooks/useTooltip.js";
import {
   getDeletedImagePaths,
   getImageSetLabel,
   getSetInsights,
   getSetNumber,
   getSimilarityColor,
   getSimilarityLabel,
   type LibrarySetRow,
} from "../reviewModel.js";
import { ReviewFilmstrip } from "./ReviewFilmstrip.js";
import { ImageCard } from "./ImageCard.js";
import "./ReviewWorkspace.css";

interface ReviewWorkspaceProps {
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
   onCompareSelected: () => void;
   onDiscardSelected: () => void;
   onDiscardSet: () => void;
   onImageClick: (event: MouseEvent, image: ImageItem) => void;
   onImageContextMenu: (event: MouseEvent, image: ImageItem) => void;
   onImagePreview: (image: ImageItem) => void;
   onImageSetContextMenu: (event: MouseEvent, imageSet: ImageSet) => void;
   onKeepOnlySelected: () => void;
   onNavigate: (index: number) => void;
   onOpenContextMenu: (state: ContextMenuState) => void;
   onOpenSetFolder: (folderPath: string) => void;
}

export const ReviewWorkspace = (props: ReviewWorkspaceProps) => {
   const discardedPaths = getDeletedImagePaths(props.currentDecision);
   const selectedImage = props.currentSet.images.find((image) => image.originalPath === props.selectedImagePath) ?? null;
   const selectedImageIsDiscarded = selectedImage !== null && discardedPaths.has(selectedImage.originalPath);
   const selectedIsAvailable = selectedImage !== null && selectedImage.sourceStatus === "available";
   const availableCount = props.currentSet.images.filter((image) => image.sourceStatus === "available").length;
   const compareNeedsPick = availableCount > 2;
   const insights = useMemo(() => getSetInsights(props.currentSet), [props.currentSet]);
   const setFolder = insights.commonFolder.length > 0 ? insights.commonFolder : props.currentSet.folderPath;
   const selectedIsOnlyKept =
      selectedIsAvailable &&
      !selectedImageIsDiscarded &&
      availableCount > 1 &&
      props.currentSet.images.every(
         (image) => image.originalPath === selectedImage.originalPath || image.sourceStatus !== "available" || discardedPaths.has(image.originalPath)
      );
   const keepOnlyHint = useBindingDisplay("keepOnlySelected");
   const discardSetHint = useBindingDisplay("discardSet");
   const compareHint = useBindingDisplay("compareSelected");
   const toggleHint = useBindingDisplay("toggleSelected");
   const previousHint = useBindingDisplay("previousSet");
   const nextHint = useBindingDisplay("nextSet");

   return (
      <section
         className={`workFrame imageGrid--${props.travelDirection}`}
         onMouseDown={(event) => {
            // Mouse clicks on review controls never take keyboard focus: a
            // focused button would swallow Space (next set) and Enter, so the
            // click-then-keyboard flow keeps working. Tab focus is unaffected.
            if (event.button !== 0 || !(event.target instanceof Element) || event.target.closest("button") === null) return;
            event.preventDefault();
            if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) document.activeElement.blur();
         }}
      >
         <section className="reviewWorkspace">
            <div className="reviewWorkspace__main">
               <header className="setHeader">
                  <div className="setHeader__identity">
                     <span aria-label={`Set ${getSetNumber(props.currentSet.id).replace("#", "")} of ${props.decisionRows.size}`} className="setHeader__number">
                        {getSetNumber(props.currentSet.id)}
                        <span>/{props.decisionRows.size}</span>
                     </span>
                     <span className="setHeader__kept">{getImageSetLabel(props.currentSet, props.currentDecision)} kept</span>
                     <span
                        className="setHeader__difference"
                        style={{ "--band-color": getSimilarityColor(props.currentSet.similarity) } as CSSProperties}
                        {...props.getTooltipProps("Average image difference", "Lower means more alike.")}
                     >
                        difference {getSimilarityLabel(props.currentSet.similarity)}
                     </span>
                     <button
                        className="setHeader__folder"
                        onClick={() => props.onOpenSetFolder(setFolder)}
                        type="button"
                        {...props.getTooltipProps("Open folder", setFolder)}
                     >
                        <FolderOpen aria-hidden="true" />
                        <span>{setFolder.split(/[\\/]/u).at(-1)}</span>
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
                        disabled={!selectedIsAvailable || availableCount < 2}
                        onClick={props.onKeepOnlySelected}
                        type="button"
                        {...props.getTooltipProps(
                           selectedIsOnlyKept ? "Restore the others" : "Keep only this",
                           selectedIsOnlyKept ? "Bring back every other image in this set." : "Keep this image and discard every other image in the set.",
                           keepOnlyHint
                        )}
                     >
                        <CircleCheck aria-hidden="true" />
                        <span>{selectedIsOnlyKept ? "Restore others" : "Keep only this"}</span>
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
                        image={image}
                        index={index}
                        isComparePick={props.comparePick?.originalPath === image.originalPath}
                        isSelected={props.selectedImagePath === image.originalPath}
                        insight={insights.images.get(image.originalPath)}
                        key={image.originalPath}
                        onClick={props.onImageClick}
                        onContextMenu={props.onImageContextMenu}
                        onPreview={props.onImagePreview}
                        state={discardedPaths.has(image.originalPath) ? "deleted" : "active"}
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
