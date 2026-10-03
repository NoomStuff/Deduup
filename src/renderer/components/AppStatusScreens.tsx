import type { DragEventHandler } from "react";
import { FolderOpen, LoaderCircle, Redo2, TriangleAlert, X } from "lucide-react";
import type { ScanProgress } from "../../shared/types.js";
import type { ScanWarnings } from "../appTypes.js";
import { useBindingDisplay } from "../commands.js";
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
   <main aria-live="polite" className="statusScreen" role="status">
      <div className="loadingCard">
         <span className="spinner" aria-hidden="true" />
         <div>
            <strong>Loading your library</strong>
            <small>Reading the saved scan from disk.</small>
         </div>
      </div>
   </main>
);

export const StartupScreen = (props: StartupScreenProps) => {
   const openFolderHint = useBindingDisplay("openFolder");
   return <StartupScreenBody {...props} openFolderHint={openFolderHint} />;
};

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
   const progressCount =
      progress === null || progress.total === 0
         ? null
         : progress.phase === "discovering"
           ? `${progress.completed} image${progress.completed === 1 ? "" : "s"} found`
           : progress.phase === "saving"
             ? `Saving ${progress.total} set${progress.total === 1 ? "" : "s"}`
             : `${progress.completed} of ${progress.total} image${progress.total === 1 ? "" : "s"}`;
   return (
      <main className="statusScreen">
         <section aria-live="polite" className="scanPanel">
            <LoaderCircle aria-hidden="true" className="scanPanel__icon" />
            <div>
               <p className="overlayLabel">Scanning {folderName}</p>
               <h1>{getScanPhaseLabel(progress?.phase)}</h1>
               <p className="scanPanel__file">
                  {progress?.currentFile ?? "Large folders can take a moment."}
                  {folderPath !== null && <span className="scanPanel__path">{folderPath}</span>}
               </p>
            </div>
            <div className="scanPanel__progress">
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
               {progressCount !== null && <span className="scanPanel__count">{progressCount}</span>}
            </div>
            <button className="ghostButton scanPanel__cancel" onClick={onCancel} type="button">
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
   showOnLaunch: boolean;
   isDragOver: boolean;
   onOpenFolder: () => void;
   onContinue: () => void;
   onShowOnLaunchChange: (checked: boolean) => void;
   onDragOver: DragEventHandler<HTMLElement>;
   onDragLeave: DragEventHandler<HTMLElement>;
   onDrop: DragEventHandler<HTMLElement>;
}

const StartupScreenBody = ({
   hasSavedReview,
   savedSetCount,
   showOnLaunch,
   isDragOver,
   onOpenFolder,
   onContinue,
   onShowOnLaunchChange,
   onDragOver,
   onDragLeave,
   onDrop,
   openFolderHint,
}: StartupScreenProps & { openFolderHint: string }) => (
   <main className={`startup${isDragOver ? " startup--drag" : ""}`} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      {isDragOver && (
         <div className="startup__dropHint" aria-hidden="true">
            <FolderOpen aria-hidden="true" />
            <span>Drop the folder to scan it</span>
         </div>
      )}
      <section aria-labelledby="startup-title" className="startup__panel">
         <div className="startup__heading">
            <span className="startup__mark" aria-hidden="true">
               <img alt="" src="icon.png" />
            </span>
            <div>
               <h1 id="startup-title">Deduup</h1>
               <p>Clear identical files with ease. Nothing moves until you say so.</p>
            </div>
         </div>
         <div className="startup__actions">
            <button className="startupAction startupAction--primary" onClick={onOpenFolder} type="button">
               <FolderOpen aria-hidden="true" />
               <span className="startupAction__label">
                  Open a folder
                  <small>
                     or drop one here · <kbd>{openFolderHint}</kbd>
                  </small>
               </span>
            </button>
            <button
               className="startupAction"
               disabled={!hasSavedReview}
               onClick={onContinue}
               title={hasSavedReview ? undefined : "No saved review yet"}
               type="button"
            >
               <Redo2 aria-hidden="true" />
               <span className="startupAction__label">
                  Continue review
                  {hasSavedReview && (
                     <small>
                        {savedSetCount} set{savedSetCount === 1 ? "" : "s"}. Updates automatically.
                     </small>
                  )}
               </span>
            </button>
         </div>
         <div className="startup__preference">
            <Toggle checked={showOnLaunch} label="Show this screen when the app starts" onChange={onShowOnLaunchChange} />
         </div>
      </section>
   </main>
);
