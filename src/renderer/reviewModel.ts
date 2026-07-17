import type { DragEvent } from "react";
import type { Decisions, ImageItem, ImageSet, ImageSetDecision, PatchPreview } from "../shared/types.js";
import type {
   ConfirmAction,
   ConfirmKind,
   ContextMenuKind,
   FileWorkflowState,
   ImageDeleteState,
   ImageSetState,
   MovePreview,
   SimilarityBand,
   TooltipState,
} from "./appTypes.js";

export const emptyImageSetDecision = (): ImageSetDecision => ({ deletedImages: [], completed: false });

export const getDecision = (decisions: Decisions, groupId: string): ImageSetDecision => decisions[groupId] ?? emptyImageSetDecision();

const normalizeDecisionForSave = (decision: ImageSetDecision): ImageSetDecision | null => {
   const deletedImages = [...new Set(decision.deletedImages.filter((path) => path.length > 0))];
   if (!decision.completed && deletedImages.length === 0) {
      return null;
   }

   return { deletedImages, completed: decision.completed };
};

const areDecisionsEqual = (left: ImageSetDecision, right: ImageSetDecision): boolean =>
   left.completed === right.completed &&
   left.deletedImages.length === right.deletedImages.length &&
   left.deletedImages.every((path, index) => path === right.deletedImages[index]);

export const setImageSetDecision = (decisions: Decisions, imageSetId: string, decision: ImageSetDecision): Decisions => {
   const normalized = normalizeDecisionForSave(decision);
   if (normalized === null) {
      if (decisions[imageSetId] === undefined) {
         return decisions;
      }

      return Object.fromEntries(Object.entries(decisions).filter(([existingImageSetId]) => existingImageSetId !== imageSetId));
   }

   if (decisions[imageSetId] !== undefined && areDecisionsEqual(decisions[imageSetId], normalized)) {
      return decisions;
   }

   return { ...decisions, [imageSetId]: normalized };
};

export const getDeletedImagePaths = (decision: ImageSetDecision): Set<string> => new Set(decision.deletedImages);

const getDeletedImagesForSet = (imageSet: ImageSet, decision: ImageSetDecision): Set<string> => {
   const imagePaths = new Set(imageSet.images.map((image) => image.originalPath));
   return new Set(decision.deletedImages.filter((path) => imagePaths.has(path)));
};

export const getImageSetDecision = (imageSet: ImageSet, deletedPaths: Set<string>, completed = true): ImageSetDecision => {
   const imagePaths = imageSet.images.map((image) => image.originalPath);
   const deleted = imagePaths.filter((path) => deletedPaths.has(path));
   return { deletedImages: deleted, completed };
};

const isImageSetCompleted = (decision: ImageSetDecision | undefined): boolean => decision?.completed === true;

export const getPatchPreview = (imageSets: ImageSet[], decisions: Decisions): PatchPreview => {
   let totalDeletes = 0;
   let totalKeptImages = 0;
   let completedImageSets = 0;
   let deleteBytes = 0;

   for (const imageSet of imageSets) {
      const decision = decisions[imageSet.id];
      if (decision === undefined || !isImageSetCompleted(decision)) {
         totalKeptImages += imageSet.images.length;
         continue;
      }

      completedImageSets += 1;

      const deletedPaths = getDeletedImagesForSet(imageSet, decision);
      totalKeptImages += Math.max(0, imageSet.images.length - deletedPaths.size);

      for (const image of imageSet.images) {
         if (deletedPaths.has(image.originalPath)) {
            totalDeletes += 1;
            deleteBytes += image.size;
         }
      }
   }

   return { totalDeletes, totalKeptImages, completedImageSets, deleteBytes };
};

const getMovePreviewByStatus = (imageSets: ImageSet[], decisions: Decisions, sourceStatus: ImageItem["sourceStatus"]): MovePreview[] => {
   const rows: MovePreview[] = [];
   for (const imageSet of imageSets) {
      const decision = decisions[imageSet.id];
      if (sourceStatus === "available" && (decision === undefined || !isImageSetCompleted(decision))) {
         continue;
      }

      const deletedPaths = sourceStatus === "available" && decision !== undefined ? getDeletedImagesForSet(imageSet, decision) : null;
      for (const image of imageSet.images) {
         if (image.sourceStatus === sourceStatus && (deletedPaths === null || deletedPaths.has(image.originalPath))) {
            rows.push({ groupId: imageSet.id, file: image.file, previewUrl: image.previewUrl, size: image.size });
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
   if (decision?.completed !== true) {
      return "open";
   }

   const deletedCount = getDeletedImagesForSet(imageSet, decision).size;
   if (deletedCount === imageSet.images.length) {
      return "allDeleted";
   }

   return deletedCount > 0 ? "someDeleted" : "saved";
};

export const getImageSetLabel = (imageSet: ImageSet, decision: ImageSetDecision): string => {
   const keptCount = Math.max(0, imageSet.images.length - getDeletedImagesForSet(imageSet, decision).size);
   return `${keptCount}/${imageSet.images.length}`;
};

export const getImageDeleteState = (decision: ImageSetDecision, image: ImageItem): ImageDeleteState =>
   getDeletedImagePaths(decision).has(image.originalPath) ? "deleted" : "active";

export const getDetectionNumber = (groupId: string): string => groupId.replace(/^detection_0*/u, "#");

export const getSimilarityLabel = (similarity: number): string => similarity.toFixed(1);

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

      bands.push({ label, groups: [{ imageSet, index }] });
   });

   return bands;
};

