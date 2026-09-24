import { useEffect, useState } from "react";
import type { ImageItem, ImageSet } from "../../shared/types.js";
import type { CompareState } from "../appTypes.js";

interface CompareControllerOptions {
   currentSet: ImageSet | null;
   onKeep: (image: ImageItem, advance: boolean) => void;
}

/** Owns two-image comparison: picking a second image, adjacent compare, and the keep action. */
export const useCompareController = ({ currentSet, onKeep }: CompareControllerOptions) => {
   const [compare, setCompare] = useState<CompareState | null>(null);
   const [comparePick, setComparePick] = useState<ImageItem | null>(null);

   // Escape backs out of the pick; the overlay itself handles its own Esc.
   useEffect(() => {
      if (comparePick === null) return undefined;
      const onKeyDown = (event: KeyboardEvent): void => {
         if (event.key === "Escape" && !event.defaultPrevented) setComparePick(null);
      };
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
   }, [comparePick]);

   const getImageIndex = (image: ImageItem): number => currentSet?.images.findIndex((item) => item.originalPath === image.originalPath) ?? -1;

   const openAdjacentCompare = (image: ImageItem): void => {
      if (currentSet === null || image.sourceStatus !== "available") {
         return;
      }

      const imageIndex = getImageIndex(image);
      const adjacentImage =
         currentSet.images.slice(imageIndex + 1).find((candidate) => candidate.sourceStatus === "available") ??
         currentSet.images
            .slice(0, imageIndex)
            .reverse()
            .find((candidate) => candidate.sourceStatus === "available");
      if (adjacentImage === undefined) {
         return;
      }

      setCompare({ left: image, right: adjacentImage, leftIndex: imageIndex, rightIndex: getImageIndex(adjacentImage), reveal: 0.5 });
      setComparePick(null);
   };

   const beginCompare = (image: ImageItem): void => {
      if (currentSet === null || image.sourceStatus !== "available") {
         return;
      }

      if (comparePick === null) {
         setComparePick(image);
         return;
      }

      if (comparePick.originalPath !== image.originalPath) {
         setCompare({ left: comparePick, right: image, leftIndex: getImageIndex(comparePick), rightIndex: getImageIndex(image), reveal: 0.5 });
         setComparePick(null);
      }
   };

   const closeCompare = (): void => {
      setCompare(null);
      setComparePick(null);
   };

   const keepCompareImage = (image: ImageItem, advance: boolean): void => {
      onKeep(image, advance);
      setCompare(null);
   };

   return { beginCompare, closeCompare, compare, comparePick, keepCompareImage, openAdjacentCompare };
};
