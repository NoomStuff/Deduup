import { useMemo } from "react";
import { CircleCheck, FolderOpen, ShieldCheck, Trash2, TriangleAlert, Undo2, X } from "lucide-react";
import type { FileActionStatus, ImageSet, MoveResult } from "../../shared/types.js";
import type { FileWorkflowState, MovePreview } from "../appTypes.js";
import type { TooltipProps } from "../hooks/useTooltip.js";
import { describeFileResult, formatBytes, getFinalReviewSets, getSetNumber, type FinalReviewSet } from "../reviewModel.js";
import { OverlayPanel } from "./OverlayPanel.js";
import "./FinalReview.css";

interface FinalReviewProps {
   groups: ImageSet[];
   movePreview: MovePreview[];
   duplicatePreview: MovePreview[];
   workflow: FileWorkflowState;
   destination: string;
   moveResult: MoveResult | null;
   restoreResult: MoveResult | null;
   lastFileAction: FileActionStatus;
   duplicateFolderHasContent: boolean;
   isApplying: boolean;
   isRestoring: boolean;
   isTrashing: boolean;
   onOpenFolder: () => void;
   onApply: () => void;
   onRestore: () => void;
   onTrash: () => void;
   onClose: () => void;
   /** Back to the review on this set, with the image selected when given. */
   onOpenSet: (setId: string, imagePath?: string) => void;
   getTooltipProps: (title: string, body: string, hotkey?: string) => TooltipProps;
}

const MoveCard = ({ row, quarantined, detail }: { row: MovePreview; quarantined: boolean; detail?: string }) => (
   <figure className={`moveCard${quarantined ? " moveCard--quarantined" : ""}`}>
      <img alt={row.file} loading="lazy" src={row.previewUrl} />
      <figcaption>
         <strong title={row.file}>{row.file}</strong>
         <span>{detail ?? `${getSetNumber(row.setId)} · ${formatBytes(row.size)}`}</span>
      </figcaption>
   </figure>
);

/**
 * One set's part of the move: what leaves, beside what stays. Choices are
 * corrected in the review itself, so every card is a way back to its set
 * rather than a control that changes the choice here, out of context.
 */
const MoveSet = ({ entry, onOpenSet }: { entry: FinalReviewSet; onOpenSet: FinalReviewProps["onOpenSet"] }) => {
   const keepsNothing = entry.kept.length === 0;
   const total = entry.kept.length + entry.discarded.length;
   return (
      <section aria-label={`Set ${entry.number}`} className={`moveSet${keepsNothing ? " moveSet--keepsNothing" : ""}`}>
         <header className="moveSet__header">
            <button className="moveSet__number" onClick={() => onOpenSet(entry.setId)} type="button">
               {entry.number}
            </button>
            {keepsNothing ? (
               <span className="moveSet__status moveSet__status--warning">
                  <TriangleAlert aria-hidden="true" /> Keeps nothing, every image in this set moves
               </span>
            ) : (
               <span className="moveSet__status">
                  Keeps {entry.kept.length} of {total}
               </span>
            )}
         </header>
         <div className="moveGrid">
            {entry.kept.map((image) => (
               <button
                  aria-label={`${image.file}, kept. Open set ${entry.number}`}
                  className="moveCardButton"
                  key={image.originalPath}
                  onClick={() => onOpenSet(entry.setId, image.originalPath)}
                  type="button"
               >
                  <figure className="keptCard">
                     <img alt={image.file} loading="lazy" src={image.previewUrl} />
                     <span className="keptCard__chip">
                        <CircleCheck aria-hidden="true" /> Kept
                     </span>
                     <figcaption>
                        <strong title={image.file}>{image.file}</strong>
                        <span>
                           {image.width}x{image.height} · {formatBytes(image.size)}
                        </span>
                     </figcaption>
                  </figure>
               </button>
            ))}
            {entry.discarded.map((row) => (
               <button
                  aria-label={`${row.file}, discarded. Open set ${entry.number}`}
                  className="moveCardButton"
                  key={row.originalPath}
                  onClick={() => onOpenSet(entry.setId, row.originalPath)}
                  type="button"
               >
                  <MoveCard detail={formatBytes(row.size)} quarantined={false} row={row} />
               </button>
            ))}
         </div>
      </section>
   );
};

