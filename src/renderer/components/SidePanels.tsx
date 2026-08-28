import { Eraser, Keyboard, ShieldCheck, X } from "lucide-react";
import { Toggle } from "./Toggle.js";

interface SettingsPanelProps {
   wrapImageShelf: boolean;
   confirmMajorActions: boolean;
   showStartupOnLaunch: boolean;
   onWrapChange: (checked: boolean) => void;
   onConfirmChange: (checked: boolean) => void;
   onStartupChange: (checked: boolean) => void;
   onClear: () => void;
   onClose: () => void;
}

const shortcuts: { keys: string; action: string }[] = [
   { keys: "← → / A D / Space", action: "Previous or next set" },
   { keys: "Ctrl ← →", action: "Jump between similarity bands" },
   { keys: "1–9", action: "Mark or keep the Nth image (Ctrl to advance)" },
   { keys: "Delete / Backspace", action: "Mark or keep the selected image" },
   { keys: "X", action: "Mark the whole set" },
   { keys: "V", action: "Autoselect the band" },
   { keys: "C", action: "Compare the selected image with its neighbour" },
   { keys: "Enter", action: "Preview the selected image" },
   { keys: "Shift Click", action: "Mark or keep an image" },
   { keys: "Alt Click", action: "Start a two-image compare" },
   { keys: "Ctrl Z / Ctrl Shift Z", action: "Undo or redo" },
   { keys: "Mouse 4 / 5", action: "Back or forward between sets" },
];

export const SettingsPanel = (props: SettingsPanelProps) => (
   <aside className="settingsPanel">
      <div className="panelHeader">
         <div>
            <p className="overlayLabel">App</p>
            <h2>Settings</h2>
         </div>
         <button aria-label="Close settings" className="iconButton" onClick={props.onClose} type="button">
            <X aria-hidden="true" />
         </button>
      </div>
      <div className="settingsGroup">
         <p className="settingsGroup__label">Review</p>
         <Toggle checked={props.wrapImageShelf} label="Wrap image shelf" onChange={props.onWrapChange} />
         <Toggle checked={props.confirmMajorActions} label="Confirm major actions" onChange={props.onConfirmChange} />
         <Toggle checked={props.showStartupOnLaunch} label="Show start screen on launch" onChange={props.onStartupChange} />
      </div>
      <div className="settingsGroup settingsGroup--safety">
         <ShieldCheck aria-hidden="true" />
         <div>
            <strong>How removal works</strong>
            <span>Marked images move into a managed duplicate folder inside your scan folder. They stay recoverable there until you recycle that folder.</span>
         </div>
      </div>
      <div className="settingsGroup">
         <p className="settingsGroup__label">Shortcuts</p>
         <dl className="shortcutList">
            {shortcuts.map((shortcut) => (
               <div key={shortcut.keys}>
                  <dt>
                     <kbd>{shortcut.keys}</kbd>
                  </dt>
                  <dd>{shortcut.action}</dd>
               </div>
            ))}
         </dl>
         <p className="shortcutHint">
            <Keyboard aria-hidden="true" /> Right-clicking images, sets, and band tags also opens their actions.
         </p>
      </div>
      <div className="settingsGroup settingsGroup--danger">
         <button className="dangerButton" onClick={props.onClear} type="button">
            <Eraser aria-hidden="true" /> Clear all choices
         </button>
      </div>
   </aside>
);
