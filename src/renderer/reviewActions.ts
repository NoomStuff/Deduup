import type { Decisions, ImageItem, ImageSet, ImageSetDecision } from "../shared/types.js";
import {
   getDecision,
   getDeletedImagePaths,
   getImageSetDecision,
   getLargestImage,
   getSimilarityLabel,
   setImageSetDecision,
   setImageSetDecisions,
} from "./reviewModel.js";

interface ReviewActionOptions {
   currentIndex: number;
   groups: ImageSet[];
   goTo: (index: number) => void;
   updateDecisions: (updater: (current: Decisions) => Decisions) => void;
}

const availableImagesDecision = (imageSet: ImageSet, source: Decisions, discard: boolean): ImageSetDecision => {
   const deletedPaths = getDeletedImagePaths(getDecision(source, imageSet.id));
   for (const image of imageSet.images) {
      if (image.sourceStatus !== "available") continue;
      if (discard) deletedPaths.add(image.originalPath);
      else deletedPaths.delete(image.originalPath);
   }
   return getImageSetDecision(imageSet, deletedPaths);
};

const clearedDecision = (imageSet: ImageSet, source: Decisions): ImageSetDecision => {
   const deletedPaths = getDeletedImagePaths(getDecision(source, imageSet.id));
   for (const image of imageSet.images) {
      if (image.sourceStatus === "available") deletedPaths.delete(image.originalPath);
   }
   return getImageSetDecision(imageSet, deletedPaths);
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
   return getImageSetDecision(imageSet, deletedPaths);
};

const getBandSets = (groups: ImageSet[], baseSet: ImageSet): ImageSet[] => {
   const similarity = getSimilarityLabel(baseSet.similarity);
   return groups.filter((imageSet) => getSimilarityLabel(imageSet.similarity) === similarity);
};

/** How many sets share the band of the given set. */
export const countBandSets = (groups: ImageSet[], baseSet: ImageSet): number => getBandSets(groups, baseSet).length;

/**
 * How many sets in the band hold choices that band-autoselect would overwrite,
 * so callers can confirm before re-picking them. Sets whose discards already match
 * the autoselect pick do not count.
 */

export const countBandDiscardOverrides = (groups: ImageSet[], decisions: Decisions, baseSet: ImageSet): number =>
   getBandSets(groups, baseSet).filter((imageSet) => {
      const discardedCount = getDeletedImagePaths(getDecision(decisions, imageSet.id)).size;
      const availableCount = imageSet.images.filter((image) => image.sourceStatus === "available").length;
      return decisions[imageSet.id] !== undefined && discardedCount < availableCount;
   }).length;

export const createReviewActions = ({ currentIndex, groups, goTo, updateDecisions }: ReviewActionOptions) => {
   const decide = (imageSet: ImageSet, transform: (set: ImageSet, source: Decisions) => ImageSetDecision): void => {
      updateDecisions((existing) => setImageSetDecision(existing, imageSet.id, transform(imageSet, existing)));
   };

   const advanceFromImageSet = (imageSet: ImageSet): void => {
      const index = groups.findIndex((item) => item.id === imageSet.id);
      window.requestAnimationFrame(() => goTo((index === -1 ? currentIndex : index) + 1));
   };

   const updateDeletedPaths = (imageSet: ImageSet, getNext: (existing: Set<string>) => Set<string>, advance: boolean): void => {
      updateDecisions((existing) =>
         setImageSetDecision(existing, imageSet.id, getImageSetDecision(imageSet, getNext(getDeletedImagePaths(getDecision(existing, imageSet.id)))))
      );
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

   const updateSimilarityBand = (
      baseSet: ImageSet,
      getNext: (imageSet: ImageSet, source: Decisions) => ImageSetDecision,
      eligible: (imageSet: ImageSet, source: Decisions) => boolean = () => true
   ): void => {
      const similarity = getSimilarityLabel(baseSet.similarity);
      updateDecisions((existing) =>
         setImageSetDecisions(
            existing,
            groups
               .filter((imageSet) => getSimilarityLabel(imageSet.similarity) === similarity)
               .filter((imageSet) => eligible(imageSet, existing))
               .map((imageSet) => [imageSet.id, getNext(imageSet, existing)] as const)
         )
      );
   };

   const autoSelectBand = (baseSet: ImageSet): void => {
      const similarity = getSimilarityLabel(baseSet.similarity);
      const indexes = groups.flatMap((imageSet, index) => (getSimilarityLabel(imageSet.similarity) === similarity ? [index] : []));
      updateSimilarityBand(baseSet, autoSelectedDecision, (set, source) => source[set.id] === undefined);
      const lastIndex = indexes.at(-1) ?? currentIndex;
      if (lastIndex >= currentIndex && lastIndex + 1 < groups.length) window.setTimeout(() => goTo(lastIndex + 1), 80);
   };

   return {
      autoSelectImageSet: (imageSet: ImageSet): void => decide(imageSet, autoSelectedDecision),
      autoSelectBand,
      clearAllChoices: (): void =>
         updateDecisions((existing) =>
            setImageSetDecisions(
               existing,
               groups.filter((imageSet) => existing[imageSet.id] !== undefined).map((imageSet) => [imageSet.id, clearedDecision(imageSet, existing)] as const)
            )
         ),
      clearImageSetChoices: (imageSet: ImageSet): void =>
         updateDecisions((existing) => setImageSetDecision(existing, imageSet.id, clearedDecision(imageSet, existing))),
      clearSimilarityBandChoices: (imageSet: ImageSet): void => updateSimilarityBand(imageSet, clearedDecision, (set, source) => source[set.id] !== undefined),
      discardSet: (imageSet: ImageSet): void => decide(imageSet, (set, source) => availableImagesDecision(set, source, true)),
      discardBand: (imageSet: ImageSet): void => updateSimilarityBand(imageSet, (set, source) => availableImagesDecision(set, source, true)),
      toggleImageRemoval,
      toggleOnlyImageKept,
      keepComparedImage: (imageSet: ImageSet, keep: ImageItem, other: ImageItem, advance: boolean): void => {
         if (keep.sourceStatus !== "available" || other.sourceStatus !== "available" || keep.originalPath === other.originalPath) return;
         const members = new Set(imageSet.images.map((image) => image.originalPath));
         if (!members.has(keep.originalPath) || !members.has(other.originalPath)) return;
         updateDeletedPaths(
            imageSet,
            (existing) => {
               const next = new Set(existing);
               next.delete(keep.originalPath);
               next.add(other.originalPath);
               return next;
            },
            advance
         );
      },
   };
};
