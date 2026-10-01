import { rm, rmdir } from "node:fs/promises";
import path from "node:path";
import type { Decisions, MoveResult, PlannedMove } from "../shared/types.js";
import {
   getDuplicateFolderFiles,
   getDuplicateFolderPath,
   getDuplicateFolderStatus,
   getSetting,
   loadMovePlan,
   loadMoveRecords,
   recordPendingMove,
   setSetting,
   updateMoveStatus,
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

const activeMoveRecords = () => loadMoveRecords().filter((record) => record.status === "pending" || record.status === "moved");

/** Old profiles keep their existing recovery route; every new move is journalled before touching a file. */
const recoveryPlan = (): PlannedMove[] => {
   const records = activeMoveRecords();
   return getSetting("move_journal_version") === null ? [...loadMovePlan(null), ...records] : records;
};

const moveChecksums = () => new Map(activeMoveRecords().map((record) => [record.to, record.checksum]));
const assertMoveContents = async (destination: string, checksums: Map<string, string>, allowLegacyRestore = false): Promise<void> => {
   const checksum = checksums.get(destination);
   if (checksum === undefined) {
      if (allowLegacyRestore && getSetting("move_journal_version") === null) return;
      throw new Error("This file has no saved move record and was left untouched. Restore older moved images to let the library update.");
   }
   if ((await fileChecksum(destination)) !== checksum) throw new Error(`The file in the duplicate folder changed and was left untouched: ${destination}`);
};

const assertManagedLocation = async (duplicatePath: string): Promise<void> => {
   const scanRoot = getSetting("scan_root");
   if (scanRoot === null) throw new Error("No scan folder is available");
   await assertPathWithinRoot(scanRoot, duplicatePath);
};

export const moveMarkedImages = async (decisions: Decisions): Promise<MoveResult> => {
   const moves = loadMovePlan(decisions);
   const duplicatePath = getDuplicateFolderPath();
   if (moves.length > 0 && duplicatePath !== null) {
      await assertManagedLocation(duplicatePath);
      await ensureManagedFolder(duplicatePath);
   }
   const result = await applyFileMoves(moves, {
      beforeMove: async (move) => {
         const scanRoot = getSetting("scan_root");
         if (scanRoot === null) throw new Error("No scan folder is available");
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
   const duplicatePath = getDuplicateFolderPath();
   if (duplicatePath === null) throw new Error("No duplicate folder is available");
   await assertManagedLocation(duplicatePath);
   await assertManagedFolder(duplicatePath);
   const scanRoot = getSetting("scan_root");
   if (scanRoot === null) throw new Error("No scan folder is available");
   const checksums = moveChecksums();
   const result = await restoreFileMoves(recoveryPlan(), await getDuplicateFolderFiles(), {
      beforeMove: async (move) => {
         await assertPathWithinRoot(scanRoot, move.from);
         await assertPathWithinRoot(scanRoot, move.to);
         await assertMoveContents(move.from, checksums, true);
      },
      afterMove: (move) => updateMoveStatus(move.to, "restored"),
   });
   if (!(await getDuplicateFolderStatus())) {
      await rm(duplicatePath, { recursive: true, force: true });
      await rmdir(path.dirname(duplicatePath)).catch(() => undefined);
   }
   if (result.moved.length > 0) setSetting("last_file_action", "restored");
   return result;
};

export const assertDuplicateFolderCanBeRecycled = async (): Promise<{ path: string; originalPaths: string[] }> => {
   const duplicatePath = getDuplicateFolderPath();
   if (duplicatePath === null) throw new Error("No duplicate folder is available");
   await assertManagedLocation(duplicatePath);
   const sourcePaths = await getDuplicateFolderFiles();
   await assertRecyclePlan(duplicatePath, recoveryPlan(), sourcePaths);
   const checksums = moveChecksums();
   for (const sourcePath of sourcePaths) await assertMoveContents(sourcePath, checksums);
   const destinations = new Set(sourcePaths);
   return {
      path: duplicatePath,
      originalPaths: activeMoveRecords()
         .filter((record) => destinations.has(record.to))
         .map((record) => record.from),
   };
};

export const recordRecycledMoves = (originalPaths: string[]): void => {
   for (const originalPath of originalPaths) updateMoveStatus(originalPath, "recycled");
   setSetting("last_file_action", "recycled");
};
