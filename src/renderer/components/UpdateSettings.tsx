import type { AppUpdates } from "../hooks/useAppUpdates.js";
import { updatePresentation } from "../updatePresentation.js";
import { Toggle } from "./Toggle.js";

export const UpdateSettings = ({ updates }: { updates: AppUpdates }) => {
   const { state, availableUpdate, appVersion, checkOnStartup, setCheckOnStartup, checkForUpdates, updateActions } = updates;
   const presentation = availableUpdate === null ? null : updatePresentation(availableUpdate, state.status);
   const busy = state.checking || presentation?.downloading === true;
   return (
      <div className="panelModal__body">
         <div className="settingRow">
            <div>
               Deduup<small>{appVersion ? `Version ${appVersion}` : ""}</small>
            </div>
         </div>
         <div className="settingRow settingRow--toggle">
            <Toggle checked={checkOnStartup} label="Check for updates at startup" onChange={setCheckOnStartup} />
         </div>
         <div className="updateSettings" aria-label="App updates">
            <p role="status" aria-live="polite">
               {state.checking ? state.message : (state.checkError ?? presentation?.message ?? state.message)}
            </p>
            {availableUpdate !== null && <small>Deduup {availableUpdate.version}</small>}
            {presentation?.downloading && <progress aria-label="Update download" max={100} value={presentation.percent ?? undefined} />}
            {state.lastChecked !== null && <small>Last checked {new Date(state.lastChecked).toLocaleString()}</small>}
            <div className="updateSettings__actions">
               {presentation?.action && (
                  <button type="button" className="primaryButton" onClick={updateActions[presentation.action]}>
                     {presentation.label}
                  </button>
               )}
               <button type="button" className="ghostButton" disabled={busy} onClick={checkForUpdates}>
                  {state.checking ? "Checking for updates" : "Check for updates"}
               </button>
            </div>
         </div>
      </div>
   );
};
