import { X } from "lucide-react";
import "./ReviewHintBar.css";

/**
 * One-time primer for the review screen. It disappears on the first discard or
 * a manual dismiss, and never comes back (persisted in localStorage).
 */
export const ReviewHintBar = ({ onDismiss }: { onDismiss: () => void }) => (
   <section aria-label="How discarding works" className="reviewHints">
      <p>
         <kbd>1</kbd>–<kbd>9</kbd> discard an image, <kbd>X</kbd> discards the whole set, <kbd>←</kbd>/<kbd>→</kbd> move between sets, <kbd>M</kbd> opens the
         final review, <kbd>?</kbd> shows every shortcut. The numbers under the shelf are pixel difference; lower means more alike.
      </p>
      <button aria-label="Dismiss hint" className="iconButton" onClick={onDismiss} type="button">
         <X aria-hidden="true" />
      </button>
   </section>
);
