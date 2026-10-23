import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { ScanProgress } from "../shared/types.js";
import { matchDistanceLimit } from "../shared/similarity.js";
import { getManagedFolderPaths } from "./managedFolder.js";

export interface ScannedImage {
   file: string;
   originalPath: string;
   hash: string;
   width: number;
   height: number;
   size: number;
   modifiedAt: number;
   changedAt: number;
}

export interface GroupedImages {
   similarity: number;
   images: ScannedImage[];
}

export type ScanProgressReporter = (progress: ScanProgress) => void;
export type ScanWarningReporter = (filePath: string) => void;

export class ScanCancelledError extends Error {
   constructor() {
      super("Scan cancelled");
      this.name = "ScanCancelledError";
   }
}

export const throwIfScanCancelled = (signal?: AbortSignal): void => {
   if (signal?.aborted) throw new ScanCancelledError();
};

const supportedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".avif", ".tif", ".tiff"]);
// Includes the cached dimensions as well as the hash format.
export const HASH_VERSION = "dhash64-rgb-v3";
const hashDistanceThreshold = matchDistanceLimit;
const groupingYieldInterval = 256;
const exactSimilarityLimit = 96;
const similaritySampleLimit = 4096;
/**
 * Over-cap splitting builds a full distance matrix and runs an O(n^2) exile
 * loop, both only acceptable for small groups. Huge folders routinely chain
 * tens of thousands of similar images into one connected group, so anything
 * above this limit is hash-sorted into bounded chunks and re-clustered instead
 * of being fed to the matrix.
 */
const splitWorkLimit = 256;

/** Groups whose average pairwise distance exceeds this are split before review. */
const similarityCap = hashDistanceThreshold;

const hashPartitionCount = 4;
const hashPartitionBits = 16;
type SimilarityIndex = Map<number, number[]>[];

const createPartitionMasks = (): number[] => {
   const masks = [0];
   for (let first = 0; first < hashPartitionBits; first += 1) {
      masks.push(1 << first);
      for (let second = first + 1; second < hashPartitionBits; second += 1) {
         masks.push((1 << first) | (1 << second));
         for (let third = second + 1; third < hashPartitionBits; third += 1) {
            masks.push((1 << first) | (1 << second) | (1 << third));
         }
      }
   }
   return masks;
};

const partitionMasks = createPartitionMasks();

export const collectImagePaths = async (rootPath: string, reportWarning?: ScanWarningReporter, signal?: AbortSignal): Promise<string[]> => {
   const collected: string[] = [];
   const normalizedRoot = path.resolve(rootPath);
   const duplicateOutputPath = getManagedFolderPaths(normalizedRoot).managedPath;

   const visit = async (folderPath: string, isRoot = false): Promise<void> => {
      if (signal?.aborted) throw new ScanCancelledError();
      const normalizedFolderPath = path.resolve(folderPath);
      if (!isRoot && normalizedFolderPath === duplicateOutputPath) {
         return;
      }

      const entries = await readdir(folderPath, { withFileTypes: true }).catch((error: unknown) => {
         if (isRoot) {
            throw error;
         }
         console.warn(`Skipping unreadable folder: ${folderPath}`, error);
         reportWarning?.(folderPath);
         return [];
      });

      for (const entry of entries) {
         const entryPath = path.join(folderPath, entry.name);
         if (entry.isDirectory()) {
            await visit(entryPath);
         } else if (entry.isFile() && supportedExtensions.has(path.extname(entry.name).toLowerCase())) {
            collected.push(entryPath);
         }
      }
   };

   await visit(rootPath, true);
   return collected.sort((left, right) => left.localeCompare(right));
};

// Store the spatial hash separately from its RGB evidence. Only the spatial
// bits participate in the four 16-bit candidate indexes.
const hashPattern = /^[0-9a-f]{16}:[0-9a-f]{432}$/u;
interface ImageHash {
   spatial: bigint;
   colors: Buffer;
}
const parseHash = (hash: string): ImageHash => {
   if (!hashPattern.test(hash)) throw new Error("Unsupported image hash. Rescan the library.");
   return { spatial: BigInt(`0x${hash.slice(0, 16)}`), colors: Buffer.from(hash.slice(17), "hex") };
};

