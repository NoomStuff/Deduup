import { useCallback, useEffect, useRef, useState } from "react";
import type { AppView } from "../appTypes.js";

const centerTarget = (filmstrip: HTMLElement, active: HTMLElement): number => {
   const stripRect = filmstrip.getBoundingClientRect();
   const activeRect = active.getBoundingClientRect();
   const activeCenter = activeRect.left - stripRect.left + filmstrip.scrollLeft + activeRect.width / 2;
   const maxScroll = Math.max(0, filmstrip.scrollWidth - filmstrip.clientWidth);
   return Math.max(0, Math.min(maxScroll, activeCenter - filmstrip.clientWidth / 2));
};

export const useFilmstrip = ({
   currentIndex,
   groupCount,
   isScanning,
   isStartupOpen,
   loading,
   view,
}: {
   currentIndex: number;
   groupCount: number;
   isScanning: boolean;
   isStartupOpen: boolean;
   loading: boolean;
   view: AppView;
}) => {
   const filmstripRef = useRef<HTMLElement | null>(null);
   const [fade, setFade] = useState({ left: false, right: false });
   const targetRef = useRef<number | null>(null);
   const animationRef = useRef<number | null>(null);
   const positionedRef = useRef(false);

   const animate = useCallback((): void => {
      if (animationRef.current !== null) return;
      const tick = (): void => {
         const filmstrip = filmstripRef.current;
         const target = targetRef.current;
         if (filmstrip === null || target === null) {
            animationRef.current = null;
            return;
         }
         const distance = target - filmstrip.scrollLeft;
         if (Math.abs(distance) < 0.5) {
            filmstrip.scrollLeft = target;
            animationRef.current = null;
            return;
         }
         filmstrip.scrollLeft += distance * 0.22;
         animationRef.current = window.requestAnimationFrame(tick);
      };
      animationRef.current = window.requestAnimationFrame(tick);
   }, []);

   // Fresh scan: the next placement should snap instead of gliding.
   useEffect(() => {
      positionedRef.current = false;
      targetRef.current = null;
      if (animationRef.current !== null) window.cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
   }, [groupCount]);

   useEffect(() => {
      if (view !== "review") {
         positionedRef.current = false;
         return;
      }
      const filmstrip = filmstripRef.current;
      if (filmstrip === null) return;
      const updateFade = (): void => {
         const max = Math.max(0, filmstrip.scrollWidth - filmstrip.clientWidth);
         setFade({ left: filmstrip.scrollLeft > 2, right: filmstrip.scrollLeft < max - 2 });
      };
      updateFade();
      filmstrip.addEventListener("scroll", updateFade, { passive: true });
      const resizeObserver = new ResizeObserver(updateFade);
      resizeObserver.observe(filmstrip);
      // React only to the set changing (or the strip (re)mounting). Manual
      // scrolling is never corrected or fought.
      const frame = window.requestAnimationFrame(() => {
         const active = filmstrip.querySelector<HTMLElement>(".filmstrip__item--active");
         if (active === null) return;
         const target = centerTarget(filmstrip, active);
         if (Math.abs(target - filmstrip.scrollLeft) < 1) return;
         targetRef.current = target;
         if (!positionedRef.current) {
            filmstrip.scrollLeft = target;
            positionedRef.current = true;
         } else {
            animate();
         }
      });
      return () => {
         window.cancelAnimationFrame(frame);
         filmstrip.removeEventListener("scroll", updateFade);
         resizeObserver.disconnect();
      };
   }, [animate, currentIndex, isScanning, isStartupOpen, loading, view]);

   useEffect(
      () => () => {
         if (animationRef.current !== null) window.cancelAnimationFrame(animationRef.current);
      },
      []
   );

   return { fade, filmstripRef };
};
