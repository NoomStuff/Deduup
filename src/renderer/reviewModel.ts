import type { Decisions, ImageItem, ImageSet, ImageSetDecision } from "../shared/types.js";
import { getSimilarityLabel, matchDistanceLimit } from "../shared/similarity.js";
import type { ConfirmAction, ConfirmKind, FileWorkflowState, ImageSetState, MovePreview, SimilarityBand } from "./appTypes.js";

export const emptyImageSetDecision = (): ImageSetDecision => ({ deletedImages: [] });

export const getDecision = (decisions: Decisions, setId: string): ImageSetDecision => decisions[setId] ?? emptyImageSetDecision();

const normalizeDecisionForSave = (decision: ImageSetDecision): ImageSetDecision => {
   const deletedImages = [...new Set(decision.deletedImages.filter((path) => path.length > 0))];
   return { deletedImages };
};

const areDecisionsEqual = (left: ImageSetDecision, right: ImageSetDecision): boolean =>
   left.deletedImages.length === right.deletedImages.length && left.deletedImages.every((path, index) => path === right.deletedImages[index]);

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

const emptyImagePaths: ReadonlySet<string> = new Set<string>();

export const getDeletedImagePaths = (decision: ImageSetDecision): Set<string> => new Set(decision.deletedImages);

const getDeletedImagesForSet = (imageSet: ImageSet, decision: ImageSetDecision | undefined): ReadonlySet<string> => {
   if (decision === undefined || decision.deletedImages.length === 0) return emptyImagePaths;
   const imagePaths = new Set(imageSet.images.map((image) => image.originalPath));
   return new Set(decision.deletedImages.filter((path) => imagePaths.has(path)));
};

export const getImageSetDecision = (imageSet: ImageSet, deletedPaths: Set<string>): ImageSetDecision => {
   const imagePaths = imageSet.images.map((image) => image.originalPath);
   const deleted = imagePaths.filter((path) => deletedPaths.has(path));
   return { deletedImages: deleted };
};

interface ReviewSummary {
   movePreview: MovePreview[];
   duplicatePreview: MovePreview[];
   workflow: FileWorkflowState;
}

/** Counts and final-review rows come from the same pass and status rules. */
export const getReviewSummary = (imageSets: ImageSet[], decisions: Decisions): ReviewSummary => {
   const movePreview: MovePreview[] = [];
   const duplicatePreview: MovePreview[] = [];
   const workflow: FileWorkflowState = { discardedCount: 0, readyToMoveCount: 0, movedCount: 0, recycledCount: 0, missingCount: 0 };
   for (const imageSet of imageSets) {
      const discardedPaths = getDeletedImagesForSet(imageSet, decisions[imageSet.id]);
      for (const image of imageSet.images) {
         const moved = image.sourceStatus === "movedByApp";
         const recycled = image.sourceStatus === "recycledByApp";
         if (!moved && !recycled && !discardedPaths.has(image.originalPath)) continue;
         workflow.discardedCount += 1;
         if (recycled) {
            workflow.recycledCount += 1;
         } else if (image.sourceStatus === "missing") {
            workflow.missingCount += 1;
         } else {
            const rows = moved ? duplicatePreview : movePreview;
            rows.push({ setId: imageSet.id, file: image.file, originalPath: image.originalPath, previewUrl: image.previewUrl, size: image.size });
            if (moved) workflow.movedCount += 1;
            else workflow.readyToMoveCount += 1;
         }
      }
   }
   return { movePreview, duplicatePreview, workflow };
};

export interface FinalReviewSet {
   setId: string;
   number: string;
   /** Images that stay at their source after the move. */
   kept: ImageItem[];
   /** Discarded images still at their source, in set order. */
   discarded: MovePreview[];
}

/**
 * The ready-to-move rows regrouped by set, each beside what the set keeps, so
 * the final review answers "what stays?" next to "what goes?". A set whose
 * every image is leaving shows an empty kept list.
 */
