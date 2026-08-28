import { TriangleAlert } from "lucide-react";
import type { ConfirmAction } from "../appTypes.js";

export const ConfirmDialog = ({ action, onCancel, onConfirm }: { action: ConfirmAction; onCancel: () => void; onConfirm: () => void }) => (
   <div className="confirmOverlay" role="presentation">
      <section aria-labelledby="confirm-title" aria-modal="true" className="confirmDialog" role="dialog">
         <div className="confirmDialog__icon" aria-hidden="true">
            <TriangleAlert />
         </div>
         <div className="confirmDialog__content">
            <p className="overlayLabel">Confirm</p>
            <h2 id="confirm-title">{action.title}</h2>
            <p>{action.body}</p>
         </div>
         <div className="confirmDialog__actions">
            <button autoFocus onClick={onCancel} type="button">
               Cancel
            </button>
            <button className="danger" onClick={onConfirm} type="button">
               <TriangleAlert aria-hidden="true" /> {action.confirmLabel}
            </button>
         </div>
      </section>
   </div>
);
