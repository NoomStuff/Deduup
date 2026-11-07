import { rm, rmdir } from "node:fs/promises";
import path from "node:path";
import type { Decisions, MoveResult } from "../shared/types.js";
import {
   getDuplicateFolderFiles,
   getSetting,
   loadMovePlan,
   loadMoveRecords,
   recordPendingMove,
   setSetting,
   updateMoveStatus,
   type MoveRecord,
} from "./database.js";
import {
   applyFileMoves,
   assertManagedFolder,
   assertPathWithinRoot,
   assertRecyclePlan,
   ensureManagedFolder,
   fileChecksum,
   restoreFileMoves,
} from "./fileOperations.js";
import { getManagedFolderPath } from "./paths.js";

/** Moves that may still have a file in the managed folder. Every move is journalled before a file is touched. */
const activeMoveRecords = (): MoveRecord[] => loadMoveRecords().filter((record) => record.status === "pending" || record.status === "moved");

const assertMoveContents = async (destination: string, checksums: Map<string, string>): Promise<void> => {
   const checksum = checksums.get(destination);
   if (checksum === undefined) throw new Error("This file has no saved move record and was left untouched.");
   if ((await fileChecksum(destination)) !== checksum) throw new Error(`The file in the duplicate folder changed and was left untouched: ${destination}`);
};

/** The scan root and its managed folder, after checking the folder really lives inside the root. */
const requireManagedLocation = async (): Promise<{ scanRoot: string; duplicatePath: string }> => {
   const scanRoot = getSetting("scan_root");
   if (scanRoot === null) throw new Error("No scan folder is available");
   const duplicatePath = getManagedFolderPath(scanRoot);
   await assertPathWithinRoot(scanRoot, duplicatePath);
   return { scanRoot, duplicatePath };
};

export const moveMarkedImages = async (decisions: Decisions): Promise<MoveResult> => {
   const moves = loadMovePlan(decisions);
   if (moves.length === 0) return { moved: [], skipped: [], errors: [] };
   const { scanRoot, duplicatePath } = await requireManagedLocation();
   await ensureManagedFolder(duplicatePath);
   const result = await applyFileMoves(moves, {
      beforeMove: async (move) => {
         await assertPathWithinRoot(scanRoot, move.from);
         await assertPathWithinRoot(scanRoot, move.to);
         recordPendingMove(move, await fileChecksum(move.from));
      },
      afterMove: (move) => updateMoveStatus(move.from, "moved"),
   });
   if (result.moved.length > 0) setSetting("last_file_action", "moved");
   return result;
};

export const restoreDuplicateFolder = async (): Promise<MoveResult> => {
   const { scanRoot, duplicatePath } = await requireManagedLocation();
   await assertManagedFolder(duplicatePath);
   const records = activeMoveRecords();
   const checksums = new Map(records.map((record) => [record.to, record.checksum]));
   const result = await restoreFileMoves(records, await getDuplicateFolderFiles(), {
      beforeMove: async (move) => {
         await assertPathWithinRoot(scanRoot, move.from);
         await assertPathWithinRoot(scanRoot, move.to);
         await assertMoveContents(move.from, checksums);
      },
      afterMove: (move) => updateMoveStatus(move.to, "restored"),
   });
   if ((await getDuplicateFolderFiles()).length === 0) {
      await rm(duplicatePath, { recursive: true, force: true });
      await rmdir(path.dirname(duplicatePath)).catch(() => undefined);
   }
   if (result.moved.length > 0) setSetting("last_file_action", "restored");
   return result;
};

export const assertDuplicateFolderCanBeRecycled = async (): Promise<{ path: string; originalPaths: string[] }> => {
   const { duplicatePath } = await requireManagedLocation();
   const records = activeMoveRecords();
   const sourcePaths = await getDuplicateFolderFiles();
   await assertRecyclePlan(duplicatePath, records, sourcePaths);
   const checksums = new Map(records.map((record) => [record.to, record.checksum]));
   for (const sourcePath of sourcePaths) await assertMoveContents(sourcePath, checksums);
   const destinations = new Set(sourcePaths);
   return { path: duplicatePath, originalPaths: records.filter((record) => destinations.has(record.to)).map((record) => record.from) };
};

export const recordRecycledMoves = (originalPaths: string[]): void => {
   for (const originalPath of originalPaths) updateMoveStatus(originalPath, "recycled");
   setSetting("last_file_action", "recycled");
};
