import { X } from "lucide-react";
import "./ReviewHintBar.css";

/**
 * One-time primer for the review screen. It disappears on the first mark or a
 * manual dismiss, and never comes back (persisted in localStorage).
 */
export const ReviewHintBar = ({ onDismiss }: { onDismiss: () => void }) => (
   <section aria-label="How marking works" className="reviewHints">
      <p>
         Press <kbd>1</kbd>–<kbd>9</kbd> to mark a copy for removal, <kbd>X</kbd> marks the whole set, <kbd>←</kbd>/<kbd>→</kbd> move between sets, and{" "}
         <kbd>?</kbd> lists every shortcut. The numbers on the shelf are average pixel difference; lower means more alike.
      </p>
      <button aria-label="Dismiss hint" className="iconButton" onClick={onDismiss} type="button">
         <X aria-hidden="true" />
      </button>
   </section>
);
