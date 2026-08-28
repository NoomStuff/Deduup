import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { duplicateOwnershipMarkerContents, duplicateOwnershipMarkerName } from "../shared/constants.js";
import type { MoveResult, PlannedMove } from "../shared/types.js";
import { isObject } from "../shared/schema.js";

const isMissingPathError = (error: unknown): boolean => isObject(error) && (error["code"] === "ENOENT" || error["code"] === "ENOTDIR");
const pathKey = (filePath: string): string => path.normalize(filePath).toLowerCase();
const markerPath = (duplicatePath: string): string => path.join(duplicatePath, duplicateOwnershipMarkerName);

const pathExists = async (filePath: string): Promise<boolean> => {
   try {
      await stat(filePath);
      return true;
   } catch (error: unknown) {
      if (isMissingPathError(error)) return false;
      throw error;
   }
};

const moveAcrossVolumes = async (source: string, destination: string): Promise<void> => {
   try {
      await rename(source, destination);
   } catch (error: unknown) {
      if (!isObject(error) || error["code"] !== "EXDEV") throw error;
      await copyFile(source, destination);
      await rm(source);
   }
};

const failureMessage = (error: unknown, fallback: string): string => (error instanceof Error ? error.message : fallback);

export const collectManagedFolderFiles = async (duplicatePath: string): Promise<string[]> => {
   const files: string[] = [];
   const visit = async (folderPath: string): Promise<void> => {
      for (const entry of await readdir(folderPath, { withFileTypes: true })) {
         const entryPath = path.join(folderPath, entry.name);
         if (entry.isDirectory()) await visit(entryPath);
         else if (entry.isFile() && pathKey(entryPath) !== pathKey(markerPath(duplicatePath))) files.push(entryPath);
      }
   };

   if (await pathExists(duplicatePath)) await visit(duplicatePath);
   return files;
};

export const assertManagedFolder = async (duplicatePath: string): Promise<void> => {
   let marker: string;
   try {
      marker = await readFile(markerPath(duplicatePath), "utf8");
   } catch (error: unknown) {
      if (isMissingPathError(error)) throw new Error(`The managed duplicate folder is not owned by this app: ${duplicatePath}`);
      throw error;
   }
   if (marker !== duplicateOwnershipMarkerContents) throw new Error(`The managed duplicate folder is not owned by this app: ${duplicatePath}`);
};

export const ensureManagedFolder = async (duplicatePath: string): Promise<void> => {
   await mkdir(duplicatePath, { recursive: true });
   if (await pathExists(markerPath(duplicatePath))) {
      await assertManagedFolder(duplicatePath);
      return;
   }
   if ((await collectManagedFolderFiles(duplicatePath)).length > 0) {
      throw new Error(`Refusing to use a managed duplicate folder that already contains unowned files: ${duplicatePath}`);
   }
   await writeFile(markerPath(duplicatePath), duplicateOwnershipMarkerContents, { encoding: "utf8", flag: "wx" });
};

export const applyFileMoves = async (moves: PlannedMove[]): Promise<MoveResult> => {
   const result: MoveResult = { moved: [], skipped: [], errors: [] };
   for (const move of moves) {
      try {
         if (!(await pathExists(move.from))) {
            result.skipped.push(move);
            continue;
         }
         if (await pathExists(move.to)) throw new Error(`The managed destination already exists: ${move.to}`);
         await mkdir(path.dirname(move.to), { recursive: true });
         await moveAcrossVolumes(move.from, move.to);
         result.moved.push(move);
      } catch (error: unknown) {
         result.errors.push({ ...move, message: failureMessage(error, "Unknown move failure") });
      }
   }
   return result;
};

export const restoreFileMoves = async (expectedMoves: PlannedMove[], sourcePaths: string[]): Promise<MoveResult> => {
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
         await mkdir(path.dirname(move.to), { recursive: true });
         await moveAcrossVolumes(move.from, move.to);
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
