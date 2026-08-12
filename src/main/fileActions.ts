import { rm } from "node:fs/promises";
import path from "node:path";
import type { Decisions, PatchMove, PatchResult } from "../shared/types.js";
import { getDuplicateFolderFiles, getDuplicateFolderPath, getDuplicateFolderStatus, getSetting, loadGroups, setSetting } from "./database.js";
import { applyFileMoves, assertManagedFolder, assertRecyclePlan, ensureManagedFolder, restoreFileMoves } from "./fileOperations.js";

const getKnownMoves = async (decisions: Decisions | null): Promise<PatchMove[]> => {
   const groups = await loadGroups();
   const scanRoot = getSetting("scan_root");
   const duplicatePath = getDuplicateFolderPath();
   if (scanRoot === null || duplicatePath === null) return [];

   const moves: PatchMove[] = [];
   for (const group of groups) {
      const decision = decisions?.[group.id];
      if (decisions !== null && decision?.seen !== true) continue;
      const deletedImages = decisions === null ? null : new Set(decision?.deletedImages ?? []);
      for (const image of group.images) {
         if (deletedImages !== null && !deletedImages.has(image.originalPath)) continue;
         const relativePath = path.relative(scanRoot, image.originalPath);
         const safeRelativePath = relativePath.startsWith("..") || path.isAbsolute(relativePath) ? image.file : relativePath;
         moves.push({
            groupId: group.id,
            file: image.file,
            from: image.originalPath,
            to: path.join(duplicatePath, group.id, safeRelativePath),
         });
      }
   }
   return moves;
};

export const getDeleteMoves = async (decisions: Decisions): Promise<PatchMove[]> => getKnownMoves(decisions);

export const applyDecisions = async (decisions: Decisions): Promise<PatchResult> => {
   const moves = await getDeleteMoves(decisions);
   const duplicatePath = getDuplicateFolderPath();
   if (moves.length > 0 && duplicatePath !== null) await ensureManagedFolder(duplicatePath);
   const result = await applyFileMoves(moves);
   if (result.moved.length > 0) setSetting("last_file_action", "moved");
   return result;
};

export const restoreDuplicateFolder = async (): Promise<PatchResult> => {
   const duplicatePath = getDuplicateFolderPath();
   if (duplicatePath === null) throw new Error("No duplicate folder is available");
   await assertManagedFolder(duplicatePath);
   const expectedMoves = await getKnownMoves(null);
   const result = await restoreFileMoves(expectedMoves, await getDuplicateFolderFiles());

   if (!(await getDuplicateFolderStatus())) await rm(duplicatePath, { recursive: true, force: true });
   if (result.moved.length > 0) setSetting("last_file_action", "restored");
   return result;
};

export const assertDuplicateFolderCanBeRecycled = async (): Promise<string> => {
   const duplicatePath = getDuplicateFolderPath();
   if (duplicatePath === null) throw new Error("No duplicate folder is available");
   await assertRecyclePlan(duplicatePath, await getKnownMoves(null), await getDuplicateFolderFiles());
   return duplicatePath;
};
