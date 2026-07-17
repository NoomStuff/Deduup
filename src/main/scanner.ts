import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { duplicateContainerFolderName, managedDuplicateFolderName } from "../shared/constants.js";
import type { ScanProgress } from "../shared/types.js";

export interface ScannedImage {
   file: string;
   originalPath: string;
   hash: string;
   width: number;
   height: number;
   size: number;
   modifiedAt: number;
}

export interface GroupedImages {
   similarity: number;
   images: ScannedImage[];
}

export type ScanProgressReporter = (progress: ScanProgress) => void;
export type ScanWarningReporter = (filePath: string) => void;

const supportedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".avif", ".tif", ".tiff"]);
const hashDistanceThreshold = 13;
const groupingYieldInterval = 256;
const exactSimilarityLimit = 96;
const similaritySampleLimit = 4096;

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

export const collectImagePaths = async (rootPath: string, reportWarning?: ScanWarningReporter): Promise<string[]> => {
   const collected: string[] = [];
   const normalizedRoot = path.resolve(rootPath);
   const duplicateOutputPath = path.join(normalizedRoot, duplicateContainerFolderName, managedDuplicateFolderName);

   const visit = async (folderPath: string, isRoot = false): Promise<void> => {
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

const createDifferenceHash = (pixels: Buffer): string => {
   let hash = 0n;
   for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
         const offset = y * 9 + x;
         hash = (hash << 1n) | ((pixels[offset] ?? 0) > (pixels[offset + 1] ?? 0) ? 1n : 0n);
      }
   }
   return hash.toString(16).padStart(16, "0");
};

const scanImage = async (filePath: string, reportWarning?: ScanWarningReporter): Promise<ScannedImage | null> => {
   try {
      const source = sharp(filePath, { animated: false, failOn: "none" }).rotate();
      const metadata = await source.metadata();
      const pixels = await source.clone().resize(9, 8, { fit: "fill" }).greyscale().raw().toBuffer();
      const fileStat = await stat(filePath);
      return {
         file: path.basename(filePath),
         originalPath: path.normalize(filePath),
         hash: createDifferenceHash(pixels),
         width: metadata.width,
         height: metadata.height,
         size: fileStat.size,
         modifiedAt: fileStat.mtimeMs,
      };
   } catch (error: unknown) {
      console.warn(`Skipping unreadable image: ${filePath}`, error);
      reportWarning?.(filePath);
      return null;
   }
};

export const scanImages = async (paths: string[], reportProgress: ScanProgressReporter, reportWarning?: ScanWarningReporter): Promise<ScannedImage[]> => {
   const results: (ScannedImage | null)[] = Array.from({ length: paths.length }, () => null);
   let nextIndex = 0;
   let completed = 0;
   const workerCount = Math.min(8, Math.max(1, paths.length));

   const worker = async (): Promise<void> => {
      while (nextIndex < paths.length) {
         const index = nextIndex;
         nextIndex += 1;
         const filePath = paths[index];
         if (filePath === undefined) {
            continue;
         }
         results[index] = await scanImage(filePath, reportWarning);
         completed += 1;
         reportProgress({ phase: "hashing", completed, total: paths.length, currentFile: path.basename(filePath) });
      }
   };

   await Promise.all(Array.from({ length: workerCount }, worker));
   return results.filter((image): image is ScannedImage => image !== null);
};

export const getHashDistance = (left: string, right: string): number => {
   return getHashValueDistance(BigInt(`0x${left}`), BigInt(`0x${right}`));
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
   let totalDistance = 0;
   let comparisons = 0;

   if (images.length <= exactSimilarityLimit) {
      for (let leftIndex = 0; leftIndex < images.length; leftIndex += 1) {
         const left = images[leftIndex];
         if (left === undefined) continue;
         for (let rightIndex = leftIndex + 1; rightIndex < images.length; rightIndex += 1) {
            const right = images[rightIndex];
            if (right === undefined) continue;
            totalDistance += getHashDistance(left.hash, right.hash);
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
      const left = images[leftIndex];
      const right = images[rightIndex];
      if (left !== undefined && right !== undefined) {
         totalDistance += getHashDistance(left.hash, right.hash);
         comparisons += 1;
      }
   }

   return comparisons === 0 ? 0 : totalDistance / comparisons;
};

const getHashPartition = (hash: bigint, partition: number): number => Number((hash >> BigInt(partition * hashPartitionBits)) & 0xffffn);

const findAndIndexMatches = (
   imageIndex: number,
   hash: bigint,
   hashValues: bigint[],
   indexes: SimilarityIndex,
   candidateMarkers: Int32Array,
   onMatch: (matchingIndex: number) => void
): void => {
   const marker = imageIndex + 1;
   for (let partition = 0; partition < hashPartitionCount; partition += 1) {
      const index = indexes[partition];
      if (index === undefined) continue;
      const partitionValue = getHashPartition(hash, partition);
      for (const mask of partitionMasks) {
         const candidates = index.get(partitionValue ^ mask);
         if (candidates === undefined) continue;
         for (const candidateIndex of candidates) {
            if (candidateMarkers[candidateIndex] === marker) continue;
            candidateMarkers[candidateIndex] = marker;
            const candidateHash = hashValues[candidateIndex];
            if (candidateHash !== undefined && getHashValueDistance(hash, candidateHash) <= hashDistanceThreshold) onMatch(candidateIndex);
         }
      }

      const bucket = index.get(partitionValue);
      if (bucket === undefined) index.set(partitionValue, [imageIndex]);
      else bucket.push(imageIndex);
   }
};

const yieldToMainLoop = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

const getConnectedGroups = async (images: ScannedImage[], reportProgress: ScanProgressReporter): Promise<ScannedImage[][]> => {
   const parent = images.map((_, index) => index);
   const hashValues = images.map((image) => BigInt(`0x${image.hash}`));
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
   const exactHashRepresentatives = new Map<bigint, number>();
   reportProgress({ phase: "grouping", completed: 0, total: images.length });
   for (let imageIndex = 0; imageIndex < images.length; imageIndex += 1) {
      const hash = hashValues[imageIndex];
      if (hash !== undefined) {
         const exactRepresentative = exactHashRepresentatives.get(hash);
         if (exactRepresentative === undefined) {
            findAndIndexMatches(imageIndex, hash, hashValues, indexes, candidateMarkers, (matchingIndex) => union(imageIndex, matchingIndex));
            exactHashRepresentatives.set(hash, imageIndex);
         } else {
            union(imageIndex, exactRepresentative);
         }
      }

      const completed = imageIndex + 1;
      if (completed % groupingYieldInterval === 0 && completed < images.length) {
         const currentFile = images[imageIndex]?.file;
         reportProgress({ phase: "grouping", completed, total: images.length, ...(currentFile === undefined ? {} : { currentFile }) });
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

export const groupImages = async (images: ScannedImage[], reportProgress: ScanProgressReporter): Promise<GroupedImages[]> => {
   const connectedGroups = await getConnectedGroups(images, reportProgress);
   const groups = connectedGroups
      .filter((group) => group.length > 1)
      .map((group) => ({ similarity: getGroupSimilarity(group), images: group }))
      .sort((left, right) => left.similarity - right.similarity);
   reportProgress({ phase: "grouping", completed: images.length, total: images.length });
   return groups;
};
