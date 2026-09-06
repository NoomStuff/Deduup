/**
 * Single source of truth for every shortcut: the keyboard handler, the settings
 * help list, tooltips, and context-menu key hints all read from here. Keyboard
 * definitions are priority-ordered; the first matching `when` wins.
 */

export interface ShortcutContext {
   blocked: boolean;
   compareOpen: boolean;
   hasCurrentSet: boolean;
   hasSelectedImage: boolean;
   targetIsActivatable: boolean;
   targetIsEditable: boolean;
}

export interface ShortcutHandlers {
   onAutoSelectBand: () => void;
   onCompareSelected: () => void;
   onKeepCompareImage: (side: "left" | "right") => void;
   onNavigate: (offset: number) => void;
   onNavigateBand: (direction: -1 | 1) => void;
   onPreviewSelected: () => void;
   onRedo: () => void;
   onRequestMarkCurrentSet: () => void;
   onToggleImageAtIndex: (index: number, advance: boolean) => void;
   onToggleSelectedImage: (advance: boolean) => void;
   onUndo: () => void;
}

export interface ShortcutDefinition {
   id: string;
   keys: string;
   action: string;
   /** Undo and redo keep working while a text field has focus. */
   allowInEditable?: boolean;
   preventDefault?: boolean;
   when: (event: KeyboardEvent, context: ShortcutContext) => boolean;
   run: (event: KeyboardEvent, handlers: ShortcutHandlers) => void;
}

export interface PointerShortcut {
   id: string;
   keys: string;
   action: string;
}

const key = (event: KeyboardEvent): string => event.key.toLowerCase();
const inReviewMode = (context: ShortcutContext): boolean => !context.blocked && !context.compareOpen;

export const shortcutDefinitions: ShortcutDefinition[] = [
   {
      id: "undo",
      keys: "Ctrl Z",
      action: "Undo the last choice",
      allowInEditable: true,
      when: (event) => event.ctrlKey && !event.shiftKey && key(event) === "z",
      run: (_event, handlers) => handlers.onUndo(),
   },
   {
      id: "redo",
      keys: "Ctrl Shift Z / Ctrl Y",
      action: "Redo an undone choice",
      allowInEditable: true,
      when: (event) => event.ctrlKey && ((event.shiftKey && key(event) === "z") || key(event) === "y"),
      run: (_event, handlers) => handlers.onRedo(),
   },
   {
      id: "compareKeepLeft",
      keys: "←",
      action: "Keep the left copy while comparing",
      when: (event, context) => context.compareOpen && !context.blocked && event.key === "ArrowLeft",
      run: (_event, handlers) => handlers.onKeepCompareImage("left"),
   },
   {
      id: "compareKeepRight",
      keys: "→",
      action: "Keep the right copy while comparing",
      when: (event, context) => context.compareOpen && !context.blocked && event.key === "ArrowRight",
      run: (_event, handlers) => handlers.onKeepCompareImage("right"),
   },
   {
      id: "bandPrevious",
      keys: "Ctrl ←",
      action: "Jump to the previous similarity band",
      when: (event, context) => inReviewMode(context) && event.ctrlKey && event.key === "ArrowLeft",
      run: (_event, handlers) => handlers.onNavigateBand(-1),
   },
   {
      id: "bandNext",
      keys: "Ctrl →",
      action: "Jump to the next similarity band",
      when: (event, context) => inReviewMode(context) && event.ctrlKey && event.key === "ArrowRight",
      run: (_event, handlers) => handlers.onNavigateBand(1),
   },
   {
      id: "navigatePrevious",
      keys: "← / A",
      action: "Go to the previous set",
      when: (event, context) => inReviewMode(context) && (event.key === "ArrowLeft" || key(event) === "a"),
      run: (_event, handlers) => handlers.onNavigate(-1),
   },
   {
      id: "navigateNext",
      keys: "→ / D / Space",
      action: "Go to the next set",
      when: (event, context) => inReviewMode(context) && (event.key === "ArrowRight" || key(event) === "d" || event.key === " "),
      run: (_event, handlers) => handlers.onNavigate(1),
   },
   {
      id: "markSet",
      keys: "X",
      action: "Mark the whole set for removal",
      when: (event, context) => inReviewMode(context) && context.hasCurrentSet && key(event) === "x",
      run: (_event, handlers) => handlers.onRequestMarkCurrentSet(),
   },
   {
      id: "autoSelectBand",
      keys: "V",
      action: "Autoselect every set in the band",
      when: (event, context) => inReviewMode(context) && context.hasCurrentSet && key(event) === "v",
      run: (_event, handlers) => handlers.onAutoSelectBand(),
   },
   {
      id: "compareSelected",
      keys: "C",
      action: "Compare the selected image with its neighbour",
      when: (event, context) => inReviewMode(context) && context.hasSelectedImage && key(event) === "c",
      run: (_event, handlers) => handlers.onCompareSelected(),
   },
   {
      id: "previewSelected",
      keys: "Enter",
      action: "Preview the selected image",
      when: (event, context) => inReviewMode(context) && context.hasSelectedImage && event.key === "Enter" && !context.targetIsActivatable,
      run: (_event, handlers) => handlers.onPreviewSelected(),
   },
   {
      id: "toggleSelected",
      keys: "Delete / Backspace",
      action: "Mark or keep the selected image",
      when: (event, context) => inReviewMode(context) && context.hasSelectedImage && (event.key === "Delete" || event.key === "Backspace"),
      run: (event, handlers) => handlers.onToggleSelectedImage(event.ctrlKey),
   },
   {
      id: "toggleImageByNumber",
      keys: "1–9",
      action: "Mark or keep the Nth image (Ctrl advances to the next set)",
      when: (event, context) => inReviewMode(context) && context.hasCurrentSet && /^[1-9]$/u.test(event.key),
      run: (event, handlers) => handlers.onToggleImageAtIndex(Number.parseInt(event.key, 10) - 1, event.ctrlKey),
   },
];

export const pointerShortcuts: PointerShortcut[] = [
   { id: "toggleImagePointer", keys: "Shift Click", action: "Mark or keep an image" },
   { id: "keepOnlyThisPointer", keys: "Shift Right Click", action: "Keep only this image" },
   { id: "comparePointer", keys: "Alt Click", action: "Start a two-image compare" },
   { id: "historyPointer", keys: "Mouse 4 / 5", action: "Back or forward between sets" },
];

export const getShortcutKeys = (id: string): string => [...shortcutDefinitions, ...pointerShortcuts].find((shortcut) => shortcut.id === id)?.keys ?? "";

export const shortcutHelp: { keys: string; action: string }[] = [
   ...shortcutDefinitions.map(({ keys, action }) => ({ keys, action })),
   ...pointerShortcuts.map(({ keys, action }) => ({ keys, action })),
];
