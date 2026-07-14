import { copyFile, mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { Decisions, PatchMove, PatchResult } from "../shared/types.js";
import { isObject } from "../shared/schema.js";
import { getDuplicateFolderFiles, getDuplicateFolderPath, getDuplicateFolderStatus, getSetting, loadGroups, setSetting } from "./database.js";

const getAvailableDestination = async (destination: string): Promise<string> => {
   const parsed = path.parse(destination);
   for (let attempt = 0; attempt < 10_000; attempt += 1) {
      const candidate = attempt === 0 ? destination : path.join(parsed.dir, `${parsed.name}-${attempt + 1}${parsed.ext}`);
      if (
         !(await stat(candidate)
            .then(() => true)
            .catch(() => false))
      )
         return candidate;
   }
   throw new Error(`Could not find an available destination for ${destination}`);
};

const moveAcrossVolumes = async (source: string, destination: string): Promise<void> => {
   await rename(source, destination).catch(async (error: unknown) => {
      if (isObject(error) && error["code"] === "EXDEV") {
         await copyFile(source, destination);
         await rm(source);
         return;
      }
      throw error;
   });
};

const moveFileSafely = async (move: PatchMove): Promise<"moved" | "skipped"> => {
   if (
      !(await stat(move.from)
         .then(() => true)
         .catch(() => false))
   )
      return "skipped";
   await mkdir(path.dirname(move.to), { recursive: true });
   await moveAcrossVolumes(move.from, await getAvailableDestination(move.to));
   return "moved";
};

const getDeleteMoves = async (decisions: Decisions): Promise<PatchMove[]> => {
   const groups = await loadGroups();
   const scanRoot = getSetting("scan_root");
   if (scanRoot === null) return [];

   const moves: PatchMove[] = [];
   for (const group of groups) {
      const decision = decisions[group.id];
      if (decision?.completed !== true) continue;
      const deletedImages = new Set(decision.deletedImages);
      for (const image of group.images) {
         if (!deletedImages.has(image.originalPath)) continue;
         const relativePath = path.relative(scanRoot, image.originalPath);
         const safeRelativePath = relativePath.startsWith("..") || path.isAbsolute(relativePath) ? image.file : relativePath;
         moves.push({
            groupId: group.id,
            file: image.file,
            from: image.originalPath,
            to: path.join(scanRoot, "duplicate", group.id, safeRelativePath),
         });
      }
   }
   return moves;
};

export const applyDecisions = async (decisions: Decisions): Promise<PatchResult> => {
   const result: PatchResult = { moved: [], skipped: [], errors: [] };
   for (const move of await getDeleteMoves(decisions)) {
      try {
         result[await moveFileSafely(move)].push(move);
      } catch (error: unknown) {
         result.errors.push({ ...move, message: error instanceof Error ? error.message : "Unknown move failure" });
      }
   }
   if (result.moved.length > 0) setSetting("last_file_action", "moved");
   return result;
};

export const restoreDuplicateFolder = async (): Promise<PatchResult> => {
   const scanRoot = getSetting("scan_root");
   const duplicatePath = getDuplicateFolderPath();
   if (scanRoot === null || duplicatePath === null) throw new Error("No duplicate folder is available");

   const result: PatchResult = { moved: [], skipped: [], errors: [] };
   for (const sourcePath of await getDuplicateFolderFiles()) {
      const relativeParts = path.relative(duplicatePath, sourcePath).split(path.sep);
      const groupId = relativeParts.shift();
      if (groupId === undefined || relativeParts.length === 0) continue;

      const destination = path.join(scanRoot, ...relativeParts);
      const move: PatchMove = { groupId, file: path.basename(sourcePath), from: sourcePath, to: destination };
      if (
         await stat(destination)
            .then(() => true)
            .catch(() => false)
      ) {
         result.skipped.push(move);
         continue;
      }

      try {
         await mkdir(path.dirname(destination), { recursive: true });
         await moveAcrossVolumes(sourcePath, destination);
         result.moved.push(move);
      } catch (error: unknown) {
         result.errors.push({ ...move, message: error instanceof Error ? error.message : "Unknown restore failure" });
      }
   }

   if (!(await getDuplicateFolderStatus())) await rm(duplicatePath, { recursive: true, force: true });
   if (result.moved.length > 0) setSetting("last_file_action", "restored");
   return result;
};
