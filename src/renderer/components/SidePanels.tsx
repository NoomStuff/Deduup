import { Eraser, FolderTree, Keyboard, RotateCw, X } from "lucide-react";
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

export const SettingsPanel = (props: SettingsPanelProps) => (
   <aside className="settingsPanel">
      <PanelHeader label="App" title="Settings" onClose={props.onClose} />
      <div className="settingsGroup">
         <p className="sectionLabel">Review</p>
         <Toggle checked={props.wrapImageShelf} label="Wrap image shelf" onChange={props.onWrapChange} />
         <Toggle checked={props.confirmMajorActions} label="Confirm major actions" onChange={props.onConfirmChange} />
         <Toggle checked={props.showStartupOnLaunch} label="Show start screen on launch" onChange={props.onStartupChange} />
         <button className="danger" onClick={props.onClear} type="button">
            <Eraser aria-hidden="true" /> Clear choices
         </button>
      </div>
      <div className="shortcutReference">
         <Keyboard aria-hidden="true" />
         <div>
            <strong>Power keys</strong>
            <span>Shift-click toggles deletion, Ctrl advances, and Alt-click compares images.</span>
         </div>
      </div>
   </aside>
);

interface ScanPanelProps {
   scanRoot: string | null;
   includeSubfolders: boolean;
   onIncludeSubfoldersChange: (checked: boolean) => void;
   onChooseFolder: () => void;
   onRescan: () => void;
   onClear: () => void;
   onClose: () => void;
}

export const ScanPanel = (props: ScanPanelProps) => (
   <aside className="settingsPanel">
      <PanelHeader label="Scan" title="Folder" onClose={props.onClose} />
      <div className="scanPanelPath">
         <FolderTree aria-hidden="true" />
         <span>{props.scanRoot ?? "No folder selected"}</span>
      </div>
      <div className="settingsGroup">
         <Toggle checked={props.includeSubfolders} label="Include subfolders" onChange={props.onIncludeSubfoldersChange} />
         <button onClick={props.onChooseFolder} type="button">
            <FolderTree aria-hidden="true" /> Change folder
         </button>
         <button disabled={props.scanRoot === null} onClick={props.onRescan} type="button">
            <RotateCw aria-hidden="true" /> Rescan
         </button>
         <button className="danger" onClick={props.onClear} type="button">
            <Eraser aria-hidden="true" /> Clear choices
         </button>
      </div>
   </aside>
);

const PanelHeader = ({ label, title, onClose }: { label: string; title: string; onClose: () => void }) => (
   <div className="panelHeader">
      <div>
         <p className="sectionLabel">{label}</p>
         <h2>{title}</h2>
      </div>
      <button aria-label={`Close ${title.toLowerCase()}`} className="iconButton" onClick={onClose} type="button">
         <X aria-hidden="true" />
      </button>
   </div>
);
