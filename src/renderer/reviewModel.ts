import type { Decisions, ImageItem, ImageSet, ImageSetDecision } from "../shared/types.js";
import type { ConfirmAction, ConfirmKind, FileWorkflowState, ImageDeleteState, ImageSetState, MovePreview, SimilarityBand } from "./appTypes.js";

export const emptyImageSetDecision = (): ImageSetDecision => ({ deletedImages: [], seen: false });

export const getDecision = (decisions: Decisions, setId: string): ImageSetDecision => decisions[setId] ?? emptyImageSetDecision();

const normalizeDecisionForSave = (decision: ImageSetDecision): ImageSetDecision | null => {
   const deletedImages = [...new Set(decision.deletedImages.filter((path) => path.length > 0))];
   if (!decision.seen && deletedImages.length === 0) {
      return null;
   }

   return { deletedImages, seen: decision.seen };
};

const areDecisionsEqual = (left: ImageSetDecision, right: ImageSetDecision): boolean =>
   left.seen === right.seen &&
   left.deletedImages.length === right.deletedImages.length &&
   left.deletedImages.every((path, index) => path === right.deletedImages[index]);

export const setImageSetDecision = (decisions: Decisions, setId: string, decision: ImageSetDecision): Decisions => {
   const normalized = normalizeDecisionForSave(decision);
   if (normalized === null) {
      if (decisions[setId] === undefined) {
         return decisions;
      }

      return Object.fromEntries(Object.entries(decisions).filter(([existingSetId]) => existingSetId !== setId));
   }

   if (decisions[setId] !== undefined && areDecisionsEqual(decisions[setId], normalized)) {
      return decisions;
   }

   return { ...decisions, [setId]: normalized };
};

export const getDeletedImagePaths = (decision: ImageSetDecision): Set<string> => new Set(decision.deletedImages);

const getDeletedImagesForSet = (imageSet: ImageSet, decision: ImageSetDecision): Set<string> => {
   const imagePaths = new Set(imageSet.images.map((image) => image.originalPath));
   return new Set(decision.deletedImages.filter((path) => imagePaths.has(path)));
};

export const getImageSetDecision = (imageSet: ImageSet, deletedPaths: Set<string>, seen = true): ImageSetDecision => {
   const imagePaths = imageSet.images.map((image) => image.originalPath);
   const deleted = imagePaths.filter((path) => deletedPaths.has(path));
   return { deletedImages: deleted, seen };
};

const isImageSetSeen = (decision: ImageSetDecision | undefined): boolean => decision?.seen === true;

export const getReviewedSetCount = (imageSets: ImageSet[], decisions: Decisions): number =>
   imageSets.filter((imageSet) => isImageSetSeen(decisions[imageSet.id])).length;

const getMovePreviewByStatus = (imageSets: ImageSet[], decisions: Decisions, sourceStatus: ImageItem["sourceStatus"]): MovePreview[] => {
   const rows: MovePreview[] = [];
   for (const imageSet of imageSets) {
      const decision = decisions[imageSet.id];
      if (sourceStatus === "available" && (decision === undefined || !isImageSetSeen(decision))) {
         continue;
      }

      const deletedPaths = sourceStatus === "available" && decision !== undefined ? getDeletedImagesForSet(imageSet, decision) : null;
      for (const image of imageSet.images) {
         if (image.sourceStatus === sourceStatus && (deletedPaths === null || deletedPaths.has(image.originalPath))) {
            rows.push({ setId: imageSet.id, file: image.file, originalPath: image.originalPath, previewUrl: image.previewUrl, size: image.size });
         }
      }
   }
   return rows;
};

export const getMovePreview = (imageSets: ImageSet[], decisions: Decisions): MovePreview[] => getMovePreviewByStatus(imageSets, decisions, "available");

export const getDuplicatePreview = (imageSets: ImageSet[], decisions: Decisions): MovePreview[] => getMovePreviewByStatus(imageSets, decisions, "movedByApp");

export const getFileWorkflowState = (imageSets: ImageSet[], decisions: Decisions): FileWorkflowState => {
   const state: FileWorkflowState = { markedCount: 0, readyToMoveCount: 0, movedCount: 0, recycledCount: 0, missingCount: 0 };
   for (const imageSet of imageSets) {
      const markedPaths = getDeletedImagesForSet(imageSet, getDecision(decisions, imageSet.id));
      for (const image of imageSet.images) {
         if (image.sourceStatus === "movedByApp") {
            state.markedCount += 1;
            state.movedCount += 1;
            continue;
         }
         if (image.sourceStatus === "recycledByApp") {
            state.markedCount += 1;
            state.recycledCount += 1;
            continue;
         }
         if (!markedPaths.has(image.originalPath)) {
            continue;
         }

         state.markedCount += 1;
         if (image.sourceStatus === "available") {
            state.readyToMoveCount += 1;
         } else {
            state.missingCount += 1;
         }
      }
   }
   return state;
};

export const getImageSetState = (imageSet: ImageSet, decision: ImageSetDecision | undefined): ImageSetState => {
   if (decision?.seen !== true) {
      return "open";
   }

   const deletedCount = getDeletedImagesForSet(imageSet, decision).size;
   if (deletedCount === imageSet.images.length) {
      return "allDeleted";
   }

   return deletedCount > 0 ? "someDeleted" : "seen";
};

