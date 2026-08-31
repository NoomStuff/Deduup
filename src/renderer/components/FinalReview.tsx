import { FolderOpen, ShieldCheck, Trash2, Undo2 } from "lucide-react";
import type { FileActionStatus, MoveResult } from "../../shared/types.js";
import type { FileWorkflowState, MovePreview } from "../appTypes.js";
import type { TooltipProps } from "../hooks/useTooltip.js";
import { formatBytes, getSetNumber } from "../reviewModel.js";
import "./FinalReview.css";

interface FinalReviewProps {
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
   onKeepImage: (row: MovePreview) => void;
   getTooltipProps: (title: string, body: string, hotkey?: string) => TooltipProps;
}

const MoveCard = ({ row, quarantined, onKeepImage }: { row: MovePreview; quarantined: boolean; onKeepImage: (row: MovePreview) => void }) => (
   <figure className={`moveCard${quarantined ? " moveCard--quarantined" : ""}`}>
      <img alt={row.file} loading="lazy" src={row.previewUrl} />
      <figcaption>
         <strong title={row.file}>{row.file}</strong>
         <span>
            {getSetNumber(row.setId)} · {formatBytes(row.size)}
         </span>
      </figcaption>
      {!quarantined && (
         <button className="moveCard__keep" onClick={() => onKeepImage(row)} title="Keep this image — removes it from the move" type="button">
            Keep this
         </button>
      )}
   </figure>
);

const ResultBanner = ({ result, tone, verb }: { result: MoveResult; tone: "success" | "warning"; verb: string }) => (
   <div className={`resultBanner resultBanner--${tone}`} role="status">
      <ShieldCheck aria-hidden="true" />
      <span>
         {verb} {result.moved.length}, skipped {result.skipped.length}, failed {result.errors.length}.
      </span>
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
   onKeepImage,
   getTooltipProps,
}: FinalReviewProps) => {
   const isEmpty = movePreview.length === 0 && duplicatePreview.length === 0;
   const totalVisibleBytes = [...movePreview, ...duplicatePreview].reduce((total, file) => total + file.size, 0);
   const heading =
      workflow.readyToMoveCount > 0
         ? `${workflow.readyToMoveCount} image${workflow.readyToMoveCount === 1 ? "" : "s"} ready to move`
         : workflow.movedCount > 0
           ? "Everything marked is in the duplicate folder"
           : workflow.recycledCount > 0
             ? "The duplicate folder was recycled"
             : "Nothing is marked yet";

   return (
      <section className={`finalReview${isEmpty ? " finalReview--empty" : ""}`}>
         <header className="finalReview__header">
            <p className="overlayLabel">Final review</p>
            <h2>{heading}</h2>
            <div className="finalReview__meta">
               <span>{formatBytes(totalVisibleBytes)} · moves into the managed duplicate folder, recoverable until you recycle it</span>
               <button className="finalReview__path" onClick={onOpenFolder} title={`Open ${destination}`} type="button">
                  <FolderOpen aria-hidden="true" />
                  <span>{destination}</span>
               </button>
            </div>
         </header>

         <div className="finalReview__scroll">
            {!isEmpty && (
               <>
                  {movePreview.length > 0 && (
                     <section aria-label="Images ready to move" className="moveSection">
                        <h3>
                           Ready to move <span>{movePreview.length}</span>
                        </h3>
                        <div className="moveGrid">
                           {movePreview.map((row) => (
                              <MoveCard key={row.originalPath} quarantined={false} row={row} onKeepImage={onKeepImage} />
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
                        <div className="moveGrid">
                           {duplicatePreview.map((row) => (
                              <MoveCard key={row.originalPath} quarantined row={row} onKeepImage={onKeepImage} />
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
                           ? "All marked images are in the duplicate folder."
                           : workflow.recycledCount > 0
                             ? "The duplicate folder was moved to the Recycle Bin."
                             : "Your originals are untouched."}
                     </strong>
                     <span>
                        {workflow.movedCount > 0
                           ? "Undo the move, or recycle the folder when you are happy."
                           : workflow.recycledCount > 0
                             ? "This can no longer be undone from the app."
                             : "Go back to the review and mark the copies you don’t want."}
                     </span>
                  </div>
               </div>
            )}
         </div>

         <footer className="finalReview__bar">
            <div className="finalReview__status" aria-live="polite">
               {isApplying ? (
                  <div className="applyProgress" role="status">
                     <strong>Moving marked images…</strong>
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
                     Nothing is deleted until you recycle the folder.
                  </p>
               )}
            </div>
            <div className="finalReview__actions">
               {workflow.movedCount > 0 && (
                  <button
                     className="ghostButton"
                     disabled={isApplying || isRestoring || isTrashing}
                     onClick={onRestore}
                     type="button"
                     {...getTooltipProps("Undo move", "Move everything from the duplicate folder back to where it came from.")}
                  >
                     <Undo2 aria-hidden="true" />
                     {isRestoring ? "Undoing…" : "Undo move"}
                  </button>
               )}
               <button
                  className="primaryButton"
                  disabled={isApplying || isRestoring || isTrashing || workflow.readyToMoveCount === 0}
                  onClick={onApply}
                  type="button"
                  {...getTooltipProps("Move marked", "Move every marked image that is still at its source into the duplicate folder.")}
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
      </section>
   );
};