const createDifferenceHash = (pixels: Buffer): string => {
   // Ignore tiny quantization gradients in otherwise flat images.
   const luminance = Array.from({ length: 72 }, (_, index) =>
      Math.round((pixels[index * 3] ?? 0) * 0.299 + (pixels[index * 3 + 1] ?? 0) * 0.587 + (pixels[index * 3 + 2] ?? 0) * 0.114)
   );
   let hash = 0n;
   for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
         const offset = y * 9 + x;
         hash = (hash << 1n) | ((luminance[offset] ?? 0) - (luminance[offset + 1] ?? 0) > 2 ? 1n : 0n);
      }
   }
   return `${hash.toString(16).padStart(16, "0")}:${pixels.toString("hex")}`;
};

const scanImage = async (filePath: string, reportWarning?: ScanWarningReporter, cached?: ScannedImage): Promise<ScannedImage | null> => {
   try {
      const before = await stat(filePath);
      if (!before.isFile()) throw new Error("The image is not a regular file");
      if (
         cached !== undefined &&
         hashPattern.test(cached.hash) &&
         cached.size === before.size &&
         cached.modifiedAt === before.mtimeMs &&
         cached.changedAt === before.ctimeMs
      )
         return cached;
      const source = sharp(filePath, { animated: false, failOn: "none" }).rotate();
      const metadata = await source.metadata();
      const pixels = await source.clone().resize(9, 8, { fit: "fill" }).toColourspace("srgb").removeAlpha().raw().toBuffer();
      const fileStat = await stat(filePath);
      if (
         before.dev !== fileStat.dev ||
         before.ino !== fileStat.ino ||
         before.size !== fileStat.size ||
         before.mtimeMs !== fileStat.mtimeMs ||
         before.ctimeMs !== fileStat.ctimeMs
      )
         throw new Error("The image changed while scanning");
      return {
         file: path.basename(filePath),
         originalPath: path.normalize(filePath),
         hash: createDifferenceHash(pixels),
         width: metadata.autoOrient.width,
         height: metadata.autoOrient.height,
         size: fileStat.size,
         modifiedAt: fileStat.mtimeMs,
         changedAt: fileStat.ctimeMs,
      };
   } catch (error: unknown) {
      console.warn(`Skipping unreadable image: ${filePath}`, error);
      reportWarning?.(filePath);
      return null;
   }
};

export const scanImages = async (
   paths: string[],
   reportProgress: ScanProgressReporter,
   reportWarning?: ScanWarningReporter,
   signal?: AbortSignal,
   cachedImages: Map<string, ScannedImage> = new Map()
): Promise<ScannedImage[]> => {
   const results: (ScannedImage | null)[] = Array.from({ length: paths.length }, () => null);
   let nextIndex = 0;
   let completed = 0;
   const workerCount = Math.min(8, Math.max(1, paths.length));
   // Huge folders would otherwise flood the renderer with one IPC message per
   // file; ~500 updates keep the progress bar just as smooth.
   const progressStride = Math.max(1, Math.ceil(paths.length / 500));

   const worker = async (): Promise<void> => {
      while (nextIndex < paths.length) {
         if (signal?.aborted) return;
         const index = nextIndex;
         nextIndex += 1;
         const filePath = paths[index];
         if (filePath === undefined) {
            continue;
         }
         results[index] = await scanImage(filePath, reportWarning, cachedImages.get(filePath));
         if (signal?.aborted) return;
         completed += 1;
         if (completed % progressStride === 0 || completed === paths.length) {
            reportProgress({ phase: "hashing", completed, total: paths.length, currentFile: path.basename(filePath) });
         }
      }
   };

   await Promise.all(Array.from({ length: workerCount }, worker));
   if (signal?.aborted) throw new ScanCancelledError();
   return results.filter((image): image is ScannedImage => image !== null);
};