export const getFinalReviewSets = (imageSets: ImageSet[], movePreview: MovePreview[]): FinalReviewSet[] => {
   const discardedBySet = new Map<string, MovePreview[]>();
   for (const row of movePreview) {
      const rows = discardedBySet.get(row.setId);
      if (rows === undefined) discardedBySet.set(row.setId, [row]);
      else rows.push(row);
   }
   const result: FinalReviewSet[] = [];
   for (const imageSet of imageSets) {
      const discarded = discardedBySet.get(imageSet.id);
      if (discarded === undefined) continue;
      const leaving = new Set(discarded.map((row) => row.originalPath));
      result.push({
         setId: imageSet.id,
         number: getSetNumber(imageSet.id),
         kept: imageSet.images.filter((image) => image.sourceStatus === "available" && !leaving.has(image.originalPath)),
         discarded,
      });
   }
   return result;
};

export interface LibrarySetRow {
   /** "#N" without a per-item call to getSetNumber. */
   number: string;
   /** The "kept/total" text shown on filmstrip tiles and the set header. */
   label: string;
   state: ImageSetState;
   /** Cached "difference N.N" fragment for filmstrip tooltips. */
   differenceText: string;
}

/** Row text and state in one pass over the set, so filmstrip items render from
   cached strings instead of recomputing label helpers per render. */
export const getSetRow = (imageSet: ImageSet, decision: ImageSetDecision | undefined): LibrarySetRow => {
   const deletedCount = getDeletedImagesForSet(imageSet, decision).size;
   const keptCount = Math.max(0, imageSet.images.length - deletedCount);
   return {
      number: getSetNumber(imageSet.id),
      label: `${keptCount}/${imageSet.images.length}`,
      state: deletedCount === imageSet.images.length ? "allDeleted" : deletedCount > 0 ? "someDeleted" : "open",
      differenceText: getSimilarityLabel(imageSet.similarity),
   };
};

export const getSetNumber = (setId: string): string => setId.replace(/^set_0*/u, "#");

export { getSimilarityLabel };

/**
 * Band color by average image difference: terracotta orange for near-identical
 * sets, cooling through amber, olive, and sage into green at the match limit.
 */
const similarityColorStops = [
   { distance: 0, color: [224, 137, 74] },
   { distance: matchDistanceLimit / 4, color: [217, 168, 88] },
   { distance: matchDistanceLimit / 2, color: [186, 186, 106] },
   { distance: (matchDistanceLimit * 3) / 4, color: [148, 196, 128] },
   { distance: matchDistanceLimit, color: [114, 200, 138] },
] as const;

export const getSimilarityColor = (similarity: number): string => {
   const distance = clamp(Number(getSimilarityLabel(similarity)), 0, matchDistanceLimit);
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

      bands.push({ label, distance: Number(label), groups: [{ imageSet, index }] });
   });

   return bands;
};

export const getResumeIndex = (groups: ImageSet[], currentSetId: string | null): number => {
   if (groups.length === 0 || currentSetId === null) return 0;
   const savedIndex = groups.findIndex((imageSet) => imageSet.id === currentSetId);
   return savedIndex < 0 ? 0 : savedIndex;
};

/**
 * The auto-keep pick: the largest image by pixel count, then by file size, then by
 * name for stability. Deliberately ignores filenames beyond tie-breaking so the
 * choice is always explainable as "kept the largest image".
 */
export const getLargestImage = (imageSet: ImageSet): ImageItem => {
   let largest = imageSet.images[0];
   if (largest === undefined) {
      throw new Error(`Image set ${imageSet.id} has no images to pick from`);
   }
   for (const image of imageSet.images) {
      const rank = image.width * image.height - largest.width * largest.height || image.size - largest.size || largest.file.localeCompare(image.file);
      if (rank > 0) largest = image;
   }
   return largest;
};

/** How one image's value compares inside its set: the strongest, a weaker one, or no difference worth showing. */
export type ValueRank = "best" | "lower" | null;

export interface ImageInsight {
   resolution: ValueRank;
   size: ValueRank;
   /** Folder relative to the set's shared folder, only when the set spans several folders. */
   folderLabel: string | null;
}

export interface SetInsights {
   /** The deepest folder every image shares. */
   commonFolder: string;
   images: Map<string, ImageInsight>;
}

/** File sizes within this ratio read as the same; re-saves differ by a few bytes. */
const meaningfulSizeRatio = 1.05;

const splitPath = (value: string): string[] => value.split(/[\\/]/u).filter((part) => part.length > 0);

const getParentFolder = (filePath: string): string => filePath.replace(/[\\/][^\\/]*$/u, "");

