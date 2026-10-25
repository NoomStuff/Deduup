import { useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { Plus, X } from "lucide-react";
import type { CommandId, ShortcutOverrides } from "../commands.js";
import { bindingsFor, bindingFromEvent, commandDefinitions, isReservedBinding } from "../commands.js";
import { Toggle } from "./Toggle.js";
import { OverlayPanel } from "./OverlayPanel.js";
import "./SettingsPanel.css";
import type { AppUpdates } from "../hooks/useAppUpdates.js";
import { UpdateSettings } from "./UpdateSettings.js";
import { navigatePanelTabs } from "./panelTabNavigation.js";

interface SettingsPanelProps {
   updates: AppUpdates;
   confirmMajorActions: boolean;
   showStartupOnLaunch: boolean;
   wrapImageShelf: boolean;
   shortcuts: ShortcutOverrides;
   onWrapChange: (checked: boolean) => void;
   onConfirmChange: (checked: boolean) => void;
   onStartupChange: (checked: boolean) => void;
   onShortcutsChange: (overrides: ShortcutOverrides) => void;
   onClose: () => void;
}

type SettingsTab = "general" | "shortcuts" | "updates";

const shortcutGroups = ([...new Set(Object.values(commandDefinitions).map(({ group }) => group))] as const).map((group) => ({
   name: group,
   commands: (Object.keys(commandDefinitions) as CommandId[]).filter((id) => commandDefinitions[id].group === group && commandDefinitions[id].fixed !== true),
}));

export const SettingsPanel = (props: SettingsPanelProps) => {
   const [tab, setTab] = useState<SettingsTab>("general");
   const [query, setQuery] = useState("");
   const [recording, setRecording] = useState<{ id: CommandId; index: number | null } | null>(null);
   const [captured, setCaptured] = useState("");
   const [conflict, setConflict] = useState("");
   const [confirmReset, setConfirmReset] = useState(false);

   const editBinding = (id: CommandId, index: number | null): void => {
      setRecording({ id, index });
      setCaptured("");
      setConflict("");
   };

   const updateBindings = (id: CommandId, bindings: string[]): void => {
      const next = Object.fromEntries(Object.entries(props.shortcuts).filter(([key]) => key !== id)) as ShortcutOverrides;
      next[id] = bindings;
      props.onShortcutsChange(next);
      setRecording(null);
      setConflict("");
   };

   const needle = query.trim().toLowerCase();
   const matches = (id: CommandId): boolean => {
      if (needle.length === 0) return true;
      // A row being edited stays visible even when the query no longer matches it.
      if (recording?.id === id) return true;
      const bindings = bindingsFor(id, props.shortcuts);
      return [commandDefinitions[id].label, ...bindings].join(" ").toLowerCase().includes(needle);
   };

   const captureBinding = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
      if (recording === null || event.nativeEvent.isComposing || event.nativeEvent.repeat) return;
      if (event.key === "Tab") return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
         setRecording(null);
         return;
      }
      if (["Control", "Meta", "Alt", "Shift"].includes(event.key)) return;
      const binding = bindingFromEvent(event.nativeEvent);
      setCaptured(binding);
      if (isReservedBinding(binding)) {
         setConflict("That shortcut belongs to the system or a standard control.");
         return;
      }
      const duplicate = (Object.keys(commandDefinitions) as CommandId[]).find((id) =>
         bindingsFor(id, props.shortcuts).some(
            (key, index) => !(id === recording.id && index === recording.index) && key.toUpperCase() === binding.toUpperCase()
         )
      );
      setConflict(duplicate === undefined ? "" : `Already used by “${commandDefinitions[duplicate].label}”.`);
   };

   return (
      <OverlayPanel
         backdropClassName="settingsPanel__backdrop"
         closeLabel="Close settings"
         labelledBy="settings-title"
         rootClassName="settingsPanel"
         surfaceClassName="settingsPanel__surface panelModal"
         onClose={props.onClose}
      >
         <header className="panelModal__header">
            <h2 id="settings-title">Settings</h2>
            <button aria-label="Close settings" className="iconButton" onClick={props.onClose} type="button">
               <X aria-hidden="true" />
            </button>
         </header>
         <div aria-label="Settings sections" className="panelModal__tabs" onKeyDown={navigatePanelTabs} role="tablist">
            <button
               aria-controls="settings-panel"
               aria-selected={tab === "general"}
               id="settings-tab-general"
               tabIndex={tab === "general" ? 0 : -1}
               onClick={() => {
                  setTab("general");
                  setRecording(null);
               }}
               role="tab"
               type="button"
            >
               General
            </button>
            <button
               aria-controls="settings-panel"
               aria-selected={tab === "shortcuts"}
               id="settings-tab-shortcuts"
               tabIndex={tab === "shortcuts" ? 0 : -1}
               onClick={() => setTab("shortcuts")}
               role="tab"
               type="button"
            >
               Keyboard shortcuts
            </button>
            <button
               aria-controls="settings-panel"
               aria-selected={tab === "updates"}
               id="settings-tab-updates"
               tabIndex={tab === "updates" ? 0 : -1}
               onClick={() => {
                  setTab("updates");
                  setRecording(null);
               }}
               role="tab"
               type="button"
            >
               App &amp; updates
            </button>
         </div>

         <div aria-labelledby={`settings-tab-${tab}`} className="panelModal__content" id="settings-panel" role="tabpanel" tabIndex={0}>
            {tab === "updates" ? (
               <UpdateSettings updates={props.updates} />
            ) : tab === "general" ? (
               <div className="panelModal__body">
                  <div className="settingRow settingRow--toggle">
                     <Toggle checked={props.wrapImageShelf} label="Wrap the image shelf onto multiple rows" onChange={props.onWrapChange} />
                     <small>Otherwise the images share one scrolling row.</small>
                  </div>
                  <div className="settingRow settingRow--toggle">
                     <Toggle checked={props.confirmMajorActions} label="Confirm review actions" onChange={props.onConfirmChange} />
                     <small>Discards in bulk ask first. Moving and recycling always confirm, no matter what this is set to.</small>
                  </div>
                  <div className="settingRow settingRow--toggle">
                     <Toggle checked={props.showStartupOnLaunch} label="Show start screen on launch" onChange={props.onStartupChange} />
                     <small>The start screen offers open and continue. Library changes update automatically.</small>
                  </div>
               </div>
            ) : (
               <div className="panelModal__body">
                  <div className="shortcutToolbar">
                     <input
                        aria-label="Search shortcuts"
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search actions or keys"
                        type="search"
                        value={query}
                     />
                     <button
                        className={confirmReset ? "dangerButton" : "ghostButton"}
                        onBlur={() => setConfirmReset(false)}
                        onClick={() => {
                           if (confirmReset) {
                              props.onShortcutsChange({});
                              setRecording(null);
                              setConflict("");
                              setQuery("");
                              setConfirmReset(false);
                           } else {
                              setConfirmReset(true);
                           }
                        }}
                        type="button"
                     >
                        {confirmReset ? "Really reset?" : "Reset bindings"}
                     </button>
                  </div>
                  <div className="shortcutList">
                     {shortcutGroups.map((group) => {
                        const commands = group.commands.filter(matches);
                        if (commands.length === 0) return null;
                        return (
                           <section aria-labelledby={`shortcuts-${group.name}`} className="shortcutGroup" key={group.name}>
                              <h3 id={`shortcuts-${group.name}`}>{group.name}</h3>
                              {commands.map((id) => (
                                 <div className="shortcutRow" key={id}>
                                    <div className="shortcutLine">
                                       <span className="shortcutAction">{commandDefinitions[id].label}</span>
                                       <div className="shortcutBindings">
                                          {bindingsFor(id, props.shortcuts).map((binding, index) => (
                                             <span className="shortcutChip" key={binding}>
                                                <button
                                                   aria-label={`Change ${binding} for ${commandDefinitions[id].label}`}
                                                   className="shortcutBinding"
                                                   onClick={() => editBinding(id, index)}
                                                   type="button"
                                                >
                                                   <kbd>{binding}</kbd>
                                                </button>
                                                <button
                                                   aria-label={`Remove ${binding} from ${commandDefinitions[id].label}`}
                                                   className="shortcutRemove"
                                                   onClick={() =>
                                                      updateBindings(
                                                         id,
                                                         bindingsFor(id, props.shortcuts).filter((_, position) => position !== index)
                                                      )
                                                   }
                                                   type="button"
                                                >
                                                   <X aria-hidden="true" />
                                                </button>
                                             </span>
                                          ))}
                                          <button
                                             aria-label={`Add binding for ${commandDefinitions[id].label}`}
                                             className="shortcutAdd"
                                             onClick={() => editBinding(id, null)}
                                             type="button"
                                          >
                                             <Plus aria-hidden="true" />
                                          </button>
                                       </div>
                                    </div>
                                    {recording?.id === id && (
                                       <div className="shortcutEditor" key={`${id}-${String(recording.index)}`}>
                                          <button
                                             aria-label={`Record binding for ${commandDefinitions[id].label}`}
                                             className="shortcutCapture"
                                             data-shortcut-capture=""
                                             onKeyDown={captureBinding}
                                             ref={(element) => element?.focus()}
                                             type="button"
                                          >
                                             <kbd>{captured.length > 0 ? captured : "Press keys…"}</kbd>
                                          </button>
                                          <div className="shortcutEditorActions">
                                             <p
                                                className={conflict.length > 0 ? "inlineError" : "shortcutHint"}
                                                role={conflict.length > 0 ? "alert" : undefined}
                                             >
                                                {conflict.length > 0 ? conflict : "Press a key combination, then save. Escape cancels."}
                                             </p>
                                             <button className="ghostButton" onClick={() => setRecording(null)} type="button">
                                                Cancel
                                             </button>
                                             <button
                                                className="primaryButton"
                                                disabled={captured.length === 0 || conflict.length > 0}
                                                onClick={() => {
                                                   const bindings = [...bindingsFor(id, props.shortcuts)];
                                                   if (recording.index === null) bindings.push(captured);
                                                   else bindings[recording.index] = captured;
                                                   updateBindings(id, bindings);
                                                }}
                                                type="button"
                                             >
                                                Save binding
                                             </button>
                                          </div>
                                       </div>
                                    )}
                                 </div>
                              ))}
                           </section>
                        );
                     })}
                     {shortcutGroups.every((group) => group.commands.every((id) => !matches(id))) && (
                        <p className="shortcutEmpty">No actions match that search.</p>
                     )}
                  </div>
               </div>
            )}
         </div>
      </OverlayPanel>
   );
};
