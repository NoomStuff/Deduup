import { createContext, useContext, useEffect, useRef } from "react";

/**
 * Single source of truth for every app action: the menu bar, toolbar buttons,
 * tooltips, the help panel, and the keyboard handler all read from here, so a
 * shortcut and its menu entry can never disagree. `keys` lists the keyboard
 * bindings as display strings ("Ctrl+O"); a command with several bindings
 * matches any of them. Users can rebind most commands in settings; their
 * overrides replace the defaults everywhere.
 */
export interface CommandDefinition {
   label: string;
   group: "File" | "Edit" | "Review" | "Help";
   keys?: string[];
   /** Compact display form when the raw bindings list reads poorly ("1–9"). */
   display?: string;
   /** Navigation commands may auto-repeat while the key is held. */
   repeat?: boolean;
   /** Stays live while panels or dialogs cover the screen (undo, redo). */
   stayLive?: boolean;
   /** Not rebindable (the number keys are fixed to their positions). */
   fixed?: boolean;
}

const definitions = {
   openFolder: { label: "Open folder…", group: "File", keys: ["Ctrl+O"] },
   startScreen: { label: "Start screen", group: "File" },

   undo: { label: "Undo", group: "Edit", keys: ["Ctrl+Z"], stayLive: true },
   redo: { label: "Redo", group: "Edit", keys: ["Ctrl+Shift+Z"], stayLive: true },
   clearAll: { label: "Clear every mark…", group: "Edit" },

   markSet: { label: "Mark the whole set for removal", group: "Review", keys: ["X"] },
   autoselectSet: { label: "Autoselect this set", group: "Review" },
   autoselectBand: { label: "Autoselect undecided sets in this band", group: "Review", keys: ["V"] },
   clearSet: { label: "Clear this set's marks", group: "Review" },
   compareSelected: { label: "Compare with another copy", group: "Review", keys: ["C"] },
   previewSelected: { label: "Preview the selected image", group: "Review", keys: ["Enter"] },
   toggleSelected: { label: "Mark or unmark the selected copy", group: "Review", keys: ["Delete", "Ctrl+Delete"] },
   toggleImageByNumber: {
      label: "Mark or unmark the Nth copy",
      group: "Review",
      keys: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "Ctrl+1", "Ctrl+2", "Ctrl+3", "Ctrl+4", "Ctrl+5", "Ctrl+6", "Ctrl+7", "Ctrl+8", "Ctrl+9"],
      display: "1–9 / Ctrl+1–9",
      fixed: true,
   },
   previousSet: { label: "Previous set", group: "Review", keys: ["←", "A"], repeat: true },
   nextSet: { label: "Next set", group: "Review", keys: ["→", "D", "Space"], repeat: true },
   previousBand: { label: "Previous similarity band", group: "Review", keys: ["Ctrl+←"], repeat: true },
   nextBand: { label: "Next similarity band", group: "Review", keys: ["Ctrl+→"], repeat: true },
   finalReview: { label: "Final review", group: "Review", keys: ["M"] },

   help: { label: "Help", group: "Help", keys: ["?", "F1"] },
   settings: { label: "Settings", group: "Help", keys: ["Ctrl+,"] },
} satisfies Record<string, CommandDefinition>;

export type CommandId = keyof typeof definitions;

export const commandDefinitions: Record<CommandId, CommandDefinition> = definitions;

/** User rebindings by command id; absent ids use the defaults. */
export type ShortcutOverrides = Partial<Record<CommandId, string[]>>;

const shortcutsStorageKey = "shortcut-overrides";

export const loadShortcutOverrides = (): ShortcutOverrides => {
   try {
      const raw = window.localStorage.getItem(shortcutsStorageKey);
      if (raw === null) return {};
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null) return {};
      const overrides: ShortcutOverrides = {};
      for (const [id, bindings] of Object.entries(parsed)) {
         if (Object.hasOwn(commandDefinitions, id) && Array.isArray(bindings) && bindings.every((binding) => typeof binding === "string")) {
            overrides[id as CommandId] = bindings;
         }
      }
      return overrides;
   } catch {
      return {};
   }
};

export const saveShortcutOverrides = (overrides: ShortcutOverrides): void => {
   window.localStorage.setItem(shortcutsStorageKey, JSON.stringify(overrides));
};

