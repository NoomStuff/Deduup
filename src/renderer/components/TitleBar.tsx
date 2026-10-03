import { Minus, Square, X } from "lucide-react";
import type { AvailableUpdate, UpdateStatus, WindowAction } from "../../shared/types.js";
import { UpdateChip } from "./UpdateChip.js";
import "./TitleBar.css";

const runWindowAction = (action: WindowAction): void => {
   void window.imageDeduplicator.windowAction(action);
};

export interface UpdateChipActions {
   download: () => void;
   restart: () => void;
   release: () => void;
   reveal: () => void;
}

interface TitleBarProps {
   title: string;
   update: AvailableUpdate | null;
   updateStatus: UpdateStatus | null;
   updateActions: UpdateChipActions;
}

/**
 * The frameless window's own chrome: identity and drag region on the left,
 * window controls on the right. Mounted in every app state, since without it
 * the window has no controls at all. The mark is the app icon itself, served
 * from the renderer root in dev and packaged builds alike.
 */
export const TitleBar = ({ title, update, updateStatus, updateActions }: TitleBarProps) => (
   <header className="titlebar">
      <span className="titlebar__mark" aria-hidden="true">
         <img alt="" src="icon.png" />
      </span>
      <span className="titlebar__name">Deduup</span>
      <span className="titlebar__separator" aria-hidden="true">
         /
      </span>
      <span className="titlebar__title">{title}</span>
      {update !== null && (
         <UpdateChip
            update={update}
            status={updateStatus}
            onDownload={updateActions.download}
            onRestart={updateActions.restart}
            onRelease={updateActions.release}
            onReveal={updateActions.reveal}
         />
      )}
      <div className="titlebar__controls">
         <button aria-label="Minimize window" onClick={() => runWindowAction("minimize")} type="button">
            <Minus aria-hidden="true" />
         </button>
         <button aria-label="Maximize window" onClick={() => runWindowAction("maximize")} type="button">
            <Square aria-hidden="true" />
         </button>
         <button aria-label="Close window" onClick={() => runWindowAction("close")} type="button">
            <X aria-hidden="true" />
         </button>
      </div>
   </header>
);
