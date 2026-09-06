import type { DragEventHandler } from "react";
import { FolderOpen, Image as ImageIcon, LoaderCircle, Redo2, RotateCw, TriangleAlert, X } from "lucide-react";
import type { ScanProgress } from "../../shared/types.js";
import type { ScanWarnings } from "../appTypes.js";
import { Toggle } from "./Toggle.js";
import "./AppStatusScreens.css";

const getScanPhaseLabel = (phase: ScanProgress["phase"] | undefined): string => {
   if (phase === "discovering") return "Finding image files";
   if (phase === "hashing") return "Reading and comparing images";
   if (phase === "grouping") return "Building similarity bands";
   if (phase === "saving") return "Saving your scan";
   return "Preparing your scan";
};

export const LoadingScreen = () => (
   <main aria-live="polite" className="shell shell--center" role="status">
      <div className="loadingCard">
         <span className="spinner" aria-hidden="true" />
         <div>
            <strong>Loading your library</strong>
            <small>Reading the saved scan from disk.</small>
         </div>
         <div className="loadingBars" aria-hidden="true">
            <span />
            <span />
            <span />
         </div>
      </div>
   </main>
);

export const ScanningScreen = ({
   folderName,
   folderPath,
   progress,
   onCancel,
}: {
   folderName: string;
   folderPath: string | null;
   progress: ScanProgress | null;
   onCancel: () => void;
}) => {
   const progressPercent = progress === null || progress.total === 0 ? 0 : Math.round((progress.completed / progress.total) * 100);
   return (
      <main className="scanLoadingShell">
         <section aria-live="polite" className="scanLoadingPanel">
            <LoaderCircle aria-hidden="true" className="scanLoadingPanel__icon spinIcon" />
            <div>
               <p className="overlayLabel">Scanning {folderName}</p>
               <h1>{getScanPhaseLabel(progress?.phase)}</h1>
               <p className="scanLoadingPanel__file">
                  {progress?.currentFile ?? "Large folders can take a moment."}
                  {folderPath !== null && <span className="scanLoadingPanel__path">{folderPath}</span>}
               </p>
            </div>
            <div className="scanLoadingProgress">
               <div
                  aria-label={`${progressPercent}% complete`}
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={progressPercent}
                  className="progressBar"
                  role="progressbar"
               >
                  <span style={{ width: `${progressPercent}%` }} />
               </div>
               <strong>{progressPercent}%</strong>
            </div>
            <button className="ghostButton scanLoadingPanel__cancel" onClick={onCancel} type="button">
               <X aria-hidden="true" />
               Cancel scan
            </button>
         </section>
      </main>
   );
};

export const ScanWarningsBanner = ({ warnings, onDismiss }: { warnings: ScanWarnings; onDismiss: () => void }) => (
   <section aria-label="Skipped items" className="scanWarnings" role="status">
      <TriangleAlert aria-hidden="true" />
      <div className="scanWarnings__body">
         <strong>
            {warnings.count} unreadable item{warnings.count === 1 ? "" : "s"} skipped
         </strong>
         <span>These files or folders could not be read, so they are not part of this review.</span>
         {warnings.paths.length > 0 && (
            <details>
               <summary>Show paths</summary>
               <ul>
                  {warnings.paths.map((filePath) => (
                     <li key={filePath}>{filePath}</li>
                  ))}
                  {warnings.count > warnings.paths.length && <li>and {warnings.count - warnings.paths.length} more…</li>}
               </ul>
            </details>
         )}
      </div>
      <button aria-label="Dismiss skipped-items warning" className="iconButton" onClick={onDismiss} type="button">
         <X aria-hidden="true" />
      </button>
   </section>
);

interface StartupScreenProps {
   hasSavedReview: boolean;
   savedSetCount: number;
   canRescan: boolean;
   showOnLaunch: boolean;
   isDragOver: boolean;
   onOpenFolder: () => void;
   onContinue: () => void;
   onRescan: () => void;
   onShowOnLaunchChange: (checked: boolean) => void;
   onDragOver: DragEventHandler<HTMLElement>;
   onDragLeave: DragEventHandler<HTMLElement>;
   onDrop: DragEventHandler<HTMLElement>;
}

export const StartupScreen = ({
   hasSavedReview,
   savedSetCount,
   canRescan,
   showOnLaunch,
   isDragOver,
   onOpenFolder,
   onContinue,
   onRescan,
   onShowOnLaunchChange,
   onDragOver,
   onDragLeave,
   onDrop,
}: StartupScreenProps) => (
   <main className={`startupShell${isDragOver ? " startupShell--drag" : ""}`} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      {isDragOver && (
         <div className="startupDropHint" aria-hidden="true">
            <FolderOpen aria-hidden="true" />
            <span>Drop the folder to scan it</span>
         </div>
      )}
      <section aria-labelledby="startup-title" className="startupPanel">
         <div className="startupPanel__heading">
            <span className="startupPanel__mark">
               <ImageIcon aria-hidden="true" />
            </span>
            <div>
               <h1 id="startup-title">Image Deduplicator</h1>
               <p>Find the copies worth removing. Your originals stay in control.</p>
            </div>
         </div>
         <div className="startupActions">
            <button className="startupAction startupAction--primary" onClick={onOpenFolder} type="button">
               <FolderOpen aria-hidden="true" />
               <span className="startupAction__label">Open a folder</span>
            </button>
            <button className="startupAction startupAction--continue" disabled={!hasSavedReview} onClick={onContinue} type="button">
               <Redo2 aria-hidden="true" />
               <span className="startupAction__label">
                  Continue review
                  {hasSavedReview && (
                     <small>
                        {savedSetCount} set{savedSetCount === 1 ? "" : "s"} waiting
                     </small>
                  )}
               </span>
            </button>
            <button className="startupAction startupAction--rescan" disabled={!canRescan} onClick={onRescan} type="button">
               <RotateCw aria-hidden="true" />
               <span className="startupAction__label">Rescan folder</span>
            </button>
         </div>
         <div className="startupPreference">
            <Toggle checked={showOnLaunch} label="Show this screen when the app starts" onChange={onShowOnLaunchChange} />
         </div>
      </section>
   </main>
);
