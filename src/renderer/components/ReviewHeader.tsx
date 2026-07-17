import { ArrowLeft, Flag, HomeIcon, Redo2, Settings, Undo2 } from "lucide-react";
import type { PatchView } from "../appTypes.js";
import type { TooltipProps } from "../hooks/useTooltip.js";

interface ReviewHeaderProps {
   canRedo: boolean;
   canUndo: boolean;
   currentNumber: string;
   folderName: string;
   reviewPercent: number;
   totalSets: number;
   view: PatchView;
   getTooltipProps: (title: string, body: string, hotkey?: string) => TooltipProps;
   onOpenSettings: () => void;
   onOpenStartup: () => void;
   onRedo: () => void;
   onToggleView: () => void;
   onUndo: () => void;
}

export const ReviewHeader = (props: ReviewHeaderProps) => (
   <header className="topbar">
      <div className="topbar__identity">
         <p className="sectionLabel">{props.folderName}</p>
         <h1>
            {props.currentNumber}
            <span>/{props.totalSets}</span>
         </h1>
      </div>
      <div className="topbar__actions">
         <button
            aria-label="Undo"
            className="iconButton"
            disabled={!props.canUndo}
            onClick={props.onUndo}
            type="button"
            {...props.getTooltipProps("Undo", "Restore the previous review choice.", "Ctrl Z")}
         >
            <Undo2 aria-hidden="true" />
         </button>
         <button
            aria-label="Redo"
            className="iconButton"
            disabled={!props.canRedo}
            onClick={props.onRedo}
            type="button"
            {...props.getTooltipProps("Redo", "Reapply a choice you just undid.", "Ctrl Shift Z")}
         >
            <Redo2 aria-hidden="true" />
         </button>
         <button
            aria-label="Open start screen"
            className="iconButton"
            onClick={props.onOpenStartup}
            type="button"
            {...props.getTooltipProps("Start screen", "Choose a new folder, continue a review, or rescan.")}
         >
            <HomeIcon aria-hidden="true" />
         </button>
         <button
            aria-label="Open app settings"
            className="iconButton"
            onClick={props.onOpenSettings}
            type="button"
            {...props.getTooltipProps("Settings", "Review behavior and confirmation preferences.")}
         >
            <Settings aria-hidden="true" />
         </button>
         <button
            className="finalStep"
            onClick={props.onToggleView}
            type="button"
            {...props.getTooltipProps(
               props.view === "patch" ? "Back to selection" : "Final review",
               props.view === "patch" ? "Return to the image sets without moving files." : "Review the files marked for deletion before anything is moved."
            )}
         >
            {props.view === "patch" ? <ArrowLeft aria-hidden="true" /> : <Flag aria-hidden="true" />}
            {props.view === "patch" ? "Back to selection" : "Final review"}
         </button>
      </div>
      <div className="topbar__progress" aria-label={`${props.reviewPercent}% reviewed`}>
         <span style={{ width: `${props.reviewPercent}%` }} />
      </div>
   </header>
);
