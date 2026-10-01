import type { Decisions, ImageItem, ImageSet, ImageSetDecision } from "../shared/types.js";
import type { ConfirmAction, ConfirmKind, FileWorkflowState, ImageDeleteState, ImageSetState, MovePreview, SimilarityBand } from "./appTypes.js";

export const emptyImageSetDecision = (): ImageSetDecision => ({ deletedImages: [] });

export const getDecision = (decisions: Decisions, setId: string): ImageSetDecision => decisions[setId] ?? emptyImageSetDecision();

const normalizeDecisionForSave = (decision: ImageSetDecision): ImageSetDecision => {
   const deletedImages = [...new Set(decision.deletedImages.filter((path) => path.length > 0))];
   return { deletedImages };
};

const areDecisionsEqual = (left: ImageSetDecision, right: ImageSetDecision): boolean =>
   left.deletedImages.length === right.deletedImages.length && left.deletedImages.every((path, index) => path === right.deletedImages[index]);

export { areDecisionsEqual };

export const setImageSetDecisions = (decisions: Decisions, updates: Iterable<readonly [string, ImageSetDecision]>): Decisions => {
   let next = decisions;
   for (const [setId, decision] of updates) {
      const normalized = normalizeDecisionForSave(decision);
      const previous = next[setId];
      if (previous !== undefined && areDecisionsEqual(previous, normalized)) continue;
      if (next === decisions) next = { ...decisions };
      next[setId] = normalized;
   }
   return next;
};

export const setImageSetDecision = (decisions: Decisions, setId: string, decision: ImageSetDecision): Decisions =>
   setImageSetDecisions(decisions, [[setId, decision]]);

export const getDeletedImagePaths = (decision: ImageSetDecision): Set<string> => new Set(decision.deletedImages);

const getDeletedImagesForSet = (imageSet: ImageSet, decision: ImageSetDecision): Set<string> => {
   const imagePaths = new Set(imageSet.images.map((image) => image.originalPath));
   return new Set(decision.deletedImages.filter((path) => imagePaths.has(path)));
};

export const getImageSetDecision = (imageSet: ImageSet, deletedPaths: Set<string>): ImageSetDecision => {
   const imagePaths = imageSet.images.map((image) => image.originalPath);
   const deleted = imagePaths.filter((path) => deletedPaths.has(path));
   return { deletedImages: deleted };
};

const getMovePreviewByStatus = (imageSets: ImageSet[], decisions: Decisions, sourceStatus: ImageItem["sourceStatus"]): MovePreview[] => {
   const rows: MovePreview[] = [];
   for (const imageSet of imageSets) {
      const decision = decisions[imageSet.id];
      if (sourceStatus === "available" && decision === undefined) {
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
   if (decision === undefined) {
      return "open";
   }

   const deletedCount = getDeletedImagesForSet(imageSet, decision).size;
   if (deletedCount === imageSet.images.length) {
      return "allDeleted";
   }

   return deletedCount > 0 ? "someDeleted" : "open";
};

export const getImageSetLabel = (imageSet: ImageSet, decision: ImageSetDecision): string => {
   const keptCount = Math.max(0, imageSet.images.length - getDeletedImagesForSet(imageSet, decision).size);
   return `${keptCount}/${imageSet.images.length}`;
};

export const getImageDeleteState = (decision: ImageSetDecision, image: ImageItem): ImageDeleteState =>
   getDeletedImagePaths(decision).has(image.originalPath) ? "deleted" : "active";

export const getSetNumber = (setId: string): string => setId.replace(/^set_0*/u, "#");

export const getSimilarityLabel = (similarity: number): string => similarity.toFixed(1);

/**
 * Band color by average pixel difference: terracotta orange for near-identical
 * sets, cooling through amber, olive, and sage into green at the match limit.
 */
const similarityColorStops = [
   { distance: 0, color: [224, 137, 74] },
   { distance: 3.25, color: [217, 168, 88] },
   { distance: 6.5, color: [186, 186, 106] },
   { distance: 9.75, color: [148, 196, 128] },
   { distance: 13, color: [114, 200, 138] },
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

interface ConfirmDetails {
   count?: number;
   destination?: string;
   folderPath?: string;
}

export const createConfirmAction = (kind: ConfirmKind, details: ConfirmDetails = {}): ConfirmAction => {
   const { count = 0, destination = "the managed duplicate folder", folderPath } = details;

   if (kind === "markSet") {
      return {
         kind,
         title: "Mark this set for removal?",
         body: "Every image in the current set will be marked for removal. You can undo this before anything moves.",
         confirmLabel: "Mark set",
      };
   }

   if (kind === "markBand") {
      return {
         kind,
         title: "Mark this band for removal?",
         body: `Every available image in ${count} set${count === 1 ? "" : "s"} will be marked for removal, including sets you already marked. You can undo this before anything moves.`,
         confirmLabel: "Mark band",
      };
   }

   if (kind === "applyMoves") {
      return {
         kind,
         title: `Move ${count} image${count === 1 ? "" : "s"} to the duplicate folder?`,
         body: `Marked images move into ${destination} and stay there, recoverable, until you recycle the folder.`,
         confirmLabel: `Move ${count}`,
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

   if (kind === "switchFolder") {
      return {
         kind,
         title: "Scan a different folder?",
         body: "Opening a new folder replaces the current scan and all marks. Source files are never touched.",
         confirmLabel: "Scan folder",
         ...(folderPath === undefined ? {} : { folderPath }),
      };
   }

   return {
      kind,
      title: "Clear every choice?",
      body: "All marks in this scan will be cleared. Source files stay untouched.",
      confirmLabel: "Clear all",
   };
};
