import { Eraser, X } from "lucide-react";
import { Toggle } from "./Toggle.js";
import { OverlayPanel } from "./OverlayPanel.js";
import "./SettingsPanel.css";

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

export const SettingsPanel = (props: SettingsPanelProps) => (
   <OverlayPanel
      backdropClassName="settingsPanel__backdrop"
      closeLabel="Close settings"
      labelledBy="settings-title"
      placement="right"
      rootClassName="settingsPanel"
      surfaceClassName="settingsPanel__surface"
      onClose={props.onClose}
   >
      <div className="panelHeader">
         <div>
            <p className="overlayLabel">App</p>
            <h2 id="settings-title">Settings</h2>
         </div>
         <button aria-label="Close settings" className="iconButton" onClick={props.onClose} type="button">
            <X aria-hidden="true" />
         </button>
      </div>
      <div className="panelGroup">
         <p className="panelGroup__label">Review</p>
         <Toggle checked={props.wrapImageShelf} label="Wrap image shelf" onChange={props.onWrapChange} />
         <Toggle checked={props.confirmMajorActions} label="Confirm major actions" onChange={props.onConfirmChange} />
         <Toggle checked={props.showStartupOnLaunch} label="Show start screen on launch" onChange={props.onStartupChange} />
      </div>
      <div className="panelGroup panelGroup--danger">
         <button className="dangerButton" onClick={props.onClear} type="button">
            <Eraser aria-hidden="true" /> Clear all choices
         </button>
      </div>
   </OverlayPanel>
);