const getCommonFolder = (folders: string[]): string => {
   const [first, ...rest] = folders;
   if (first === undefined) return "";
   const separator = first.includes("\\") ? "\\" : "/";
   let common = splitPath(first);
   for (const folder of rest) {
      const parts = splitPath(folder);
      let length = 0;
      while (length < common.length && length < parts.length && common[length]?.toLowerCase() === parts[length]?.toLowerCase()) length += 1;
      common = common.slice(0, length);
   }
   const joined = common.join(separator);
   return first.startsWith(separator) && !first.startsWith(separator + separator) ? separator + joined : joined;
};

/**
 * What tells the images of one set apart: which has the most pixels, which is
 * the largest file, and where each lives. Only available images take part, and
 * a rank appears only when the set actually differs on it, so identical files
 * show no highlight at all.
 */
export const getSetInsights = (imageSet: ImageSet): SetInsights => {
   const available = imageSet.images.filter((image) => image.sourceStatus === "available");
   const pixels = available.map((image) => image.width * image.height);
   const sizes = available.map((image) => image.size);
   const maxPixels = Math.max(0, ...pixels);
   const minPixels = Math.min(...pixels);
   const maxSize = Math.max(0, ...sizes);
   const minSize = Math.min(...sizes);
   const pixelsDiffer = available.length > 1 && maxPixels !== minPixels;
   const sizesDiffer = available.length > 1 && maxSize > minSize * meaningfulSizeRatio;

   const folders = imageSet.images.map((image) => getParentFolder(image.originalPath));
   const commonFolder = getCommonFolder(folders);
   const foldersDiffer = new Set(folders.map((folder) => folder.toLowerCase())).size > 1;
   // Labels are relative to the shared folder. When one image sits in that
   // folder itself, every label starts from its name so "Photos" and
   // "Photos/Backup" read as siblings instead of "Photos" and "Backup".
   const commonParts = splitPath(commonFolder);
   const relativeParts = folders.map((folder) => splitPath(folder).slice(commonParts.length));
   const anchor = relativeParts.some((parts) => parts.length === 0) ? commonParts.slice(-1) : [];

   const images = new Map<string, ImageInsight>();
   imageSet.images.forEach((image, index) => {
      const isAvailable = image.sourceStatus === "available";
      images.set(image.originalPath, {
         resolution: isAvailable && pixelsDiffer ? (image.width * image.height === maxPixels ? "best" : "lower") : null,
         size: isAvailable && sizesDiffer ? (image.size * meaningfulSizeRatio >= maxSize ? "best" : "lower") : null,
         folderLabel: foldersDiffer ? [...anchor, ...(relativeParts[index] ?? [])].join("/") : null,
      });
   });

   return { commonFolder, images };
};

/** "Moved 9 images." plus only the counts that need attention. */
export const describeFileResult = (result: { moved: unknown[]; skipped: unknown[]; errors: unknown[] }, verb: string): string => {
   const moved = result.moved.length;
   const parts = [`${verb} ${moved} image${moved === 1 ? "" : "s"}`];
   if (result.skipped.length > 0) parts.push(`${result.skipped.length} skipped`);
   if (result.errors.length > 0) parts.push(`${result.errors.length} failed`);
   return `${parts.join(", ")}.`;
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

   if (kind === "discardSet") {
      return {
         kind,
         title: "Discard this set?",
         body: "Every image in the current set will be discarded. You can undo this before anything moves.",
         confirmLabel: "Discard set",
      };
   }

   if (kind === "discardBand") {
      return {
         kind,
         title: "Discard this band?",
         body: `Every available image in ${count} set${count === 1 ? "" : "s"} will be discarded, including images you already discarded. You can undo this before anything moves.`,
         confirmLabel: "Discard band",
      };
   }

   if (kind === "applyMoves") {
      return {
         kind,
         title: `Move ${count} image${count === 1 ? "" : "s"} to the duplicate folder?`,
         body: `Discarded images move into ${destination} and stay there, recoverable, until you recycle the folder.`,
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
         body: "Opening a new folder replaces the current scan and all discard choices. Source files are never touched.",
         confirmLabel: "Scan folder",
         ...(folderPath === undefined ? {} : { folderPath }),
      };
   }

   return {
      kind,
      title: "Clear every choice?",
      body: "All discard choices in this scan will be cleared. Source files stay untouched.",
      confirmLabel: "Clear all",
   };
};
