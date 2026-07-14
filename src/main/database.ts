import { app } from "electron";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Decisions, FileActionStatus, ImageItem, ImageSet, LoadDataResult } from "../shared/types.js";
import { createPreviewUrl, resetPreviewAccess } from "./previewProtocol.js";
import type { GroupedImages } from "./scanner.js";

interface SettingRow {
   value: string;
}
interface GroupRow {
   id: string;
   similarity: number;
   folderPath: string;
}
interface ImageRow {
   groupId: string;
   file: string;
   originalPath: string;
   hash: string;
   width: number;
   height: number;
   size: number;
}
interface DecisionRow {
   groupId: string;
   deletedImagesJson: string;
   completed: number;
}
interface TableColumnRow {
   name: string;
}

let database: DatabaseSync | null = null;

export const getDatabase = (): DatabaseSync => {
   if (database !== null) return database;
   database = new DatabaseSync(path.join(app.getPath("userData"), "image-deduplicator.sqlite"));
   database.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS duplicate_groups (
         id TEXT PRIMARY KEY, similarity REAL NOT NULL, sort_index INTEGER NOT NULL, folder_path TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS images (
         original_path TEXT PRIMARY KEY,
         group_id TEXT NOT NULL REFERENCES duplicate_groups(id) ON DELETE CASCADE,
         file_name TEXT NOT NULL, hash TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL,
         size INTEGER NOT NULL, modified_at REAL NOT NULL
      );
      CREATE TABLE IF NOT EXISTS decisions (
         group_id TEXT PRIMARY KEY REFERENCES duplicate_groups(id) ON DELETE CASCADE,
         deleted_images_json TEXT NOT NULL, completed INTEGER NOT NULL
      );
   `);

   const decisionColumns = new Set((database.prepare("PRAGMA table_info(decisions)").all() as unknown as TableColumnRow[]).map((column) => column.name));
   if (!decisionColumns.has("deleted_images_json") || !decisionColumns.has("completed")) {
      database.exec(`
         DROP TABLE decisions;
         CREATE TABLE decisions (
            group_id TEXT PRIMARY KEY REFERENCES duplicate_groups(id) ON DELETE CASCADE,
            deleted_images_json TEXT NOT NULL, completed INTEGER NOT NULL
         );
      `);
   }
   return database;
};

export const closeDatabase = (): void => {
   database?.close();
   database = null;
};

export const getSetting = (key: string): string | null => {
   const row = getDatabase().prepare("SELECT value FROM settings WHERE key = ?").get(key) as SettingRow | undefined;
   return row?.value ?? null;
};

export const setSetting = (key: string, value: string): void => {
   getDatabase().prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
};

export const saveScan = (rootPath: string, includeSubfolders: boolean, groups: GroupedImages[]): void => {
   const db = getDatabase();
   const insertGroup = db.prepare("INSERT INTO duplicate_groups (id, similarity, sort_index, folder_path) VALUES (?, ?, ?, ?)");
   const insertImage = db.prepare(
      "INSERT INTO images (original_path, group_id, file_name, hash, width, height, size, modified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
   );

   db.exec("BEGIN IMMEDIATE");
   try {
      db.exec("DELETE FROM decisions; DELETE FROM images; DELETE FROM duplicate_groups;");
      groups.forEach((group, index) => {
         const groupId = `detection_${String(index + 1).padStart(3, "0")}`;
         insertGroup.run(groupId, group.similarity, index, rootPath);
         for (const image of group.images) {
            insertImage.run(image.originalPath, groupId, image.file, image.hash, image.width, image.height, image.size, image.modifiedAt);
         }
      });
      setSetting("scan_root", rootPath);
      setSetting("include_subfolders", includeSubfolders ? "1" : "0");
      setSetting("last_file_action", "idle");
      db.exec("COMMIT");
   } catch (error: unknown) {
      db.exec("ROLLBACK");
      throw error;
   }
};

const parseStringArray = (value: string): string[] => {
   try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
   } catch {
      return [];
   }
};

export const loadDecisions = (): Decisions => {
   const rows = getDatabase()
      .prepare("SELECT group_id AS groupId, deleted_images_json AS deletedImagesJson, completed FROM decisions")
      .all() as unknown as DecisionRow[];
   return Object.fromEntries(rows.map((row) => [row.groupId, { deletedImages: parseStringArray(row.deletedImagesJson), completed: row.completed === 1 }]));
};

export const saveDecisions = (decisions: Decisions): void => {
   const db = getDatabase();
   const insert = db.prepare(
      "INSERT INTO decisions (group_id, deleted_images_json, completed) VALUES (?, ?, ?) " +
         "ON CONFLICT(group_id) DO UPDATE SET deleted_images_json = excluded.deleted_images_json, completed = excluded.completed"
   );
   db.exec("BEGIN IMMEDIATE");
   try {
      db.exec("DELETE FROM decisions");
      for (const [groupId, decision] of Object.entries(decisions)) {
         insert.run(groupId, JSON.stringify(decision.deletedImages), decision.completed ? 1 : 0);
      }
      db.exec("COMMIT");
   } catch (error: unknown) {
      db.exec("ROLLBACK");
      throw error;
   }
};

export const getLastFileAction = (): FileActionStatus => {
   const value = getSetting("last_file_action");
   return value === "moved" || value === "restored" || value === "recycled" ? value : "idle";
};

export const getDuplicateFolderPath = (): string | null => {
   const scanRoot = getSetting("scan_root");
   return scanRoot === null ? null : path.join(scanRoot, "duplicate");
};

const findMovedPath = async (row: ImageRow, decisions: Decisions, scanRoot: string | null): Promise<string | null> => {
   const decision = decisions[row.groupId];
   if (scanRoot === null || decision === undefined || !decision.completed || !decision.deletedImages.includes(row.originalPath)) return null;
   const relativePath = path.relative(scanRoot, row.originalPath);
   const safeRelativePath = relativePath.startsWith("..") || path.isAbsolute(relativePath) ? row.file : relativePath;
   const movedPath = path.join(scanRoot, "duplicate", row.groupId, safeRelativePath);
   const movedFile = path.parse(movedPath);
   return readdir(movedFile.dir)
      .then((entries) => {
         const entry = entries.find((candidateEntry) => {
            const candidate = path.parse(candidateEntry);
            return candidate.base === movedFile.base || (candidate.ext === movedFile.ext && candidate.name.startsWith(`${movedFile.name}-`));
         });
         return entry === undefined ? null : path.join(movedFile.dir, entry);
      })
      .catch(() => null);
};

export const loadGroups = async (
   decisions = loadDecisions(),
   scanRoot = getSetting("scan_root"),
   lastFileAction = getLastFileAction()
): Promise<ImageSet[]> => {
   const groupRows = getDatabase()
      .prepare("SELECT id, similarity, folder_path AS folderPath FROM duplicate_groups ORDER BY sort_index")
      .all() as unknown as GroupRow[];
   const imageRows = getDatabase()
      .prepare(
         "SELECT group_id AS groupId, file_name AS file, original_path AS originalPath, hash, width, height, size FROM images ORDER BY group_id, original_path"
      )
      .all() as unknown as ImageRow[];
   const imagesByGroup = new Map<string, ImageItem[]>();
   resetPreviewAccess();

   await Promise.all(
      imageRows.map(async (row) => {
         const exists = await stat(row.originalPath)
            .then(() => true)
            .catch(() => false);
         const movedPath = exists ? null : await findMovedPath(row, decisions, scanRoot);
         const wasRecycledByApp =
            movedPath === null &&
            lastFileAction === "recycled" &&
            decisions[row.groupId]?.completed === true &&
            decisions[row.groupId]?.deletedImages.includes(row.originalPath) === true;
         const item: ImageItem = {
            file: row.file,
            originalPath: row.originalPath,
            hash: row.hash,
            width: row.width,
            height: row.height,
            size: row.size,
            previewUrl: createPreviewUrl(movedPath ?? row.originalPath),
            exists,
            sourceStatus: exists ? "available" : movedPath !== null ? "movedByApp" : wasRecycledByApp ? "recycledByApp" : "missing",
         };
         imagesByGroup.set(row.groupId, [...(imagesByGroup.get(row.groupId) ?? []), item]);
      })
   );

   return groupRows.map((row) => ({ ...row, images: imagesByGroup.get(row.id) ?? [] }));
};

const collectFiles = async (rootPath: string): Promise<string[]> => {
   const entries = await readdir(rootPath, { withFileTypes: true }).catch(() => []);
   const files: string[] = [];
   for (const entry of entries) {
      const entryPath = path.join(rootPath, entry.name);
      if (entry.isDirectory()) files.push(...(await collectFiles(entryPath)));
      else if (entry.isFile()) files.push(entryPath);
   }
   return files;
};

export const getDuplicateFolderFiles = async (): Promise<string[]> => {
   const duplicatePath = getDuplicateFolderPath();
   return duplicatePath === null ? [] : collectFiles(duplicatePath);
};

export const getDuplicateFolderStatus = async (): Promise<boolean> => (await getDuplicateFolderFiles()).length > 0;

export const getLoadResult = async (): Promise<LoadDataResult> => {
   const decisions = loadDecisions();
   const scanRoot = getSetting("scan_root");
   const lastFileAction = getLastFileAction();
   return {
      groups: await loadGroups(decisions, scanRoot, lastFileAction),
      decisions,
      scanRoot,
      includeSubfolders: getSetting("include_subfolders") === "1",
      duplicateFolderHasContent: await getDuplicateFolderStatus(),
      lastFileAction,
   };
};
