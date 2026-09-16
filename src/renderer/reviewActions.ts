import type { Decisions, ImageItem, ImageSet, ImageSetDecision } from "../shared/types.js";
import {
   areDecisionsEqual,
   getDecision,
   getDeletedImagePaths,
   getImageSetDecision,
   getLargestImage,
   getSimilarityLabel,
   setImageSetDecision,
} from "./reviewModel.js";

interface ReviewActionOptions {
   currentIndex: number;
   decisions: Decisions;
   groups: ImageSet[];
   goTo: (index: number) => void;
   updateDecisions: (updater: (current: Decisions) => Decisions) => void;
}

const availableImagesDecision = (imageSet: ImageSet, source: Decisions, markForRemoval: boolean): ImageSetDecision => {
   const deletedPaths = getDeletedImagePaths(getDecision(source, imageSet.id));
   for (const image of imageSet.images) {
      if (image.sourceStatus !== "available") continue;
      if (markForRemoval) deletedPaths.add(image.originalPath);
      else deletedPaths.delete(image.originalPath);
   }
   return getImageSetDecision(imageSet, deletedPaths, true);
};

const clearedDecision = (imageSet: ImageSet, source: Decisions): ImageSetDecision => {
   const deletedPaths = getDeletedImagePaths(getDecision(source, imageSet.id));
   for (const image of imageSet.images) {
      if (image.sourceStatus === "available") deletedPaths.delete(image.originalPath);
   }
   return getImageSetDecision(imageSet, deletedPaths, false);
};

const autoSelectedDecision = (imageSet: ImageSet, source: Decisions): ImageSetDecision => {
   const availableImages = imageSet.images.filter((image) => image.sourceStatus === "available");
   if (availableImages.length === 0) return availableImagesDecision(imageSet, source, false);
   const pick = getLargestImage({ ...imageSet, images: availableImages });
   const deletedPaths = getDeletedImagePaths(getDecision(source, imageSet.id));
   for (const image of availableImages) {
      if (image.originalPath === pick.originalPath) deletedPaths.delete(image.originalPath);
      else deletedPaths.add(image.originalPath);
   }
   return getImageSetDecision(imageSet, deletedPaths, true);
};

const seenDecision = (imageSet: ImageSet, source: Decisions): ImageSetDecision =>
   getImageSetDecision(imageSet, getDeletedImagePaths(getDecision(source, imageSet.id)), true);

const getBandSets = (groups: ImageSet[], baseSet: ImageSet): ImageSet[] => {
   const similarity = getSimilarityLabel(baseSet.similarity);
   return groups.filter((imageSet) => getSimilarityLabel(imageSet.similarity) === similarity);
};

/** How many sets share the band of the given set. */
export const countBandSets = (groups: ImageSet[], baseSet: ImageSet): number => getBandSets(groups, baseSet).length;

/**
 * How many sets in the band hold choices that band-autoselect would overwrite,
 * so callers can confirm before re-picking them. Sets whose marks already match
 * the autoselect pick do not count.
 */
export const countBandAutoselectOverrides = (groups: ImageSet[], decisions: Decisions, baseSet: ImageSet): number =>
   getBandSets(groups, baseSet).filter((imageSet) => {
      const current = getDecision(decisions, imageSet.id);
      if (current.deletedImages.length === 0) return false;
      return !areDecisionsEqual(current, autoSelectedDecision(imageSet, decisions));
   }).length;

/** How many sets hold choices that marking the whole band would change. */
export const countBandMarkOverrides = (groups: ImageSet[], decisions: Decisions, baseSet: ImageSet): number =>
   getBandSets(groups, baseSet).filter((imageSet) => {
      const markedCount = getDeletedImagePaths(getDecision(decisions, imageSet.id)).size;
      const availableCount = imageSet.images.filter((image) => image.sourceStatus === "available").length;
      return markedCount > 0 && markedCount < availableCount;
   }).length;

