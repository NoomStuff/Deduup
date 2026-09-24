import { Images, Minus, Square, X } from "lucide-react";
import type { WindowAction } from "../../shared/types.js";
import "./TitleBar.css";

const runWindowAction = (action: WindowAction): void => {
   void window.imageDeduplicator.windowAction(action);
};

/**
 * The frameless window's own chrome: identity and drag region on the left,
 * window controls on the right. Mounted in every app state, since without it
 * the window has no controls at all.
 */
export const TitleBar = ({ title }: { title: string }) => (
   <header className="titlebar">
      <span className="titlebar__mark" aria-hidden="true">
         <Images />
      </span>
      <span className="titlebar__name">Image Deduplicator</span>
      <span className="titlebar__separator" aria-hidden="true">
         /
      </span>
      <span className="titlebar__title">{title}</span>
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
