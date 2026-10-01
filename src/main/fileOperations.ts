import { constants, createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { copyFile, link, lstat, mkdir, readFile, readdir, realpath, rm, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { duplicateOwnershipMarkerContents, duplicateOwnershipMarkerName } from "../shared/constants.js";
import type { MoveResult, PlannedMove } from "../shared/types.js";
import { isObject } from "../shared/schema.js";

export const isMissingPathError = (error: unknown): boolean => isObject(error) && (error["code"] === "ENOENT" || error["code"] === "ENOTDIR");
const pathKey = (filePath: string): string => (process.platform === "win32" ? path.normalize(filePath).toLowerCase() : path.normalize(filePath));
const markerPath = (duplicatePath: string): string => path.join(duplicatePath, duplicateOwnershipMarkerName);

const pathExists = async (filePath: string): Promise<boolean> => {
   try {
      await lstat(filePath);
      return true;
   } catch (error: unknown) {
      if (isMissingPathError(error)) return false;
      throw error;
   }
};

export const fileChecksum = async (filePath: string): Promise<string> => {
   const before = await lstat(filePath);
   if (!before.isFile()) throw new Error(`Not a regular image file: ${filePath}`);
   const hash = createHash("sha256");
   for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
   const after = await lstat(filePath);
   if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
      throw new Error(`The file changed while it was being read: ${filePath}`);
   }
   return hash.digest("hex");
};

export const assertPathWithinRoot = async (root: string, candidate: string): Promise<void> => {
   const realRoot = await realpath(root);
   let ancestor = path.resolve(candidate);
   for (;;) {
      try {
         const resolved = await realpath(ancestor);
         const relative = path.relative(realRoot, resolved);
         if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
            throw new Error(`The file path leaves the scan folder: ${candidate}`);
         return;
      } catch (error: unknown) {
         if (!isMissingPathError(error) || ancestor === path.dirname(ancestor)) throw error;
         ancestor = path.dirname(ancestor);
      }
   }
};

const moveAcrossVolumes = async (source: string, destination: string): Promise<void> => {
   const sourceStat = await lstat(source);
   if (!sourceStat.isFile()) throw new Error(`Not a regular image file: ${source}`);
   try {
      // Creating a link cannot replace a destination created after preflight.
      await link(source, destination);
   } catch (error: unknown) {
      if (!isObject(error) || !["EXDEV", "EPERM", "EOPNOTSUPP", "ENOSYS"].includes(String(error["code"]))) throw error;
      await copyFile(source, destination, constants.COPYFILE_EXCL);
      if ((await fileChecksum(source)) !== (await fileChecksum(destination))) throw new Error(`The copied file could not be verified: ${destination}`);
      await utimes(destination, sourceStat.atime, sourceStat.mtime);
   }
   const currentStat = await lstat(source);
   if (
      sourceStat.dev !== currentStat.dev ||
      sourceStat.ino !== currentStat.ino ||
      sourceStat.size !== currentStat.size ||
      sourceStat.mtimeMs !== currentStat.mtimeMs
   ) {
      throw new Error(`The source changed during the move and was left untouched: ${source}`);
   }
   await rm(source);
};

const failureMessage = (error: unknown, fallback: string): string => (error instanceof Error ? error.message : fallback);

export const collectManagedFolderFiles = async (duplicatePath: string): Promise<string[]> => {
   const files: string[] = [];
   const visit = async (folderPath: string): Promise<void> => {
      for (const entry of await readdir(folderPath, { withFileTypes: true })) {
         const entryPath = path.join(folderPath, entry.name);
         if (entry.isDirectory()) await visit(entryPath);
         else if (pathKey(entryPath) !== pathKey(markerPath(duplicatePath))) files.push(entryPath);
      }
   };

   if (await pathExists(duplicatePath)) await visit(duplicatePath);
   return files;
};

export const assertManagedFolder = async (duplicatePath: string): Promise<void> => {
   let marker: string;
   try {
      if (!(await lstat(duplicatePath)).isDirectory() || !(await lstat(markerPath(duplicatePath))).isFile())
         throw new Error(`The managed folder or ownership marker is not a regular directory and file: ${duplicatePath}`);
      marker = await readFile(markerPath(duplicatePath), "utf8");
   } catch (error: unknown) {
      if (isMissingPathError(error)) throw new Error(`The managed duplicate folder is not owned by this app: ${duplicatePath}`);
      throw error;
   }
   if (marker !== duplicateOwnershipMarkerContents) throw new Error(`The managed duplicate folder is not owned by this app: ${duplicatePath}`);
};

export const ensureManagedFolder = async (duplicatePath: string): Promise<void> => {
   await mkdir(duplicatePath, { recursive: true });
   if (!(await lstat(duplicatePath)).isDirectory()) throw new Error(`The managed duplicate folder is not a regular directory: ${duplicatePath}`);
   if (await pathExists(markerPath(duplicatePath))) {
      await assertManagedFolder(duplicatePath);
      return;
   }
   if ((await collectManagedFolderFiles(duplicatePath)).length > 0) {
      throw new Error(`Refusing to use a managed duplicate folder that already contains unowned files: ${duplicatePath}`);
   }
   await writeFile(markerPath(duplicatePath), duplicateOwnershipMarkerContents, { encoding: "utf8", flag: "wx" });
};

interface MoveCallbacks {
   beforeMove?: (move: PlannedMove) => Promise<void>;
   afterMove?: (move: PlannedMove) => void;
}

export const applyFileMoves = async (moves: PlannedMove[], callbacks: MoveCallbacks = {}): Promise<MoveResult> => {
   const result: MoveResult = { moved: [], skipped: [], errors: [] };
   for (const move of moves) {
      try {
         if (!(await pathExists(move.from))) {
            result.skipped.push(move);
            continue;
         }
         if (await pathExists(move.to)) throw new Error(`The managed destination already exists: ${move.to}`);
         const sourceStat = await lstat(move.from);
         if (!sourceStat.isFile()) throw new Error(`Not a regular image file: ${move.from}`);
         if (
            move.expectedSource !== undefined &&
            (sourceStat.size !== move.expectedSource.size ||
               sourceStat.mtimeMs !== move.expectedSource.modifiedAt ||
               (move.expectedSource.changedAt !== undefined && sourceStat.ctimeMs !== move.expectedSource.changedAt))
         ) {
            throw new Error(`The image changed since the scan. Rescan it before moving: ${move.from}`);
         }
         await callbacks.beforeMove?.(move);
         const checkedStat = await lstat(move.from);
         if (
            sourceStat.dev !== checkedStat.dev ||
            sourceStat.ino !== checkedStat.ino ||
            sourceStat.size !== checkedStat.size ||
            sourceStat.mtimeMs !== checkedStat.mtimeMs ||
            sourceStat.ctimeMs !== checkedStat.ctimeMs
         ) {
            throw new Error(`The image changed while preparing the move: ${move.from}`);
         }
         await mkdir(path.dirname(move.to), { recursive: true });
         await moveAcrossVolumes(move.from, move.to);
         callbacks.afterMove?.(move);
         result.moved.push(move);
      } catch (error: unknown) {
         result.errors.push({ ...move, message: failureMessage(error, "Unknown move failure") });
      }
   }
   return result;
};

export const restoreFileMoves = async (expectedMoves: PlannedMove[], sourcePaths: string[], callbacks: MoveCallbacks = {}): Promise<MoveResult> => {
   const result: MoveResult = { moved: [], skipped: [], errors: [] };
   const expectedByDestination = new Map(expectedMoves.map((move) => [pathKey(move.to), move]));

   for (const sourcePath of sourcePaths) {
      const expected = expectedByDestination.get(pathKey(sourcePath));
      if (expected === undefined) {
         result.errors.push({
            setId: "unmanaged",
            file: path.basename(sourcePath),
            from: sourcePath,
            to: sourcePath,
            message: "This file is not part of the saved move plan and was left untouched.",
         });
         continue;
      }

      const move: PlannedMove = { setId: expected.setId, file: expected.file, from: sourcePath, to: expected.from };
      try {
         if (await pathExists(move.to)) {
            result.skipped.push(move);
            continue;
         }
         await callbacks.beforeMove?.(move);
         await mkdir(path.dirname(move.to), { recursive: true });
         await moveAcrossVolumes(move.from, move.to);
         callbacks.afterMove?.(move);
         result.moved.push(move);
      } catch (error: unknown) {
         result.errors.push({ ...move, message: failureMessage(error, "Unknown restore failure") });
      }
   }
   return result;
};

export const assertRecyclePlan = async (duplicatePath: string, expectedMoves: PlannedMove[], sourcePaths: string[]): Promise<void> => {
   await assertManagedFolder(duplicatePath);
   const expectedPaths = new Set(expectedMoves.map((move) => pathKey(move.to)));
   const unmanagedCount = sourcePaths.filter((sourcePath) => !expectedPaths.has(pathKey(sourcePath))).length;
   if (unmanagedCount > 0) throw new Error(`Refusing to recycle ${unmanagedCount} file(s) that are not part of the saved move plan.`);
};
