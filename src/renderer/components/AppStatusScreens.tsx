import type { DragEventHandler } from "react";
import { FolderOpen, Image as ImageIcon, LoaderCircle, Redo2, RotateCw } from "lucide-react";
import type { ScanProgress } from "../../shared/types.js";
import { Toggle } from "./Toggle.js";

const getScanPhaseLabel = (phase: ScanProgress["phase"] | undefined): string => {
   if (phase === "discovering") return "Finding image files";
   if (phase === "hashing") return "Reading and comparing images";
   if (phase === "grouping") return "Building similarity groups";
   if (phase === "saving") return "Saving your scan";
   return "Preparing your scan";
};

export const LoadingScreen = () => (
   <main aria-live="polite" className="shell shell--center" role="status">
      <div className="loadingCard">
         <span className="spinner" aria-hidden="true" />
         <div>
            <strong>Loading scan</strong>
            <small>Reading local review data.</small>
         </div>
         <div className="loadingBars" aria-hidden="true">
            <span />
            <span />
            <span />
         </div>
      </div>
   </main>
);

export const ScanningScreen = ({ progress }: { progress: ScanProgress | null }) => {
   const progressPercent = progress === null || progress.total === 0 ? 0 : Math.round((progress.completed / progress.total) * 100);
   return (
      <main className="scanLoadingShell">
         <section aria-live="polite" className="scanLoadingPanel">
            <LoaderCircle aria-hidden="true" className="scanLoadingPanel__icon spinIcon" />
            <div>
               <p className="sectionLabel">Scanning folder</p>
               <h1>{getScanPhaseLabel(progress?.phase)}</h1>
               <p>{progress?.currentFile ?? "This can take a moment for large folders."}</p>
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
               <div className="scanLoadingBars" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
               </div>
               <strong>{progressPercent}% complete</strong>
            </div>
         </section>
      </main>
   );
};

interface StartupScreenProps {
   hasSavedReview: boolean;
   canRescan: boolean;
   showOnLaunch: boolean;
   onOpenFolder: () => void;
   onContinue: () => void;
   onRescan: () => void;
   onShowOnLaunchChange: (checked: boolean) => void;
   onDrop: DragEventHandler<HTMLElement>;
}

export const StartupScreen = ({
   hasSavedReview,
   canRescan,
   showOnLaunch,
   onOpenFolder,
   onContinue,
   onRescan,
   onShowOnLaunchChange,
   onDrop,
}: StartupScreenProps) => (
   <main className="startupShell" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
      <section aria-labelledby="startup-title" className="startupPanel">
         <div className="startupPanel__heading">
            <span className="startupPanel__mark">
               <ImageIcon aria-hidden="true" />
            </span>
            <div>
               <h1 id="startup-title">Image Deduplicator</h1>
               <p>Find the copies worth removing. Keep the originals in control.</p>
            </div>
         </div>
         <div className="startupActions">
            <button className="startupAction startupAction--primary" onClick={onOpenFolder} type="button">
               <FolderOpen aria-hidden="true" />
               <span className="startupAction__label">Open a new folder</span>
            </button>
            <button className="startupAction startupAction--continue" disabled={!hasSavedReview} onClick={onContinue} type="button">
               <Redo2 aria-hidden="true" />
               <span className="startupAction__label">Continue review</span>
            </button>
            <button className="startupAction startupAction--rescan" disabled={!canRescan} onClick={onRescan} type="button">
               <RotateCw aria-hidden="true" />
               <span className="startupAction__label">Rescan current folder</span>
            </button>
         </div>
         <div className="startupPreference">
            <Toggle checked={showOnLaunch} label="Show this screen when the app starts" onChange={onShowOnLaunchChange} />
         </div>
      </section>
   </main>
);
