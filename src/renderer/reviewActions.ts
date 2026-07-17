import type { Decisions, ImageItem, ImageSet, ImageSetDecision } from "../shared/types.js";
import {
   getAutoPick,
   getDecision,
   getDeletedImagePaths,
   getImageSetDecision,
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

const availableImagesDecision = (imageSet: ImageSet, source: Decisions, markForDeletion: boolean): ImageSetDecision => {
   const deletedPaths = getDeletedImagePaths(getDecision(source, imageSet.id));
   for (const image of imageSet.images) {
      if (image.sourceStatus !== "available") continue;
      if (markForDeletion) deletedPaths.add(image.originalPath);
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
   const pick = getAutoPick({ ...imageSet, images: availableImages });
   const deletedPaths = getDeletedImagePaths(getDecision(source, imageSet.id));
   for (const image of availableImages) {
      if (image.originalPath === pick.originalPath) deletedPaths.delete(image.originalPath);
      else deletedPaths.add(image.originalPath);
   }
   return getImageSetDecision(imageSet, deletedPaths, true);
};

export const createReviewActions = ({ currentIndex, decisions, groups, goTo, updateDecisions }: ReviewActionOptions) => {
   const decide = (imageSet: ImageSet, decision: ImageSetDecision): void => {
      updateDecisions((existing) => setImageSetDecision(existing, imageSet.id, decision));
   };

   const advanceFromImageSet = (imageSet: ImageSet): void => {
      const index = groups.findIndex((item) => item.id === imageSet.id);
      window.requestAnimationFrame(() => goTo((index === -1 ? currentIndex : index) + 1));
   };

   const updateDeletedPaths = (
      imageSet: ImageSet,
      getNext: (existing: Set<string>) => Set<string>,
      advance: boolean
   ): void => {
      decide(imageSet, getImageSetDecision(imageSet, getNext(getDeletedImagePaths(getDecision(decisions, imageSet.id))), true));
      if (advance) advanceFromImageSet(imageSet);
   };

   const toggleImageDeletion = (imageSet: ImageSet, image: ImageItem, advance: boolean): void => {
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

   const updateSimilarityGroup = (
      baseGroup: ImageSet,
      getNext: (imageSet: ImageSet, source: Decisions) => ImageSetDecision
   ): void => {
      const similarity = getSimilarityLabel(baseGroup.similarity);
      updateDecisions((existing) =>
         groups.reduce(
            (next, imageSet) =>
               getSimilarityLabel(imageSet.similarity) === similarity ? setImageSetDecision(next, imageSet.id, getNext(imageSet, next)) : next,
            existing
         )
      );
   };

   const autoCompleteSimilarityGroup = (baseGroup: ImageSet): void => {
      const similarity = getSimilarityLabel(baseGroup.similarity);
      const indexes = groups.flatMap((imageSet, index) => (getSimilarityLabel(imageSet.similarity) === similarity ? [index] : []));
      updateSimilarityGroup(baseGroup, autoSelectedDecision);
      const lastIndex = indexes.at(-1) ?? currentIndex;
      if (lastIndex >= currentIndex && lastIndex + 1 < groups.length) window.setTimeout(() => goTo(lastIndex + 1), 80);
   };

   return {
      advanceFromImageSet,
      autoCompleteImageSet: (imageSet: ImageSet): void => decide(imageSet, autoSelectedDecision(imageSet, decisions)),
      autoCompleteSimilarityGroup,
      clearAllChoices: (): void =>
         updateDecisions((existing) => groups.reduce((next, imageSet) => setImageSetDecision(next, imageSet.id, clearedDecision(imageSet, next)), existing)),
      clearImageSetChoices: (imageSet: ImageSet): void =>
         updateDecisions((existing) => setImageSetDecision(existing, imageSet.id, clearedDecision(imageSet, existing))),
      clearSimilarityGroupChoices: (imageSet: ImageSet): void => updateSimilarityGroup(imageSet, clearedDecision),
      deleteImageSet: (imageSet: ImageSet): void => decide(imageSet, availableImagesDecision(imageSet, decisions, true)),
      deleteSimilarityGroup: (imageSet: ImageSet): void =>
         updateSimilarityGroup(imageSet, (set, source) => availableImagesDecision(set, source, true)),
      markImageSetCompleted: (imageSet: ImageSet): void => decide(imageSet, availableImagesDecision(imageSet, decisions, false)),
      markSimilarityGroupCompleted: (imageSet: ImageSet): void =>
         updateSimilarityGroup(imageSet, (set, source) => availableImagesDecision(set, source, false)),
      toggleImageDeletion,
      toggleOnlyImageKept,
   };
};