export const getResumeIndex = (groups: ImageSet[], currentGroupId: string | null): number => {
   if (groups.length === 0 || currentGroupId === null) return 0;
   const savedIndex = groups.findIndex((imageSet) => imageSet.id === currentGroupId);
   return savedIndex < 0 ? 0 : savedIndex;
};

const hasLetters = (value: string): boolean => /[a-z]/iu.test(value);

const getAutoPickScore = (image: ImageItem): number => {
   const basename = image.file.replace(/\.[^.]+$/u, "");
   const lowerName = basename.toLowerCase();
   let score = 0;

   if (basename.length > 8 && basename.length < 32) {
      score += 70;
   } else {
      score -= Math.abs(20 - basename.length);
   }

   if (hasLetters(basename)) {
      score += 30;
   } else {
      score -= 80;
   }

   if (lowerName.includes("anonymous") || lowerName.includes("artist_request")) {
      score -= 120;
   }

   score -= (basename.match(/[_-]/gu)?.length ?? 0) * 2;
   score += Math.min(24, image.width / 120);
   score += Math.min(24, image.height / 120);

   return score;
};

export const getAutoPick = (imageSet: ImageSet): ImageItem => {
   const sortedImages = [...imageSet.images].sort((a, b) => getAutoPickScore(b) - getAutoPickScore(a) || a.file.localeCompare(b.file));
   const firstImage = sortedImages[0];
   if (firstImage === undefined) {
      throw new Error(`Image set ${imageSet.id} has no images to auto-pick`);
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

export const getFolderName = (folderPath: string | null): string => (folderPath === null ? "No folder" : (folderPath.split(/[\\/]/u).at(-1) ?? folderPath));

export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export const getContextMenuSize = (kind: ContextMenuKind): { width: number; height: number } => {
   if (kind === "image") {
      return { width: 430, height: 358 };
   }

   return { width: 430, height: 280 };
};

export const getAnchoredPosition = (x: number, y: number, width: number, height: number): { x: number; y: number } => {
   const margin = 12;
   const preferredX = x + width + margin > window.innerWidth ? x - width : x;
   const preferredY = y + height + margin > window.innerHeight ? y - height : y;
   return {
      x: clamp(preferredX, margin, Math.max(margin, window.innerWidth - width - margin)),
      y: clamp(preferredY, margin, Math.max(margin, window.innerHeight - height - margin)),
   };
};

export const getButtonMenuPosition = (rect: DOMRect, width: number, height: number): { x: number; y: number } => {
   const margin = 12;
   const gap = 8;
   const preferredX = rect.left + width + margin > window.innerWidth ? rect.right - width : rect.left;
   const preferredY = rect.bottom + gap + height + margin > window.innerHeight ? rect.top - height - gap : rect.bottom + gap;
   return {
      x: clamp(preferredX, margin, Math.max(margin, window.innerWidth - width - margin)),
      y: clamp(preferredY, margin, Math.max(margin, window.innerHeight - height - margin)),
   };
};

export const getTooltipPosition = (rect: DOMRect): Pick<TooltipState, "x" | "y" | "placement"> => {
   const margin = 18;
   const tooltipWidth = Math.min(260, window.innerWidth - margin * 2);
   const tooltipHeight = 132;
   const x = clamp(rect.left + rect.width / 2 - tooltipWidth / 2, margin, window.innerWidth - margin - tooltipWidth);
   const canFitAbove = rect.top - tooltipHeight - 10 >= margin;
   const canFitBelow = rect.bottom + tooltipHeight + 10 <= window.innerHeight - margin;
   if (!canFitAbove && canFitBelow) {
      return { x, y: rect.bottom + 10, placement: "bottom" };
   }

   return { x, y: clamp(rect.top - 10, margin + tooltipHeight, window.innerHeight - margin), placement: "top" };
};

export const getDroppedFolderPath = (event: DragEvent): string | null => {
   const firstFile = event.dataTransfer.files.item(0);
   return firstFile === null ? null : ((firstFile as { path?: string }).path ?? null);
};

export const createConfirmAction = (kind: ConfirmKind): ConfirmAction => {
   if (kind === "deleteAll") {
      return {
         kind,
         title: "Mark this set for deletion?",
         body: "Every image in the current set will be marked for deletion. You can undo it before finishing.",
         confirmLabel: "Mark all",
      };
   }

   if (kind === "trashDuplicate") {
      return {
         kind,
         title: "Recycle moved images?",
         body: "The app-managed duplicate folder will be moved to the Recycle Bin. This can no longer be undone from this app.",
         confirmLabel: "Recycle folder",
      };
   }

   if (kind === "rescan") {
      return {
         kind,
         title: "Rescan this folder?",
         body: "The scan results and all review choices will be replaced. Images already moved must be restored or recycled first.",
         confirmLabel: "Rescan",
      };
   }

   return {
      kind,
      title: "Reset every choice?",
      body: "All review choices for this scan will be cleared. Source files stay untouched.",
      confirmLabel: "Clear all",
   };
};