const ResultBanner = ({ result, tone, verb }: { result: MoveResult; tone: "success" | "warning"; verb: string }) => (
   <div className={`resultBanner resultBanner--${tone}`} role="status">
      <ShieldCheck aria-hidden="true" />
      <span>{describeFileResult(result, verb)}</span>
      {result.errors.length > 0 && (
         <details className="resultBanner__details">
            <summary>{result.errors.length} need attention</summary>
            <ul>
               {result.errors.map((error) => (
                  <li key={`${error.from}-${error.to}`}>
                     <strong>{error.file}</strong>
                     <span>{error.message}</span>
                  </li>
               ))}
            </ul>
         </details>
      )}
   </div>
);

export const FinalReview = ({
   movePreview,
   duplicatePreview,
   workflow,
   destination,
   moveResult,
   restoreResult,
   lastFileAction,
   duplicateFolderHasContent,
   isApplying,
   isRestoring,
   isTrashing,
   onOpenFolder,
   onApply,
   onRestore,
   onTrash,
   onClose,
   onOpenSet,
   groups,
   getTooltipProps,
}: FinalReviewProps) => {
   const moveSets = useMemo(() => getFinalReviewSets(groups, movePreview), [groups, movePreview]);
   const keepsNothingCount = moveSets.filter((entry) => entry.kept.length === 0).length;
   const isEmpty = movePreview.length === 0 && duplicatePreview.length === 0;
   const totalVisibleBytes = [...movePreview, ...duplicatePreview].reduce((total, file) => total + file.size, 0);
   const heading =
      workflow.readyToMoveCount > 0
         ? `${workflow.readyToMoveCount} image${workflow.readyToMoveCount === 1 ? "" : "s"} ready to move`
         : workflow.movedCount > 0
           ? "Everything discarded is in the duplicate folder"
           : workflow.recycledCount > 0
             ? "The duplicate folder was recycled"
             : "Nothing is discarded yet";

   return (
      <OverlayPanel
         backdropClassName="finalReviewOverlay__backdrop"
         closeLabel="Close final review"
         labelledBy="final-review-title"
         rootClassName="finalReviewOverlay"
         surfaceClassName="finalReview"
         onClose={onClose}
      >
         <header className="finalReview__header">
            <div>
               <p className="overlayLabel">Final review</p>
               <h2 id="final-review-title">{heading}</h2>
               {!isEmpty && (
                  <div className="finalReview__meta">
                     <span>
                        {formatBytes(totalVisibleBytes)}
                        {moveSets.length > 0 && ` from ${moveSets.length} set${moveSets.length === 1 ? "" : "s"}`}
                     </span>
                     {keepsNothingCount > 0 && (
                        <span className="finalReview__warning">
                           <TriangleAlert aria-hidden="true" />
                           {keepsNothingCount} set{keepsNothingCount === 1 ? " keeps" : "s keep"} nothing
                        </span>
                     )}
                     <button className="finalReview__path" onClick={onOpenFolder} title={`Open ${destination}`} type="button">
                        <FolderOpen aria-hidden="true" />
                        <span>{destination}</span>
                     </button>
                  </div>
               )}
            </div>
            <button aria-label="Close final review" className="iconButton" data-autofocus onClick={onClose} type="button">
               <X aria-hidden="true" />
            </button>
         </header>

         <div className="finalReview__scroll">
            {!isEmpty && (
               <>
                  {movePreview.length > 0 && (
                     <section aria-label="Images ready to move" className="moveSection">
                        <h3>
                           Ready to move <span>{movePreview.length}</span>
                           <small>click an image to revisit its set</small>
                        </h3>
                        <div className="moveSets">
                           {moveSets.map((entry) => (
                              <MoveSet entry={entry} key={entry.setId} onOpenSet={onOpenSet} />
                           ))}
                        </div>
                     </section>
                  )}
                  {duplicatePreview.length > 0 && (
                     <section aria-label="Images in the duplicate folder" className="moveSection moveSection--quarantined">
                        <h3>
                           In the duplicate folder <span>{duplicatePreview.length}</span>
                           <small>undoable</small>
                        </h3>
                        <p className="moveSection__hint">Restore or recycle these images before new library changes appear.</p>
                        <div className="moveGrid">
                           {duplicatePreview.map((row) => (
                              <MoveCard key={row.originalPath} quarantined row={row} />
                           ))}
                        </div>
                     </section>
                  )}
               </>
            )}
            {isEmpty && (
               <div className="emptyFinal">
                  <ShieldCheck aria-hidden="true" />
                  <div>
                     <strong>
                        {workflow.movedCount > 0
                           ? "All discarded images are in the duplicate folder."
                           : workflow.recycledCount > 0
                             ? "The duplicate folder was moved to the Recycle Bin."
                             : "Your originals are untouched."}
                     </strong>
                     <span>
                        {workflow.movedCount > 0
                           ? "Undo the move, or recycle the folder when you are happy."
                           : workflow.recycledCount > 0
                             ? "This can no longer be undone from the app."
                             : "Go back to the review and discard the images you don't want."}
                     </span>
                     <button className="ghostButton emptyFinal__back" onClick={onClose} type="button">
                        Back to review
                     </button>
                  </div>
               </div>
            )}
         </div>

         <footer className="finalReview__bar">
            <div className="finalReview__status" aria-live="polite">
               {isApplying ? (
                  <div className="applyProgress" role="status">
                     <strong>Moving discarded images…</strong>
                     <div className="progressBar progressBar--indeterminate" aria-hidden="true">
                        <span />
                     </div>
                  </div>
               ) : isRestoring ? (
                  <div className="applyProgress" role="status">
                     <strong>Restoring moved images…</strong>
                     <div className="progressBar progressBar--indeterminate" aria-hidden="true">
                        <span />
                     </div>
                  </div>
               ) : restoreResult !== null ? (
                  <ResultBanner result={restoreResult} tone={restoreResult.errors.length > 0 ? "warning" : "success"} verb="Restored" />
               ) : moveResult !== null ? (
                  <ResultBanner result={moveResult} tone={moveResult.errors.length > 0 ? "warning" : "success"} verb="Moved" />
               ) : lastFileAction === "recycled" ? (
                  <div className="resultBanner resultBanner--neutral" role="status">
                     <Trash2 aria-hidden="true" />
                     <span>The duplicate folder is in the Recycle Bin.</span>
                  </div>
               ) : (
                  <p className="finalReview__safety">
                     <ShieldCheck aria-hidden="true" />
                     {workflow.recycledCount > 0 && isEmpty
                        ? "Recycled images can no longer be restored from the app."
                        : "Nothing is deleted until you recycle the folder."}
                  </p>
               )}
            </div>
            <div className="finalReview__actions">
               <button
                  className="ghostButton"
                  disabled={workflow.movedCount === 0 || isApplying || isRestoring || isTrashing}
                  onClick={onRestore}
                  type="button"
                  {...getTooltipProps("Undo move", "Move everything from the duplicate folder back to where it came from.")}
               >
                  <Undo2 aria-hidden="true" />
                  {isRestoring ? "Undoing…" : "Undo move"}
               </button>
               <button
                  className="primaryButton"
                  disabled={isApplying || isRestoring || isTrashing || workflow.readyToMoveCount === 0}
                  onClick={onApply}
                  type="button"
                  {...getTooltipProps("Move discarded", "Move every discarded image that is still at its source into the duplicate folder.")}
               >
                  <FolderOpen aria-hidden="true" />
                  {isApplying ? "Moving…" : workflow.readyToMoveCount > 0 ? `Move ${workflow.readyToMoveCount}` : "Move"}
               </button>
               <button
                  className="dangerButton"
                  disabled={!duplicateFolderHasContent || workflow.movedCount === 0 || isApplying || isTrashing || isRestoring}
                  onClick={onTrash}
                  type="button"
                  {...getTooltipProps("Recycle duplicates", "Send the duplicate folder and everything in it to the Recycle Bin.")}
               >
                  <Trash2 aria-hidden="true" />
                  {isTrashing ? "Recycling…" : "Recycle"}
               </button>
            </div>
         </footer>
      </OverlayPanel>
   );
};