export const bindingsFor = (id: CommandId, overrides: ShortcutOverrides): string[] => overrides[id] ?? commandDefinitions[id].keys ?? [];

export interface Command {
   enabled: () => boolean;
   run: (event?: KeyboardEvent) => void;
}

export type Commands = Record<CommandId, Command>;

/** Live bindings for a command, provided above the whole app. */
export const ShortcutsContext = createContext<ShortcutOverrides>({});

export const useShortcutOverrides = (): ShortcutOverrides => useContext(ShortcutsContext);

export const useBindingDisplay = (id: CommandId): string => {
   const overrides = useShortcutOverrides();
   const bindings = bindingsFor(id, overrides);
   if (overrides[id] === undefined && commandDefinitions[id].display !== undefined) return commandDefinitions[id].display;
   return bindings.join(" / ");
};

/** Bindings are written as display strings, so the arrow glyphs and "Space"
   here are what the definitions store. */
const keyNames: Record<string, string> = { ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓" };

export const bindingFromEvent = (event: KeyboardEvent): string => {
   const parts: string[] = [];
   if (event.ctrlKey) parts.push("Ctrl");
   if (event.metaKey) parts.push("Meta");
   if (event.altKey) parts.push("Alt");
   if (event.shiftKey && (event.key.length > 1 || /[a-z]/i.test(event.key))) parts.push("Shift");
   const key = event.key === " " ? "Space" : (keyNames[event.key] ?? event.key);
   parts.push(key.length === 1 ? key.toUpperCase() : key);
   return parts.join("+");
};

/** Bindings the browser or OS reserves; capturing one refuses to save. */
const reservedBindings = new Set(["ALT+F4", "CTRL+Q", "CTRL+W", "CTRL+C", "CTRL+V", "CTRL+X", "ENTER"]);
export const isReservedBinding = (binding: string): boolean => reservedBindings.has(binding.toUpperCase());

/** Flat pointer-gesture list for the help panel; keyboard commands live in settings. */
export const pointerHelp: { keys: string; action: string }[] = [
   { keys: "Click", action: "Select a copy" },
   { keys: "Shift Click", action: "Mark or unmark a copy" },
   { keys: "Shift Right Click", action: "Keep only this copy" },
   { keys: "Alt Click", action: "Start a two-image compare" },
   { keys: "Double Click", action: "Preview a copy full size" },
   { keys: "Mouse 4 / 5", action: "Back or forward between sets" },
   { keys: "Right Click", action: "Open the actions menu" },
];

/**
 * Keyboard driver for the command registry. Review commands stand down while a
 * modal surface owns the screen; stayLive commands (undo, redo) keep working,
 * and Enter and Space stay native when a button holds focus so app shortcuts
 * never double-fire the focused control.
 */
export const useCommands = (commands: Commands, blocked: boolean, overrides: ShortcutOverrides): void => {
   const latest = useRef({ commands, blocked, overrides });
   latest.current = { commands, blocked, overrides };

   useEffect(() => {
      const handler = (event: KeyboardEvent): void => {
         if (event.isComposing || event.defaultPrevented) return;
         const target = event.target;
         if (target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable=true], [data-shortcut-capture]")) return;

         const key = event.key === " " ? "Space" : event.key;
         if ((key === "Enter" || key === "Space") && target instanceof HTMLElement && target.closest("button, a[href], [role=slider]")) return;

         const binding = bindingFromEvent(event);
         const normalized = binding.toUpperCase();
         const { commands: current, blocked: isBlocked, overrides: currentOverrides } = latest.current;
         const id = (Object.keys(commandDefinitions) as CommandId[]).find((candidate) => {
            if (candidate === "toggleImageByNumber") return /^[1-9]$/.test(event.key) && !event.altKey && !event.metaKey && !event.shiftKey;
            return bindingsFor(candidate, currentOverrides).some((keys) => keys.toUpperCase() === normalized);
         });
         if (id === undefined) return;

         const command = current[id];
         if (!command.enabled()) return;
         if (isBlocked && commandDefinitions[id].stayLive !== true) return;
         event.preventDefault();
         if (event.repeat && commandDefinitions[id].repeat !== true) return;
         command.run(event);
      };

      window.addEventListener("keydown", handler);
      return () => window.removeEventListener("keydown", handler);
   }, []);
};