export const getHashDistance = (left: string, right: string): number => {
   return getImageHashDistance(parseHash(left), parseHash(right));
};

/**
 * Difference stays on the 0..64 scale. Color difference is the mean largest
 * RGB channel change per thumbnail pixel, scaled from 0..255 to 0..64.
 * Taking the maximum means color can reject a spatial match, never rescue one.
 * Zero requires identical spatial bits AND identical RGB thumbnails.
 */
const getImageHashDistance = (left: ImageHash, right: ImageHash): number => {
   const spatialDistance = getHashValueDistance(left.spatial, right.spatial);
   let colorDifference = 0;
   for (let offset = 0; offset < left.colors.length; offset += 3) {
      colorDifference += Math.max(
         Math.abs((left.colors[offset] ?? 0) - (right.colors[offset] ?? 0)),
         Math.abs((left.colors[offset + 1] ?? 0) - (right.colors[offset + 1] ?? 0)),
         Math.abs((left.colors[offset + 2] ?? 0) - (right.colors[offset + 2] ?? 0))
      );
   }
   return Math.max(spatialDistance, (colorDifference * 64) / (72 * 255));
};

const getHashValueDistance = (left: bigint, right: bigint): number => {
   let value = left ^ right;
   let distance = 0;
   while (value !== 0n) {
      value &= value - 1n;
      distance += 1;
   }
   return distance;
};

const getGroupSimilarity = (images: ScannedImage[]): number => {
   const firstHash = images[0]?.hash;
   if (images.every((image) => image.hash === firstHash)) return 0;
   const hashes = images.map((image) => parseHash(image.hash));
   let totalDistance = 0;
   let comparisons = 0;

   if (images.length <= exactSimilarityLimit) {
      for (let leftIndex = 0; leftIndex < images.length; leftIndex += 1) {
         const left = hashes[leftIndex];
         if (left === undefined) continue;
         for (let rightIndex = leftIndex + 1; rightIndex < images.length; rightIndex += 1) {
            const right = hashes[rightIndex];
            if (right === undefined) continue;
            totalDistance += getImageHashDistance(left, right);
            comparisons += 1;
         }
      }
      return comparisons === 0 ? 0 : totalDistance / comparisons;
   }

   const sampleCount = Math.min(similaritySampleLimit, images.length * 4);
   for (let sample = 0; sample < sampleCount; sample += 1) {
      const leftIndex = sample % images.length;
      let rightIndex = (sample * 7919 + Math.floor(sample / images.length) + 1) % images.length;
      if (rightIndex === leftIndex) rightIndex = (rightIndex + 1) % images.length;
      const left = hashes[leftIndex];
      const right = hashes[rightIndex];
      if (left !== undefined && right !== undefined) {
         totalDistance += getImageHashDistance(left, right);
         comparisons += 1;
      }
   }

   return comparisons === 0 ? 0 : totalDistance / comparisons;
};

const getHashPartition = (hash: bigint, partition: number): number => Number((hash >> BigInt(partition * hashPartitionBits)) & 0xffffn);

/**
 * Transitive matching can chain wildly different images into one enormous set.
 * When a group averages past the similarity cap, its most distant member is
 * exiled repeatedly until the remainder fits under the cap; the exiles are
 * re-clustered on their own afterwards, so real duplicates further along the
 * chain still get their own sets.
 */
