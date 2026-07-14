import { FolderOpen, ShieldCheck, Trash2, Undo2 } from "lucide-react";
import type { FileActionStatus, PatchResult } from "../../shared/types.js";
import type { FileWorkflowState, MovePreview } from "../appTypes.js";
import type { TooltipProps } from "../hooks/useTooltip.js";
import { formatBytes, getDetectionNumber } from "../reviewModel.js";

interface FinalReviewProps {
   movePreview: MovePreview[];
   duplicatePreview: MovePreview[];
   workflow: FileWorkflowState;
   destination: string;
   patchResult: PatchResult | null;
   restoreResult: PatchResult | null;
   lastFileAction: FileActionStatus;
   duplicateFolderHasContent: boolean;
   isApplying: boolean;
   isRestoring: boolean;
   isTrashing: boolean;
   onOpenFolder: () => void;
   onApply: () => void;
   onRestore: () => void;
   onTrash: () => void;
   getTooltipProps: (title: string, body: string, hotkey?: string) => TooltipProps;
}

const FileGallery = ({
   title,
   label,
   status,
   files,
   duplicate = false,
}: {
   title: string;
   label: string;
   status: string;
   files: MovePreview[];
   duplicate?: boolean;
}) => (
   <section className={`fileReviewSection${duplicate ? " fileReviewSection--duplicate" : ""}`} aria-label={title}>
      <div className="fileReviewSection__header">
         <div>
            <p className="sectionLabel">{label}</p>
            <h3>{title}</h3>
         </div>
         <span>{status}</span>
      </div>
      <div className="markedGallery__grid">
         {files.map((row) => (
            <figure className="markedThumb" key={`${row.groupId}-${row.file}`}>
               <img alt={row.file} src={row.previewUrl} />
               <figcaption>
                  <strong>{row.file}</strong>
                  <span>
                     {getDetectionNumber(row.groupId)} / {formatBytes(row.size)}
                  </span>
               </figcaption>
            </figure>
         ))}
      </div>
   </section>
);

