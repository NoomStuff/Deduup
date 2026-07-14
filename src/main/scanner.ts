import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
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

const supportedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".avif", ".tif", ".tiff"]);
const hashDistanceThreshold = 13;
const groupingYieldInterval = 256;
const exactSimilarityLimit = 96;
const similaritySampleLimit = 4096;
const maximumDetectionSimilarity = 20;
const maximumDetectionImages = 100;
const projectionCount = 128;
const projectionWidth = 12;
const projectionBucketCount = 1 << projectionWidth;

interface HashWords {
   high: number;
   low: number;
}

type ProjectionIndex = (number[] | undefined)[];

const createProjection = (projectionIndex: number): number[] => {
   const positions = new Set<number>();
   let state = Math.imul(projectionIndex + 1, 0x9e3779b9) >>> 0;
   while (positions.size < projectionWidth) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      positions.add((state >>> 0) & 63);
   }
   return [...positions];
};

const projections = Array.from({ length: projectionCount }, (_, index) => createProjection(index));

export const collectImagePaths = async (rootPath: string, includeSubfolders: boolean): Promise<string[]> => {
   const collected: string[] = [];
   const normalizedRoot = path.resolve(rootPath);
   const duplicateOutputPath = path.join(normalizedRoot, "duplicate");

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
         return [];
      });

      for (const entry of entries) {
         const entryPath = path.join(folderPath, entry.name);
         if (entry.isDirectory()) {
            if (includeSubfolders) {
               await visit(entryPath);
            }
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

const scanImage = async (filePath: string): Promise<ScannedImage | null> => {
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
      return null;
   }
};

export const scanImages = async (paths: string[], reportProgress: ScanProgressReporter): Promise<ScannedImage[]> => {
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
         results[index] = await scanImage(filePath);
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

const parseHashWords = (hash: string): HashWords => ({
   high: Number.parseInt(hash.slice(0, 8), 16) >>> 0,
   low: Number.parseInt(hash.slice(8), 16) >>> 0,
});

const countBits = (input: number): number => {
   let value = input >>> 0;
   value -= (value >>> 1) & 0x55555555;
   value = (value & 0x33333333) + ((value >>> 2) & 0x33333333);
   return (((value + (value >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
};

const getWordDistance = (left: HashWords, right: HashWords): number => countBits(left.high ^ right.high) + countBits(left.low ^ right.low);

const getProjectionKey = (hash: HashWords, projection: number[]): number => {
   let key = 0;
   for (const position of projection) {
      const bit = position < 32 ? (hash.low >>> position) & 1 : (hash.high >>> (position - 32)) & 1;
      key = (key << 1) | bit;
   }
   return key;
};

const findAndIndexMatches = (
   imageIndex: number,
   hashWords: HashWords[],
   indexes: ProjectionIndex[],
   candidateMarkers: Int32Array,
   onMatch: (matchingIndex: number) => void
): void => {
   const hash = hashWords[imageIndex];
   if (hash === undefined) return;
   const marker = imageIndex + 1;

   projections.forEach((projection, projectionIndex) => {
      const index = indexes[projectionIndex];
      if (index === undefined) return;
      const key = getProjectionKey(hash, projection);
      const candidates = index[key];
      if (candidates !== undefined) {
         for (const candidateIndex of candidates) {
            if (candidateMarkers[candidateIndex] === marker) continue;
            candidateMarkers[candidateIndex] = marker;
            const candidateHash = hashWords[candidateIndex];
            if (candidateHash !== undefined && getWordDistance(hash, candidateHash) <= hashDistanceThreshold) onMatch(candidateIndex);
         }
      }

      if (candidates === undefined) index[key] = [imageIndex];
      else candidates.push(imageIndex);
   });
};

const yieldToMainLoop = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

const getConnectedGroups = async (images: ScannedImage[], reportProgress: ScanProgressReporter): Promise<ScannedImage[][]> => {
   const parent = images.map((_, index) => index);
   const hashWords = images.map((image) => parseHashWords(image.hash));
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

   const indexes: ProjectionIndex[] = Array.from({ length: projectionCount }, () => Array.from({ length: projectionBucketCount }));
   const candidateMarkers = new Int32Array(images.length);
   reportProgress({ phase: "grouping", completed: 0, total: images.length });
   for (let imageIndex = 0; imageIndex < images.length; imageIndex += 1) {
      findAndIndexMatches(imageIndex, hashWords, indexes, candidateMarkers, (matchingIndex) => union(imageIndex, matchingIndex));

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
      groupsByRoot.set(root, [...(groupsByRoot.get(root) ?? []), image]);
   });
   return [...groupsByRoot.values()];
};

export const groupImages = async (images: ScannedImage[], reportProgress: ScanProgressReporter): Promise<GroupedImages[]> => {
   const connectedGroups = await getConnectedGroups(images, reportProgress);
   const groups = connectedGroups
      .filter((group) => group.length > 1 && group.length <= maximumDetectionImages)
      .map((group) => ({ similarity: getGroupSimilarity(group), images: group }))
      .filter((group) => group.similarity <= maximumDetectionSimilarity)
      .sort((left, right) => left.similarity - right.similarity);
   reportProgress({ phase: "grouping", completed: images.length, total: images.length });
   return groups;
};
