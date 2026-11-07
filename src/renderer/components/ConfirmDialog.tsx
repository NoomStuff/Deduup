import { TriangleAlert } from "lucide-react";
import type { ConfirmAction } from "../appTypes.js";
import { OverlayPanel } from "./OverlayPanel.js";
import "./ConfirmDialog.css";

interface ConfirmDialogProps {
   action: ConfirmAction;
   /** Runs the confirmed action; the dialog animates out afterwards. */
   onConfirm: () => void;
   /** Dismisses without doing anything. */
   onClose: () => void;
}

/** Review choices stay staged and undoable, so their confirm is the Enter
   default; anything that moves files or clears every choice starts on Cancel. */
const confirmFirstKinds = new Set<ConfirmAction["kind"]>(["discardSet", "discardBand"]);

export const ConfirmDialog = ({ action, onConfirm, onClose }: ConfirmDialogProps) => (
   <OverlayPanel
      backdropClassName="confirmOverlay__backdrop"
      closeLabel="Cancel"
      dialogRole="alertdialog"
      labelledBy="confirm-title"
      rootClassName="confirmOverlay"
      surfaceClassName="confirmDialog"
      onClose={onClose}
   >
      <div className="confirmDialog__icon" aria-hidden="true">
         <TriangleAlert />
      </div>
      <div className="confirmDialog__content">
         <p className="overlayLabel">Confirm</p>
         <h2 id="confirm-title">{action.title}</h2>
         <p>{action.body}</p>
      </div>
      <div className="confirmDialog__actions">
         <button className="ghostButton" onClick={onClose} type="button">
            Cancel
         </button>
         <button
            className="dangerButton"
            data-autofocus={confirmFirstKinds.has(action.kind) ? true : undefined}
            onClick={() => {
               onConfirm();
               onClose();
            }}
            type="button"
         >
            <TriangleAlert aria-hidden="true" /> {action.confirmLabel}
         </button>
      </div>
   </OverlayPanel>
);
