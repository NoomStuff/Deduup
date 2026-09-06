import { Info, Keyboard, ShieldCheck, X } from "lucide-react";
import { shortcutHelp } from "../appShortcuts.js";
import { OverlayPanel } from "./OverlayPanel.js";
import "./InfoPanel.css";

const removalSteps = [
   "Mark removal candidates while reviewing. Nothing has moved yet.",
   "Confirm the move in the final review. Candidates land in a managed duplicate folder inside your scan folder.",
   "Recycle that folder from the final review when you are happy. Until then, every move can be undone.",
];

export const InfoPanel = ({ onClose }: { onClose: () => void }) => (
   <OverlayPanel
      backdropClassName="infoPanel__backdrop"
      closeLabel="Close info"
      labelledBy="info-title"
      placement="right"
      rootClassName="infoPanel"
      surfaceClassName="infoPanel__surface"
      onClose={onClose}
   >
      <div className="panelHeader">
         <div>
            <p className="overlayLabel">Info</p>
            <h2 id="info-title">How the app works</h2>
         </div>
         <button aria-label="Close info" className="iconButton" onClick={onClose} type="button">
            <X aria-hidden="true" />
         </button>
      </div>

      <section className="infoSafety">
         <ShieldCheck aria-hidden="true" />
         <div>
            <strong>The removal path</strong>
            <ol>
               {removalSteps.map((step) => (
                  <li key={step}>{step}</li>
               ))}
            </ol>
            <span>Similarity only orders the review. It never moves or deletes anything on its own.</span>
         </div>
      </section>

      <section className="panelGroup">
         <p className="panelGroup__label">Reading the review</p>
         <p className="infoPanel__text">
            The strip along the bottom shows every set, grouped under a tag with its average pixel difference. Lower means more alike. The dot under a set marks
            its state: grey is open, green is seen, amber has marks, red has every image marked.
         </p>
      </section>

      <section className="panelGroup">
         <p className="panelGroup__label">Shortcuts</p>
         <dl className="shortcutList">
            {shortcutHelp.map((shortcut) => (
               <div key={shortcut.keys}>
                  <dt>
                     <kbd>{shortcut.keys}</kbd>
                  </dt>
                  <dd>{shortcut.action}</dd>
               </div>
            ))}
            <div key="esc">
               <dt>
                  <kbd>Esc</kbd>
               </dt>
               <dd>Close the topmost panel or menu</dd>
            </div>
         </dl>
         <p className="shortcutHint">
            <Keyboard aria-hidden="true" /> Right-clicking images, sets, and band tags also opens their actions.
         </p>
      </section>

      <p className="infoPanel__footer">
         <Info aria-hidden="true" /> Reviewing replaces scanning: a new scan starts from scratch, so move or recycle the duplicate folder first.
      </p>
   </OverlayPanel>
);
