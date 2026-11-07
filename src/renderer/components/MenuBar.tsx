import { useEffect, useRef, useState } from "react";
import { Redo2, Undo2 } from "lucide-react";
import type { CommandId, Commands } from "../commands.js";
import { commandDefinitions, useBindingDisplay } from "../commands.js";
import { tooltipProps } from "../tooltip.js";
import "./MenuBar.css";

interface MenuBarProps {
   commands: Commands;
   menu: string | null;
   onMenuChange: (menu: string | null) => void;
   reviewActive: boolean;
   canUndo: boolean;
   canRedo: boolean;
   readyToMoveCount: number;
   finalReviewOpen: boolean;
   onToggleFinalReview: () => void;
}

type MenuEntry = CommandId | "divider";

const menuItems: Record<string, MenuEntry[]> = {
   File: ["openFolder", "startScreen"],
   Edit: ["undo", "redo", "clearAll"],
   Review: [
      "discardSet",
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
      "keepOnlySelected",
      "finalReview",
   ],
   Help: ["help", "about", "divider", "releasesPage", "settings"],
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
   // An open menu renders in the same pass that opened it: waiting for the
   // effect left a frame where a fast arrow key found no items to focus.
   return open ? { mounted: true, closing: false } : state;
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
   const rootRef = useRef<HTMLDivElement>(null);
   const focusItem = (last = false): void => {
      const items = rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)');
      (last ? items?.item(items.length - 1) : items?.item(0))?.focus();
   };
   return (
      <div
         className="appMenu"
         data-menu
         ref={rootRef}
         onKeyDown={(event) => {
            if (event.key === "Escape" && open) {
               event.preventDefault();
               onClose();
               rootRef.current?.querySelector<HTMLButtonElement>(".appMenu__button")?.focus();
               return;
            }
            if (event.key === "Tab") {
               onClose();
               return;
            }
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            if (!open) {
               onToggle();
               window.requestAnimationFrame(() => focusItem(event.key === "ArrowUp" || event.key === "End"));
               return;
            }
            const items = [...(rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])];
            const index = items.findIndex((item) => item === document.activeElement);
            if (index < 0) {
               focusItem(event.key === "ArrowUp" || event.key === "End");
               return;
            }
            const next =
               event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
            items[next]?.focus();
         }}
      >
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
            <div className={`menuDropdown${closing ? " menuDropdown--closing" : ""}`} inert={closing} role="menu">
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
   const finalReviewHint = useBindingDisplay("finalReview");
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
            <div
               className="toolbar__actions"
               onMouseDown={(event) => {
                  // Like the review surface: a clicked undo or redo must not hold
                  // focus, or the next Space repeats it instead of moving on.
                  if (event.button !== 0 || !(event.target instanceof Element) || event.target.closest("button") === null) return;
                  event.preventDefault();
               }}
            >
               <button
                  aria-label="Undo"
                  className="iconButton"
                  disabled={!props.canUndo}
                  onClick={() => props.commands.undo.run()}
                  type="button"
                  {...tooltipProps("Undo", "Restore the previous review choice.", undoHint)}
               >
                  <Undo2 aria-hidden="true" />
               </button>
               <button
                  aria-label="Redo"
                  className="iconButton"
                  disabled={!props.canRedo}
                  onClick={() => props.commands.redo.run()}
                  type="button"
                  {...tooltipProps("Redo", "Reapply a choice you just undid.", redoHint)}
               >
                  <Redo2 aria-hidden="true" />
               </button>
               <span aria-hidden="true" className="toolbar__divider" />
               <button
                  className="primaryButton toolbar__finalStep"
                  disabled={props.finalReviewOpen}
                  onClick={props.onToggleFinalReview}
                  type="button"
                  {...tooltipProps(
                     "Final review",
                     props.finalReviewOpen ? "Already open, press Esc to close it." : "See everything you've discarded before anything moves.",
                     finalReviewHint
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
