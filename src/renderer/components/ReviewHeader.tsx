import { ArrowLeft, Flag, HomeIcon, Info, Redo2, Settings, Undo2 } from "lucide-react";
import type { AppView } from "../appTypes.js";
import type { TooltipProps } from "../hooks/useTooltip.js";
import "./ReviewHeader.css";

interface ReviewHeaderProps {
   canRedo: boolean;
   canUndo: boolean;
   currentNumber: string;
   folderName: string;
   readyToMoveCount: number;
   reviewPercent: number;
   totalSets: number;
   view: AppView;
   getTooltipProps: (title: string, body: string, hotkey?: string) => TooltipProps;
   onOpenInfo: () => void;
   onOpenSettings: () => void;
   onOpenStartup: () => void;
   onRedo: () => void;
   onToggleView: () => void;
   onUndo: () => void;
}

export const ReviewHeader = (props: ReviewHeaderProps) => (
   <header className="topbar">
      <div className="topbar__identity">
         <span className="folderChip" title={props.folderName}>
            <HomeIcon aria-hidden="true" />
            {props.folderName}
         </span>
         <p className="topbar__counter">
            {props.currentNumber}
            <span>/{props.totalSets}</span>
         </p>
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
            aria-label="Open app info"
            className="iconButton"
            onClick={props.onOpenInfo}
            type="button"
            {...props.getTooltipProps("Info", "How removal works, reading the filmstrip, and every shortcut.")}
         >
            <Info aria-hidden="true" />
         </button>
         <button
            aria-label="Open app settings"
            className="iconButton"
            onClick={props.onOpenSettings}
            type="button"
            {...props.getTooltipProps("Settings", "Review behavior and safety preferences.")}
         >
            <Settings aria-hidden="true" />
         </button>
         <button
            className={`finalStep${props.readyToMoveCount > 0 && props.view === "review" ? " finalStep--hot" : ""}`}
            onClick={props.onToggleView}
            type="button"
            {...props.getTooltipProps(
               props.view === "final" ? "Back to review" : "Final review",
               props.view === "final" ? "Return to the sets. Nothing has moved yet." : "See everything marked for removal before anything moves."
            )}
         >
            {props.view === "final" ? <ArrowLeft aria-hidden="true" /> : <Flag aria-hidden="true" />}
            {props.view === "final" ? "Back to review" : "Final review"}
            {props.view === "review" && props.readyToMoveCount > 0 && <span className="finalStep__badge">{props.readyToMoveCount}</span>}
         </button>
      </div>
      <div className="topbar__progress" aria-label={`${props.reviewPercent}% reviewed`}>
         <span style={{ width: `${props.reviewPercent}%` }} />
      </div>
   </header>
);