const splitOverCapGroup = (group: ScannedImage[]): { kept: ScannedImage[]; exiled: ScannedImage[] } => {
   const size = group.length;
   const hashes = group.map((image) => parseHash(image.hash));
   const distances = new Float64Array(size * size);
   const sums = new Float64Array(size);
   let totalDistance = 0;
   for (let left = 0; left < size; left += 1) {
      const leftImage = hashes[left];
      if (leftImage === undefined) continue;
      for (let right = left + 1; right < size; right += 1) {
         const rightImage = hashes[right];
         if (rightImage === undefined) continue;
         const distance = getImageHashDistance(leftImage, rightImage);
         distances[left * size + right] = distance;
         distances[right * size + left] = distance;
         sums[left] = (sums[left] ?? 0) + distance;
         sums[right] = (sums[right] ?? 0) + distance;
         totalDistance += distance;
      }
   }

   const active: number[] = group.map((_, index) => index);
   const exiled: ScannedImage[] = [];
   while (active.length > 2 && totalDistance > (similarityCap * active.length * (active.length - 1)) / 2) {
      let worstPosition = 0;
      let worstSum = -1;
      for (let position = 0; position < active.length; position += 1) {
         const candidate = active[position];
         if (candidate === undefined) continue;
         const sum = sums[candidate] ?? 0;
         // Subtracting fractional color distances can leave rounding noise.
         // Keep the original image order when two sums are effectively tied.
         if (sum > worstSum + 1e-9) {
            worstSum = sum;
            worstPosition = position;
         }
      }
      const removedIndex = active.splice(worstPosition, 1)[0];
      const removedImage = removedIndex === undefined ? undefined : group[removedIndex];
      if (removedIndex === undefined || removedImage === undefined) throw new Error("Missing split candidate");
      exiled.push(removedImage);
      totalDistance -= worstSum;
      for (const index of active) sums[index] = (sums[index] ?? 0) - (distances[index * size + removedIndex] ?? 0);
   }

   return { kept: active.map((index) => group[index]).filter((image): image is ScannedImage => image !== undefined), exiled };
};
const findAndIndexMatches = (
   imageIndex: number,
   hash: ImageHash,
   hashValues: ImageHash[],
   indexes: SimilarityIndex,
   candidateMarkers: Int32Array,
   isConnected: (candidateIndex: number) => boolean,
   onMatch: (matchingIndex: number) => void
): void => {
   const marker = imageIndex + 1;
   for (let partition = 0; partition < hashPartitionCount; partition += 1) {
      const index = indexes[partition];
      if (index === undefined) continue;
      const partitionValue = getHashPartition(hash.spatial, partition);
      for (const mask of partitionMasks) {
         const candidates = index.get(partitionValue ^ mask);
         if (candidates === undefined) continue;
         for (const candidateIndex of candidates) {
            if (candidateMarkers[candidateIndex] === marker) continue;
            candidateMarkers[candidateIndex] = marker;
            // Another accepted edge already connects these images. Rechecking
            // their distance cannot change this component, but every distinct
            // signature must still be indexed to discover later bridge edges.
            if (isConnected(candidateIndex)) continue;
            const candidateHash = hashValues[candidateIndex];
            if (
               candidateHash !== undefined &&
               getHashValueDistance(hash.spatial, candidateHash.spatial) <= hashDistanceThreshold &&
               getImageHashDistance(hash, candidateHash) <= hashDistanceThreshold
            )
               onMatch(candidateIndex);
         }
      }

      const bucket = index.get(partitionValue);
      if (bucket === undefined) index.set(partitionValue, [imageIndex]);
      else bucket.push(imageIndex);
   }
};

const yieldToMainLoop = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