export const createReviewActions = ({ currentIndex, decisions, groups, goTo, updateDecisions }: ReviewActionOptions) => {
   const decide = (imageSet: ImageSet, decision: ImageSetDecision): void => {
      updateDecisions((existing) => setImageSetDecision(existing, imageSet.id, decision));
   };

   const advanceFromImageSet = (imageSet: ImageSet): void => {
      const index = groups.findIndex((item) => item.id === imageSet.id);
      window.requestAnimationFrame(() => goTo((index === -1 ? currentIndex : index) + 1));
   };

   const updateDeletedPaths = (imageSet: ImageSet, getNext: (existing: Set<string>) => Set<string>, advance: boolean): void => {
      decide(imageSet, getImageSetDecision(imageSet, getNext(getDeletedImagePaths(getDecision(decisions, imageSet.id))), true));
      if (advance) advanceFromImageSet(imageSet);
   };

   const toggleImageRemoval = (imageSet: ImageSet, image: ImageItem, advance: boolean): void => {
      if (image.sourceStatus !== "available") return;
      updateDeletedPaths(
         imageSet,
         (existing) => {
            const next = new Set(existing);
            if (next.has(image.originalPath)) next.delete(image.originalPath);
            else next.add(image.originalPath);
            return next;
         },
         advance
      );
   };

   const toggleOnlyImageKept = (imageSet: ImageSet, image: ImageItem, advance: boolean): void => {
      if (image.sourceStatus !== "available") return;
      updateDeletedPaths(
         imageSet,
         (existing) => {
            const available = imageSet.images.filter((item) => item.sourceStatus === "available");
            const others = available.filter((item) => item.originalPath !== image.originalPath);
            const onlyThisIsKept = !existing.has(image.originalPath) && others.every((item) => existing.has(item.originalPath));
            const next = new Set(existing);
            for (const item of available) {
               if (onlyThisIsKept || item.originalPath === image.originalPath) next.delete(item.originalPath);
               else next.add(item.originalPath);
            }
            return next;
         },
         advance
      );
   };

   const updateSimilarityBand = (baseSet: ImageSet, getNext: (imageSet: ImageSet, source: Decisions) => ImageSetDecision): void => {
      const similarity = getSimilarityLabel(baseSet.similarity);
      updateDecisions((existing) =>
         groups.reduce(
            (next, imageSet) =>
               getSimilarityLabel(imageSet.similarity) === similarity ? setImageSetDecision(next, imageSet.id, getNext(imageSet, next)) : next,
            existing
         )
      );
   };

   const autoSelectBand = (baseSet: ImageSet): void => {
      const similarity = getSimilarityLabel(baseSet.similarity);
      const indexes = groups.flatMap((imageSet, index) => (getSimilarityLabel(imageSet.similarity) === similarity ? [index] : []));
      updateSimilarityBand(baseSet, autoSelectedDecision);
      const lastIndex = indexes.at(-1) ?? currentIndex;
      if (lastIndex >= currentIndex && lastIndex + 1 < groups.length) window.setTimeout(() => goTo(lastIndex + 1), 80);
   };

   return {
      autoSelectImageSet: (imageSet: ImageSet): void => decide(imageSet, autoSelectedDecision(imageSet, decisions)),
      autoSelectBand,
      clearAllChoices: (): void =>
         updateDecisions((existing) => groups.reduce((next, imageSet) => setImageSetDecision(next, imageSet.id, clearedDecision(imageSet, next)), existing)),
      clearImageSetChoices: (imageSet: ImageSet): void =>
         updateDecisions((existing) => setImageSetDecision(existing, imageSet.id, clearedDecision(imageSet, existing))),
      clearSimilarityBandChoices: (imageSet: ImageSet): void => updateSimilarityBand(imageSet, clearedDecision),
      markImageSet: (imageSet: ImageSet): void => decide(imageSet, availableImagesDecision(imageSet, decisions, true)),
      markSimilarityBand: (imageSet: ImageSet): void => updateSimilarityBand(imageSet, (set, source) => availableImagesDecision(set, source, true)),
      markSimilarityBandSeen: (imageSet: ImageSet): void => updateSimilarityBand(imageSet, seenDecision),
      toggleImageRemoval,
      toggleOnlyImageKept,
   };
};
