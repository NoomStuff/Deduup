import { useEffect, useState } from "react";
import { Redo2, Undo2 } from "lucide-react";
import type { CommandId, Commands } from "../commands.js";
import { commandDefinitions, useBindingDisplay } from "../commands.js";
import type { TooltipProps } from "../hooks/useTooltip.js";
import "./MenuBar.css";

interface MenuBarProps {
   commands: Commands;
   menu: string | null;
   onMenuChange: (menu: string | null) => void;
   getTooltipProps: (title: string, body: string, hotkey?: string) => TooltipProps;
   reviewActive: boolean;
   canUndo: boolean;
   canRedo: boolean;
   currentNumber: string;
   totalSets: number;
   reviewPercent: number;
   readyToMoveCount: number;
   finalReviewOpen: boolean;
   onToggleFinalReview: () => void;
}

type MenuEntry = CommandId | "divider";

const menuItems: Record<string, MenuEntry[]> = {
   File: ["openFolder", "rescan", "startScreen"],
   Edit: ["undo", "redo", "clearAll"],
   Review: [
      "markSet",
      "autoselectSet",
      "autoselectBand",
      "clearSet",
      "divider",
      "previousSet",
      "nextSet",
      "previousBand",
      "nextBand",
      "divider",
      "compareSelected",
      "previewSelected",
      "toggleSelected",
      "finalReview",
   ],
   Help: ["help", "settings"],
};

/** Keeps a dropdown mounted through its exit animation after it closes. */
const usePresence = (open: boolean, closeMs = 120): { mounted: boolean; closing: boolean } => {
   const [state, setState] = useState({ mounted: open, closing: false });
   useEffect(() => {
      if (open) {
         setState({ mounted: true, closing: false });
         return undefined;
      }
      let timer: number | null = null;
      setState((current) => {
         if (!current.mounted || current.closing) return current;
         timer = window.setTimeout(() => setState({ mounted: false, closing: false }), closeMs);
         return { mounted: true, closing: true };
      });
      return () => {
         if (timer !== null) window.clearTimeout(timer);
      };
   }, [open, closeMs]);
   return state;
};

const MenuItem = ({ id, commands, onClose }: { id: CommandId; commands: Commands; onClose: () => void }) => {
   const bindingDisplay = useBindingDisplay(id);
   return (
      <button
         disabled={!commands[id].enabled()}
         onClick={() => {
            onClose();
            commands[id].run();
         }}
         role="menuitem"
         type="button"
      >
         <span>{commandDefinitions[id].label}</span>
         {bindingDisplay.length > 0 && <kbd>{bindingDisplay}</kbd>}
      </button>
   );
};

const AppMenu = ({
   name,
   entries,
   open,
   commands,
   onToggle,
   onClose,
}: {
   name: string;
   entries: MenuEntry[];
   open: boolean;
   commands: Commands;
   onToggle: () => void;
   onClose: () => void;
}) => {
   const { mounted, closing } = usePresence(open);
   return (
      <div className="appMenu" data-menu>
         <button
            aria-expanded={open}
            aria-haspopup="menu"
            className={`appMenu__button${open ? " appMenu__button--active" : ""}`}
            onClick={onToggle}
            type="button"
         >
            {name}
         </button>
         {mounted && (
            <div className={`menuDropdown${closing ? " menuDropdown--closing" : ""}`} role="menu">
               {entries.map((entry, index) =>
                  entry === "divider" ? (
                     <div className="menuDropdown__divider" key={`${name}-${index}`} role="separator" />
                  ) : (
                     <MenuItem key={entry} id={entry} commands={commands} onClose={onClose} />
                  )
               )}
            </div>
         )}
      </div>
   );
};

export const MenuBar = ({ menu, onMenuChange, ...props }: MenuBarProps) => {
   const undoHint = useBindingDisplay("undo");
   const redoHint = useBindingDisplay("redo");
   useEffect(() => {
      if (menu === null) return undefined;
      const close = (event: PointerEvent): void => {
         if (!(event.target instanceof Element && event.target.closest("[data-menu]"))) onMenuChange(null);
      };
      const escape = (event: KeyboardEvent): void => {
         if (event.key === "Escape") onMenuChange(null);
      };
      window.addEventListener("pointerdown", close);
      window.addEventListener("keydown", escape);
      return () => {
         window.removeEventListener("pointerdown", close);
         window.removeEventListener("keydown", escape);
      };
      // The listener follows the open-menu state; onMenuChange is stable per render.
   }, [menu, onMenuChange]);

   return (
      <div className="toolbar">
         <nav aria-label="Application menu" className="toolbar__menus">
            {Object.entries(menuItems).map(([name, entries]) => (
               <AppMenu
                  key={name}
                  name={name}
                  entries={entries}
                  open={menu === name}
                  commands={props.commands}
                  onToggle={() => onMenuChange(menu === name ? null : name)}
                  onClose={() => onMenuChange(null)}
               />
            ))}
         </nav>

         {props.reviewActive && (
            <div className="toolbar__actions">
               <button
                  aria-label="Undo"
                  className="iconButton"
                  disabled={!props.canUndo}
                  onClick={() => props.commands.undo.run()}
                  type="button"
                  {...props.getTooltipProps("Undo", "Restore the previous review choice.", undoHint)}
               >
                  <Undo2 aria-hidden="true" />
               </button>
               <button
                  aria-label="Redo"
                  className="iconButton"
                  disabled={!props.canRedo}
                  onClick={() => props.commands.redo.run()}
                  type="button"
                  {...props.getTooltipProps("Redo", "Reapply a choice you just undid.", redoHint)}
               >
                  <Redo2 aria-hidden="true" />
               </button>
               <span aria-hidden="true" className="toolbar__divider" />
               <p aria-label={`${props.currentNumber.replace("#", "")} of ${props.totalSets} sets`} className="toolbar__counter">
                  {props.currentNumber}
                  <span>/{props.totalSets}</span>
               </p>
               <div
                  aria-label={`${props.reviewPercent}% reviewed`}
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={props.reviewPercent}
                  className="toolbar__progress"
                  role="progressbar"
               >
                  <span style={{ width: `${props.reviewPercent}%` }} />
               </div>
               <span aria-hidden="true" className="toolbar__divider" />
               <button
                  className={`toolbar__finalStep${props.readyToMoveCount > 0 && !props.finalReviewOpen ? " toolbar__finalStep--hot" : ""}`}
                  disabled={props.finalReviewOpen}
                  onClick={props.onToggleFinalReview}
                  type="button"
                  {...props.getTooltipProps(
                     "Final review",
                     props.finalReviewOpen ? "Already open, press Esc to close it." : "See everything marked for removal before anything moves.",
                     "M"
                  )}
               >
                  Final review
                  {!props.finalReviewOpen && props.readyToMoveCount > 0 && <span className="toolbar__finalStepBadge">{props.readyToMoveCount}</span>}
               </button>
            </div>
         )}
      </div>
   );
};
