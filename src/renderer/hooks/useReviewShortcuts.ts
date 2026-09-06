import { useEffect, useLayoutEffect, useRef } from "react";
import { shortcutDefinitions } from "../appShortcuts.js";
import type { ShortcutContext, ShortcutHandlers } from "../appShortcuts.js";
import type { CompareState } from "../appTypes.js";

const editableTargetSelector = "input,textarea,select,[contenteditable='true']";
const activatableTargetSelector = "button,a,input,textarea,select,[contenteditable='true'],[role='menuitem']";

export interface ReviewShortcutsOptions extends ShortcutHandlers {
   /** True while an overlay, panel, or menu owns the screen: review keys stand down, undo/redo stay live. */
   blocked: boolean;
   compare: CompareState | null;
   hasCurrentSet: boolean;
   hasSelectedImage: boolean;
}

export const useReviewShortcuts = (options: ReviewShortcutsOptions): void => {
   const optionsRef = useRef(options);
   useLayoutEffect(() => {
      optionsRef.current = options;
   });

   // Attached once; the ref keeps every keystroke reading the latest options.
   // Panels and menus close themselves (OverlayPanel, ReviewContextMenu), so
   // this hook only drives the review through the shared shortcut registry.
   useEffect(() => {
      const onKeyDown = (event: KeyboardEvent): void => {
         const current = optionsRef.current;
         const target = event.target;
         const context: ShortcutContext = {
            blocked: current.blocked,
            compareOpen: current.compare !== null,
            hasCurrentSet: current.hasCurrentSet,
            hasSelectedImage: current.hasSelectedImage,
            targetIsActivatable: target instanceof HTMLElement && target.closest(activatableTargetSelector) !== null,
            targetIsEditable: target instanceof HTMLElement && target.closest(editableTargetSelector) !== null,
         };

         for (const definition of shortcutDefinitions) {
            if (!definition.when(event, context)) continue;
            if (!definition.allowInEditable && context.targetIsEditable) continue;
            if (definition.preventDefault !== false) event.preventDefault();
            definition.run(event, current);
            return;
         }
      };

      window.addEventListener("keydown", onKeyDown, { capture: true });
      return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
   }, []);
};
