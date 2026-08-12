import type { MouseEventHandler, RefObject } from "react";
import { Check, Eraser, FolderOpen, Image as ImageIcon, Search, Sparkles, Trash2 } from "lucide-react";
import type { ImageItem } from "../../shared/types.js";
import type { ContextMenuState } from "../appTypes.js";

interface ReviewContextMenuProps {
   context: ContextMenuState;
   image: ImageItem | null;
   imageIsDeleted: boolean;
   onlyImageIsKept: boolean;
   menuRef: RefObject<HTMLDivElement | null>;
   onAutoCompleteImageSet: () => void;
   onAutoCompleteSimilarityGroup: () => void;
   onBeginCompare: () => void;
   onClearImageSet: () => void;
   onClearSimilarityGroup: () => void;
   onClose: () => void;
   onDeleteImageSet: () => void;
   onDeleteSimilarityGroup: () => void;
   onMarkSimilarityGroupSeen: () => void;
   onOpenImage: () => void;
   onShowImage: () => void;
   onToggleImage: () => void;
   onToggleOtherImages: () => void;
}

const command = (run: () => void, close: () => void): MouseEventHandler<HTMLButtonElement> => () => {
   run();
   close();
};

export const ReviewContextMenu = (props: ReviewContextMenuProps) => (
   <div
      aria-label="Actions"
      className="contextMenu"
      onPointerDown={(event) => event.stopPropagation()}
      ref={props.menuRef}
      role="menu"
      style={{ left: props.context.x, top: props.context.y }}
   >
      {props.context.kind === "image" && props.image !== null && (
         <>
            <button
               className="contextMenu__command contextMenu__command--danger contextMenu__command--important"
               disabled={props.image.sourceStatus !== "available"}
               onClick={command(props.onToggleImage, props.onClose)}
               type="button"
            >
               <Trash2 aria-hidden="true" />
               <span>{props.imageIsDeleted ? "Restore image" : "Mark for deletion"}</span>
               <kbd>Shift LMB</kbd>
            </button>
            <button
               className="contextMenu__command contextMenu__command--danger contextMenu__command--important"
               disabled={props.image.sourceStatus !== "available"}
               onClick={command(props.onToggleOtherImages, props.onClose)}
               type="button"
            >
               <Trash2 aria-hidden="true" />
               <span>{props.onlyImageIsKept ? "Restore other images" : "Mark others for deletion"}</span>
               <kbd>Shift RMB</kbd>
            </button>
            <div className="contextMenu__divider" />
            <button
               className="contextMenu__command contextMenu__command--accent"
               disabled={props.image.sourceStatus !== "available"}
               onClick={command(props.onBeginCompare, props.onClose)}
               type="button"
            >
               <Search aria-hidden="true" />
               <span>Compare to...</span>
               <kbd>Alt LMB</kbd>
            </button>
            <div className="contextMenu__divider" />
            <button className="contextMenu__command" onClick={command(props.onShowImage, props.onClose)} type="button">
               <FolderOpen aria-hidden="true" />
               <span>Open in folder</span>
            </button>
            <button className="contextMenu__command" onClick={command(props.onOpenImage, props.onClose)} type="button">
               <ImageIcon aria-hidden="true" />
               <span>Open image</span>
            </button>
         </>
      )}
      {props.context.kind === "imageSet" && (
         <>
            <button
               className="contextMenu__command contextMenu__command--danger contextMenu__command--important"
               onClick={command(props.onDeleteImageSet, props.onClose)}
               type="button"
            >
               <Trash2 aria-hidden="true" />
               <span>Mark whole set for deletion</span>
               <kbd>X</kbd>
            </button>
            <button
               className="contextMenu__command contextMenu__command--accent"
               onClick={command(props.onAutoCompleteImageSet, props.onClose)}
               type="button"
            >
               <Sparkles aria-hidden="true" />
               <span>Autoselect 1 image this set</span>
            </button>
            <button className="contextMenu__command" onClick={command(props.onClearImageSet, props.onClose)} type="button">
               <Eraser aria-hidden="true" />
               <span>Clear choices</span>
            </button>
         </>
      )}
      {props.context.kind === "similarityGroup" && (
         <>
            <button
               className="contextMenu__command contextMenu__command--danger contextMenu__command--important"
               onClick={command(props.onDeleteSimilarityGroup, props.onClose)}
               type="button"
            >
               <Trash2 aria-hidden="true" />
               <span>Mark entire group for deletion</span>
            </button>
            <button
               className="contextMenu__command contextMenu__command--success contextMenu__command--important"
               onClick={command(props.onMarkSimilarityGroupSeen, props.onClose)}
               type="button"
            >
               <Check aria-hidden="true" />
               <span>Mark all sets as seen</span>
            </button>
            <div className="contextMenu__divider" />
            <button
               className="contextMenu__command contextMenu__command--accent"
               onClick={command(props.onAutoCompleteSimilarityGroup, props.onClose)}
               type="button"
            >
               <Sparkles aria-hidden="true" />
               <span>Autoselect 1 image for all sets</span>
               <kbd>V</kbd>
            </button>
            <button className="contextMenu__command" onClick={command(props.onClearSimilarityGroup, props.onClose)} type="button">
               <Eraser aria-hidden="true" />
               <span>Clear choices</span>
            </button>
         </>
      )}
   </div>
);
