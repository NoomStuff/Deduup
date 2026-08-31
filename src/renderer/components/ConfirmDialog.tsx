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
         <button onClick={onClose} type="button">
            Cancel
         </button>
         <button
            className="danger"
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
