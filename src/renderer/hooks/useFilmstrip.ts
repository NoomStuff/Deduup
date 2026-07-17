import { useCallback, useEffect, useRef, useState } from "react";
import type { PatchView } from "../appTypes.js";

interface FilmstripEdges {
   left: boolean;
   right: boolean;
}

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
   view: PatchView;
}) => {
   const filmstripRef = useRef<HTMLElement | null>(null);
   const targetRef = useRef<number | null>(null);
   const animationRef = useRef<number | null>(null);
   const positionedRef = useRef(false);
   const [edges, setEdges] = useState<FilmstripEdges>({ left: false, right: false });

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

   useEffect(() => {
      positionedRef.current = false;
      targetRef.current = null;
      if (animationRef.current !== null) window.cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
   }, [groupCount]);

   useEffect(() => {
      const filmstrip = filmstripRef.current;
      if (filmstrip === null || view !== "review") return;
      const frame = window.requestAnimationFrame(() => {
         const active = filmstrip.querySelector<HTMLElement>(".filmstrip__item--active");
         if (active === null) return;
         const filmstripRect = filmstrip.getBoundingClientRect();
         const activeRect = active.getBoundingClientRect();
         const activeCenter = activeRect.left - filmstripRect.left + filmstrip.scrollLeft + activeRect.width / 2;
         targetRef.current = Math.max(0, Math.min(filmstrip.scrollWidth - filmstrip.clientWidth, activeCenter - filmstrip.clientWidth / 2));
         if (!positionedRef.current) {
            filmstrip.scrollLeft = targetRef.current;
            positionedRef.current = true;
         } else {
            animate();
         }
      });
      return () => window.cancelAnimationFrame(frame);
   }, [animate, currentIndex, groupCount, isScanning, isStartupOpen, loading, view]);

   useEffect(() => {
      const filmstrip = filmstripRef.current;
      if (filmstrip === null || view !== "review") return;
      const update = (): void => {
         const maxScroll = Math.max(0, filmstrip.scrollWidth - filmstrip.clientWidth);
         const next = { left: filmstrip.scrollLeft > 2, right: filmstrip.scrollLeft < maxScroll - 2 };
         setEdges((current) => (current.left === next.left && current.right === next.right ? current : next));
      };
      const frame = window.requestAnimationFrame(update);
      filmstrip.addEventListener("scroll", update, { passive: true });
      window.addEventListener("resize", update);
      return () => {
         window.cancelAnimationFrame(frame);
         filmstrip.removeEventListener("scroll", update);
         window.removeEventListener("resize", update);
      };
   }, [groupCount, isScanning, isStartupOpen, loading, view]);

   useEffect(
      () => () => {
         if (animationRef.current !== null) window.cancelAnimationFrame(animationRef.current);
      },
      []
   );

   return { edges, filmstripRef };
};
