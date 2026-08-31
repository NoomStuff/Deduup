import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MouseEventHandler } from "react";
import { Check, Eraser, FolderOpen, Image as ImageIcon, Search, Sparkles, Trash2 } from "lucide-react";
import type { ImageItem } from "../../shared/types.js";
import type { ContextMenuState } from "../appTypes.js";
import { clamp } from "../reviewModel.js";
import "./ReviewContextMenu.css";

interface ReviewContextMenuProps {
   context: ContextMenuState;
   image: ImageItem | null;
   imageIsDeleted: boolean;
   onlyImageIsKept: boolean;
   onAutoSelectImageSet: () => void;
   onAutoSelectBand: () => void;
   onBeginCompare: () => void;
   onClearImageSet: () => void;
   onClearBand: () => void;
   onClose: () => void;
   onMarkImageSet: () => void;
   onMarkBand: () => void;
   onMarkBandSeen: () => void;
   onOpenImage: () => void;
   onPreviewImage: () => void;
   onShowImage: () => void;
   onToggleImage: () => void;
   onToggleOtherImages: () => void;
}

const margin = 12;
const gap = 8;

const command =
   (run: () => void, close: () => void): MouseEventHandler<HTMLButtonElement> =>
   () => {
      run();
      close();
   };

/** Positions itself against the anchor after measuring its real size, so the JS side never hardcodes menu dimensions. */
export const ReviewContextMenu = (props: ReviewContextMenuProps) => {
   const menuRef = useRef<HTMLDivElement | null>(null);
   const [position, setPosition] = useState<{ left: number; top: number; ready: boolean }>({ left: 0, top: 0, ready: false });

   useLayoutEffect(() => {
      const menu = menuRef.current;
      if (menu === null) return;
      const width = menu.offsetWidth;
      const height = menu.offsetHeight;
      let preferredX: number;
      let preferredY: number;
      if (props.context.anchor.kind === "rect") {
         const rect = props.context.anchor.rect;
         preferredX = rect.left + width + margin > window.innerWidth ? rect.right - width : rect.left;
         preferredY = rect.bottom + gap + height + margin > window.innerHeight ? rect.top - height - gap : rect.bottom + gap;
      } else {
         const { x, y } = props.context.anchor;
         preferredX = x + width + margin > window.innerWidth ? x - width : x;
         preferredY = y + height + margin > window.innerHeight ? y - height : y;
      }
      setPosition({
         left: clamp(preferredX, margin, Math.max(margin, window.innerWidth - width - margin)),
         top: clamp(preferredY, margin, Math.max(margin, window.innerHeight - height - margin)),
         ready: true,
      });
   }, [props.context]);

   useEffect(() => {
      const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const frame = window.requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus());
      const onKeyDown = (event: KeyboardEvent): void => {
         if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
         event.preventDefault();
         event.stopImmediatePropagation();
         props.onClose();
      };
      const onPointerDown = (event: globalThis.PointerEvent): void => {
         if (event.target instanceof Element && menuRef.current?.contains(event.target)) return;
         props.onClose();
      };
      document.addEventListener("keydown", onKeyDown);
      document.addEventListener("pointerdown", onPointerDown, true);
      return () => {
         window.cancelAnimationFrame(frame);
         document.removeEventListener("keydown", onKeyDown);
         document.removeEventListener("pointerdown", onPointerDown, true);
         if (previouslyFocused?.isConnected) previouslyFocused.focus();
      };
      // The menu is mounted fresh per open; the listeners belong to that instance.
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, []);

   return (
      <div
         aria-label="Actions"
         className={`contextMenu${position.ready ? "" : " contextMenu--measuring"}`}
         ref={menuRef}
         role="menu"
         style={{ left: position.left, top: position.top }}
      >
         {props.context.menuKind === "image" && props.image !== null && (
            <>
               <button
                  className="contextMenu__command contextMenu__command--danger contextMenu__command--important"
                  disabled={props.image.sourceStatus !== "available"}
                  onClick={command(props.onToggleImage, props.onClose)}
                  type="button"
               >
                  <Trash2 aria-hidden="true" />
                  <span>{props.imageIsDeleted ? "Keep image" : "Mark for removal"}</span>
                  <kbd>Shift Click</kbd>
               </button>
               <button
                  className="contextMenu__command contextMenu__command--danger contextMenu__command--important"
                  disabled={props.image.sourceStatus !== "available"}
                  onClick={command(props.onToggleOtherImages, props.onClose)}
                  type="button"
               >
                  <Trash2 aria-hidden="true" />
                  <span>{props.onlyImageIsKept ? "Restore the others" : "Keep only this"}</span>
                  <kbd>Shift Right Click</kbd>
               </button>
               <div className="contextMenu__divider" />
               <button
                  className="contextMenu__command contextMenu__command--accent"
                  disabled={props.image.sourceStatus !== "available"}
                  onClick={command(props.onBeginCompare, props.onClose)}
                  type="button"
               >
                  <Search aria-hidden="true" />
                  <span>Compare</span>
                  <kbd>Alt Click</kbd>
               </button>
               <button
                  className="contextMenu__command"
                  disabled={props.image.sourceStatus === "missing" || props.image.sourceStatus === "recycledByApp"}
                  onClick={command(props.onPreviewImage, props.onClose)}
                  type="button"
               >
                  <ImageIcon aria-hidden="true" />
                  <span>Preview</span>
                  <kbd>Enter</kbd>
               </button>
               <div className="contextMenu__divider" />
               <button className="contextMenu__command" onClick={command(props.onShowImage, props.onClose)} type="button">
                  <FolderOpen aria-hidden="true" />
                  <span>Show in folder</span>
               </button>
               <button className="contextMenu__command" onClick={command(props.onOpenImage, props.onClose)} type="button">
                  <ImageIcon aria-hidden="true" />
                  <span>Open image</span>
               </button>
            </>
         )}
         {props.context.menuKind === "imageSet" && (
            <>
               <button
                  className="contextMenu__command contextMenu__command--danger contextMenu__command--important"
                  onClick={command(props.onMarkImageSet, props.onClose)}
                  type="button"
               >
                  <Trash2 aria-hidden="true" />
                  <span>Mark whole set</span>
                  <kbd>X</kbd>
               </button>
               <button className="contextMenu__command contextMenu__command--accent" onClick={command(props.onAutoSelectImageSet, props.onClose)} type="button">
                  <Sparkles aria-hidden="true" />
                  <span>Autoselect</span>
               </button>
               <button className="contextMenu__command" onClick={command(props.onClearImageSet, props.onClose)} type="button">
                  <Eraser aria-hidden="true" />
                  <span>Clear choices</span>
               </button>
            </>
         )}
         {props.context.menuKind === "similarityBand" && (
            <>
               <button
                  className="contextMenu__command contextMenu__command--danger contextMenu__command--important"
                  onClick={command(props.onMarkBand, props.onClose)}
                  type="button"
               >
                  <Trash2 aria-hidden="true" />
                  <span>Mark whole band</span>
               </button>
               <button
                  className="contextMenu__command contextMenu__command--success contextMenu__command--important"
                  onClick={command(props.onMarkBandSeen, props.onClose)}
                  type="button"
               >
                  <Check aria-hidden="true" />
                  <span>Mark all seen</span>
               </button>
               <div className="contextMenu__divider" />
               <button className="contextMenu__command contextMenu__command--accent" onClick={command(props.onAutoSelectBand, props.onClose)} type="button">
                  <Sparkles aria-hidden="true" />
                  <span>Autoselect all</span>
                  <kbd>V</kbd>
               </button>
               <button className="contextMenu__command" onClick={command(props.onClearBand, props.onClose)} type="button">
                  <Eraser aria-hidden="true" />
                  <span>Clear choices</span>
               </button>
            </>
         )}
      </div>
   );
};