export const FinalReview = ({
   movePreview,
   duplicatePreview,
   workflow,
   destination,
   patchResult,
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
   getTooltipProps,
}: FinalReviewProps) => {
   const isEmpty = movePreview.length === 0 && duplicatePreview.length === 0;
   const totalVisibleBytes = [...movePreview, ...duplicatePreview].reduce((total, file) => total + file.size, 0);
   const heading =
      workflow.markedCount === 0
         ? "Nothing marked yet"
         : workflow.readyToMoveCount > 0
           ? `${workflow.readyToMoveCount} files ready to move`
           : workflow.movedCount > 0
             ? `${workflow.movedCount} files moved to duplicate`
             : workflow.recycledCount > 0
               ? `${workflow.recycledCount} duplicates recycled`
               : "Marked files are unavailable";

   return (
      <section className={`patchReview${isEmpty ? " patchReview--empty" : ""}`}>
         <header className="patchReview__header">
            <div className="patchReview__heading">
               <p className="sectionLabel">Final review</p>
               <h2>{heading}</h2>
            </div>
            <dl className="patchSummary" aria-label="Review summary">
               <div>
                  <dt>Ready</dt>
                  <dd>{workflow.readyToMoveCount}</dd>
                  <span>files</span>
               </div>
               <div>
                  <dt>In duplicate</dt>
                  <dd>{workflow.movedCount}</dd>
                  <span>files</span>
               </div>
               <div>
                  <dt>Review size</dt>
                  <dd>{formatBytes(totalVisibleBytes)}</dd>
                  <span>visible here</span>
               </div>
            </dl>
         </header>

         <div className="destinationPanel">
            <div className="destinationPanel__icon">
               <FolderOpen aria-hidden="true" />
            </div>
            <div className="destinationPanel__details">
               <small>Move destination</small>
               <strong title={destination}>{destination}</strong>
            </div>
            <button
               className="destinationPanel__open"
               onClick={onOpenFolder}
               type="button"
               {...getTooltipProps("Open scan folder", "Open the folder that contains the duplicate destination.")}
            >
               Open folder
            </button>
         </div>

         <div className="reviewFileSections">
            {movePreview.length > 0 && (
               <FileGallery files={movePreview} label="Marked files" status="At source" title={`${movePreview.length} ready to move`} />
            )}
            {duplicatePreview.length > 0 && (
               <FileGallery duplicate files={duplicatePreview} label="Files in /duplicate" status="Undoable" title={`${duplicatePreview.length} moved files`} />
            )}
            {isEmpty && (
               <div className="emptyReviewState">
                  <ShieldCheck aria-hidden="true" />
                  <div>
                     <strong>
                        {workflow.movedCount > 0
                           ? "Marked files are in the duplicate folder."
                           : workflow.recycledCount > 0
                             ? "The duplicate folder was moved to the Recycle Bin."
                             : "Your originals are untouched."}
                     </strong>
                     <span>
                        {workflow.movedCount > 0
                           ? "Undo the move or recycle the duplicate folder."
                           : workflow.recycledCount > 0
                             ? "The move can no longer be undone from this screen."
                             : "Return to selection to mark the duplicate files you want to move."}
                     </span>
                  </div>
               </div>
            )}
         </div>

         <footer className="patchReview__footer">
            <div className="patchReview__status" aria-live="polite">
               {isApplying ? (
                  <div className="applyProgress" role="status">
                     <strong>Moving marked files</strong>
                     <div className="progressBar progressBar--indeterminate" aria-hidden="true">
                        <span />
                     </div>
                  </div>
               ) : isRestoring ? (
                  <div className="applyProgress" role="status">
                     <strong>Restoring moved files</strong>
                     <div className="progressBar progressBar--indeterminate" aria-hidden="true">
                        <span />
                     </div>
                  </div>
               ) : restoreResult !== null ? (
                  <div className="result">
                     <Undo2 aria-hidden="true" />
                     <span>
                        Restored {restoreResult.moved.length}, skipped {restoreResult.skipped.length}, errors {restoreResult.errors.length}
                     </span>
                  </div>
               ) : patchResult !== null ? (
                  <div className="result">
                     <ShieldCheck aria-hidden="true" />
                     <span>
                        Moved {patchResult.moved.length}, skipped {patchResult.skipped.length}, errors {patchResult.errors.length}
                     </span>
                  </div>
               ) : lastFileAction === "recycled" ? (
                  <div className="result">
                     <Trash2 aria-hidden="true" />
                     <span>Duplicate folder moved to the Recycle Bin.</span>
                  </div>
               ) : (
                  <div className="patchSafetyNote">
                     <ShieldCheck aria-hidden="true" />
                     <span>Marked files move to the duplicate folder first.</span>
                  </div>
               )}
            </div>
            <div className="patchReview__actions">
               {workflow.movedCount > 0 && (
                  <button
                     className="restoreButton"
                     disabled={isApplying || isRestoring || isTrashing}
                     onClick={onRestore}
                     type="button"
                     {...getTooltipProps("Undo", "Move marked files from the duplicate folder back to their original locations.")}
                  >
                     <Undo2 aria-hidden="true" />
                     {isRestoring ? "Undoing..." : "Undo"}
                  </button>
               )}
               <button
                  className="finishDeletionButton"
                  disabled={isApplying || isRestoring || isTrashing || workflow.readyToMoveCount === 0}
                  onClick={onApply}
                  type="button"
                  {...getTooltipProps("Move marked", "Move every marked file that is still at its source into the duplicate folder.")}
               >
                  <FolderOpen aria-hidden="true" />
                  <span>{isApplying ? "Moving..." : "Move marked"}</span>
               </button>
               <button
                  className="danger recycleButton"
                  disabled={!duplicateFolderHasContent || workflow.movedCount === 0 || isApplying || isTrashing || isRestoring}
                  onClick={onTrash}
                  type="button"
                  {...getTooltipProps("Recycle duplicates", "Send the duplicate folder and everything in it to the Recycle Bin.")}
               >
                  <Trash2 aria-hidden="true" />
                  {isTrashing ? "Recycling..." : "Recycle duplicates"}
               </button>
            </div>
         </footer>
      </section>
   );
};
