/** The part of a scroll container the glide reads and writes. */
export interface GlideStrip {
   scrollLeft: number;
}

/**
 * One frame of the filmstrip recenter glide. Returns false once the glide is
 * over. It always ends: every frame moves at least a whole pixel (smaller
 * steps round away in the browser and would loop forever, pulling the strip
 * back after every manual scroll), it stops when a write no longer moves the
 * strip, and it yields the moment the user scrolls by hand.
 */
export const createGlideTick = (strip: GlideStrip, getTarget: () => number | null): (() => boolean) => {
   let written: number | null = null;
   return () => {
      const target = getTarget();
      if (target === null) return false;
      const current = strip.scrollLeft;
      if (written !== null && Math.abs(current - written) > 1) return false;
      const distance = target - current;
      if (Math.abs(distance) <= 1) {
         strip.scrollLeft = target;
         return false;
      }
      const step = distance * 0.22;
      strip.scrollLeft = current + Math.sign(step) * Math.max(1, Math.abs(step));
      written = strip.scrollLeft;
      return written !== current;
   };
};
