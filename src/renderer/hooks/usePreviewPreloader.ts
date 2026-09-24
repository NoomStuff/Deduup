import { useEffect } from "react";
import type { ImageItem, ImageSet } from "../../shared/types.js";

/** How many sets ahead of and behind the current one stay warmed. */
const preloadRadius = 10;
const maxConcurrentLoads = 6;
// Once this many URLs are remembered, start over: the HTTP cache and the
// main-process thumbnail cache still hold recent results, so reloading is cheap.
const warmedLimit = 4000;

const isPreviewable = (image: ImageItem): boolean => image.sourceStatus !== "missing" && image.sourceStatus !== "recycledByApp";

const warmedUrls = new Set<string>();
let generationCounter = 0;

/**
 * Warms thumbnail bytes for sets around the current one, nearest first, so
 * navigating (or arriving at a set) never waits on a cold encode. Off-DOM
 * Image() probes share the HTTP cache with the shelf's <img> elements, and the
 * browser dedupes the requests themselves. Bumping the window retires the old
 * one: in-flight probes finish on their own, but nothing new starts for them.
 */
export const usePreviewPreloader = (groups: ImageSet[], currentIndex: number): void => {
   useEffect(() => {
      if (groups.length === 0) return undefined;
      const generation = ++generationCounter;

      const queue: string[] = [];
      const enqueue = (imageSet: ImageSet | undefined): void => {
         if (imageSet === undefined) return;
         for (const image of imageSet.images) {
            if (isPreviewable(image)) queue.push(image.previewUrl);
         }
      };
      enqueue(groups[currentIndex]);
      for (let distance = 1; distance <= preloadRadius; distance += 1) {
         enqueue(groups[currentIndex + distance]);
         enqueue(groups[currentIndex - distance]);
      }

      let cursor = 0;
      let inFlight = 0;
      const pump = (): void => {
         if (generation !== generationCounter) return;
         while (inFlight < maxConcurrentLoads && cursor < queue.length) {
            const url = queue[cursor];
            cursor += 1;
            if (url === undefined || warmedUrls.has(url)) continue;
            if (warmedUrls.size >= warmedLimit) warmedUrls.clear();
            warmedUrls.add(url);
            inFlight += 1;
            const probe = new Image();
            const done = (): void => {
               inFlight -= 1;
               pump();
            };
            probe.onload = done;
            probe.onerror = done;
            probe.src = url;
         }
      };
      pump();
   }, [currentIndex, groups]);
};