export const getImageSetLabel = (imageSet: ImageSet, decision: ImageSetDecision): string => {
   const keptCount = Math.max(0, imageSet.images.length - getDeletedImagesForSet(imageSet, decision).size);
   return `${keptCount}/${imageSet.images.length}`;
};

export const getImageDeleteState = (decision: ImageSetDecision, image: ImageItem): ImageDeleteState =>
   getDeletedImagePaths(decision).has(image.originalPath) ? "deleted" : "active";

export const getSetNumber = (setId: string): string => setId.replace(/^(?:detection|set)_0*/u, "#");

export const getSimilarityLabel = (similarity: number): string => similarity.toFixed(1);

/**
 * Band color by average pixel difference: violet for near-identical sets,
 * warming through mauve and amber into green at the match limit.
 */
const similarityColorStops = [
   { distance: 0, color: [174, 140, 255] },
   { distance: 3.25, color: [205, 132, 218] },
   { distance: 6.5, color: [232, 142, 158] },
   { distance: 9.75, color: [228, 184, 112] },
   { distance: 13, color: [146, 233, 166] },
] as const;

export const getSimilarityColor = (similarity: number): string => {
   const distance = clamp(similarity, similarityColorStops[0].distance, similarityColorStops.at(-1)?.distance ?? similarity);
   const upperIndex = similarityColorStops.findIndex((stop) => stop.distance >= distance);
   const upper = similarityColorStops[upperIndex < 0 ? similarityColorStops.length - 1 : upperIndex] ?? similarityColorStops[0];
   const lower = similarityColorStops[Math.max(0, upperIndex - 1)] ?? upper;
   const range = Math.max(upper.distance - lower.distance, 1);
   const progress = (distance - lower.distance) / range;
   const color = lower.color.map((channel, index) => Math.round(channel + ((upper.color[index] ?? channel) - channel) * progress));
   return "rgb(" + String(color[0] ?? 0) + " " + String(color[1] ?? 0) + " " + String(color[2] ?? 0) + ")";
};

export const getSimilarityBands = (groups: ImageSet[]): SimilarityBand[] => {
   const bands: SimilarityBand[] = [];

   groups.forEach((imageSet, index) => {
      const label = getSimilarityLabel(imageSet.similarity);
      const lastBand = bands.at(-1);
      if (lastBand?.label === label) {
         lastBand.groups.push({ imageSet, index });
         return;
      }

      bands.push({ label, distance: imageSet.similarity, groups: [{ imageSet, index }] });
   });

   return bands;
};

export const getResumeIndex = (groups: ImageSet[], currentSetId: string | null): number => {
   if (groups.length === 0 || currentSetId === null) return 0;
   const savedIndex = groups.findIndex((imageSet) => imageSet.id === currentSetId);
   return savedIndex < 0 ? 0 : savedIndex;
};

/**
 * The auto-keep pick: the largest copy by pixel count, then by file size, then by
 * name for stability. Deliberately ignores filenames beyond tie-breaking so the
 * choice is always explainable as "kept the largest copy".
 */
export const getLargestImage = (imageSet: ImageSet): ImageItem => {
   const sortedImages = [...imageSet.images].sort((a, b) => b.width * b.height - a.width * a.height || b.size - a.size || a.file.localeCompare(b.file));
   const firstImage = sortedImages[0];
   if (firstImage === undefined) {
      throw new Error(`Image set ${imageSet.id} has no images to pick from`);
   }

   return firstImage;
};

export const formatBytes = (bytes: number): string => {
   if (bytes < 1024) {
      return `${bytes} B`;
   }

   const units = ["KB", "MB", "GB", "TB"] as const;
   let value = bytes / 1024;
   let unitIndex = 0;
   while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
   }

   return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex] ?? "TB"}`;
};

export const formatDate = (modifiedAt: number): string =>
   new Date(modifiedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export const getFolderName = (folderPath: string | null): string => (folderPath === null ? "No folder" : (folderPath.split(/[\\/]/u).at(-1) ?? folderPath));

export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export const createConfirmAction = (kind: ConfirmKind, folderPath?: string): ConfirmAction => {
   if (kind === "markSet") {
      return {
         kind,
         title: "Mark this set for removal?",
         body: "Every image in the current set will be marked for removal. You can undo this before anything is moved.",
         confirmLabel: "Mark set",
      };
   }

   if (kind === "trashDuplicate") {
      return {
         kind,
         title: "Recycle the duplicate folder?",
         body: "Everything in the managed duplicate folder moves to the Recycle Bin. This app cannot restore it afterwards.",
         confirmLabel: "Recycle folder",
      };
   }

   if (kind === "rescan") {
      return {
         kind,
         title: "Rescan this folder?",
         body: "Scan results and every review choice will be replaced. Move or recycle the duplicate folder contents first if any exist.",
         confirmLabel: "Rescan",
      };
   }

   if (kind === "switchFolder") {
      return {
         kind,
         title: "Scan a different folder?",
         body: "Opening a new folder replaces the current scan results and all review choices. Source files are never touched.",
         confirmLabel: "Scan folder",
         ...(folderPath === undefined ? {} : { folderPath }),
      };
   }

   return {
      kind,
      title: "Clear every choice?",
      body: "All review choices for this scan will be cleared. Source files stay untouched.",
      confirmLabel: "Clear all",
   };
};