const getConnectedGroups = async (images: ScannedImage[], reportProgress: ScanProgressReporter, signal?: AbortSignal): Promise<ScannedImage[][]> => {
   throwIfScanCancelled(signal);
   const parent = images.map((_, index) => index);
   // Only distinct signatures enter the indexes or need decoded RGB buffers.
   const hashValues = new Array<ImageHash>(images.length);
   const find = (index: number): number => {
      let root = index;
      while (parent[root] !== root) root = parent[root] ?? root;
      while (parent[index] !== index) {
         const next = parent[index] ?? root;
         parent[index] = root;
         index = next;
      }
      return root;
   };
   const union = (left: number, right: number): void => {
      const leftRoot = find(left);
      const rightRoot = find(right);
      if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
   };

   const indexes: SimilarityIndex = Array.from({ length: hashPartitionCount }, () => new Map<number, number[]>());
   const candidateMarkers = new Int32Array(images.length);
   const exactHashRepresentatives = new Map<string, number>();
   reportProgress({ phase: "grouping", completed: 0, total: images.length });
   for (const [imageIndex, image] of images.entries()) {
      throwIfScanCancelled(signal);
      const exactRepresentative = exactHashRepresentatives.get(image.hash);
      if (exactRepresentative === undefined) {
         const hash = parseHash(image.hash);
         hashValues[imageIndex] = hash;
         findAndIndexMatches(
            imageIndex,
            hash,
            hashValues,
            indexes,
            candidateMarkers,
            (candidateIndex) => find(imageIndex) === find(candidateIndex),
            (matchingIndex) => union(imageIndex, matchingIndex)
         );
         exactHashRepresentatives.set(image.hash, imageIndex);
      } else {
         union(imageIndex, exactRepresentative);
      }

      const completed = imageIndex + 1;
      if (completed % groupingYieldInterval === 0 && completed < images.length) {
         reportProgress({ phase: "grouping", completed, total: images.length, currentFile: image.file });
         await yieldToMainLoop();
      }
   }

   const groupsByRoot = new Map<number, ScannedImage[]>();
   images.forEach((image, index) => {
      const root = find(index);
      const group = groupsByRoot.get(root);
      if (group === undefined) groupsByRoot.set(root, [image]);
      else group.push(image);
   });
   return [...groupsByRoot.values()];
};

export const groupImages = async (images: ScannedImage[], reportProgress: ScanProgressReporter, signal?: AbortSignal): Promise<GroupedImages[]> => {
   const results: GroupedImages[] = [];
   let pending: ScannedImage[][] = [];

   const admit = async (group: ScannedImage[]): Promise<void> => {
      if (signal?.aborted) throw new ScanCancelledError();
      if (group.length < 2) return;
      const similarity = getGroupSimilarity(group);
      if (similarity <= similarityCap) {
         results.push({ similarity, images: group });
         return;
      }
      if (group.length > splitWorkLimit) {
         // Keep each identical-hash population intact at chunk boundaries.
         // A population above the work limit has zero distance and can be
         // admitted directly without running the exile algorithm.
         const sorted = [...group].sort((left, right) => (left.hash < right.hash ? -1 : left.hash > right.hash ? 1 : 0));
         const chunks: ScannedImage[][] = [];
         let chunk: ScannedImage[] = [];
         for (let offset = 0; offset < sorted.length;) {
            let end = offset + 1;
            while (end < sorted.length && sorted[end]?.hash === sorted[offset]?.hash) end += 1;
            const population = sorted.slice(offset, end);
            if (chunk.length > 0 && chunk.length + population.length > splitWorkLimit) {
               chunks.push(chunk);
               chunk = [];
            }
            if (population.length > splitWorkLimit) chunks.push(population);
            else chunk.push(...population);
            offset = end;
         }
         if (chunk.length > 0) chunks.push(chunk);
         for (const chunk of chunks) {
            for (const component of await getConnectedGroups(chunk, () => undefined, signal)) {
               await admit(component);
            }
         }
         return;
      }
      const { kept, exiled } = splitOverCapGroup(group);
      results.push({ similarity: getGroupSimilarity(kept), images: kept });
      if (exiled.length >= 2) pending.push(exiled);
   };

   for (const group of await getConnectedGroups(images, reportProgress, signal)) {
      await admit(group);
   }
   while (pending.length > 0) {
      if (signal?.aborted) throw new ScanCancelledError();
      const pool = pending.flatMap((group) => group);
      pending = [];
      for (const group of await getConnectedGroups(pool, () => undefined, signal)) {
         await admit(group);
      }
   }

   results.sort((left, right) => left.similarity - right.similarity);
   throwIfScanCancelled(signal);
   reportProgress({ phase: "grouping", completed: images.length, total: images.length });
   return results;
};
