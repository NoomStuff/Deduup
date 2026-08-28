import { app } from "electron";
import { stat } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { duplicateContainerFolderName, managedDuplicateFolderName } from "../shared/constants.js";
import type { Decisions, FileActionStatus, ImageItem, ImageSet, LoadDataResult } from "../shared/types.js";
import { createPreviewUrl, resetPreviewAccess } from "./previewProtocol.js";
import { collectManagedFolderFiles } from "./fileOperations.js";
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
   setId: string;
   file: string;
   originalPath: string;
   hash: string;
   width: number;
   height: number;
   size: number;
}
interface DecisionRow {
   setId: string;
   deletedImagesJson: string;
   seen: number;
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
         set_id TEXT NOT NULL REFERENCES duplicate_groups(id) ON DELETE CASCADE,
         file_name TEXT NOT NULL, hash TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL,
         size INTEGER NOT NULL, modified_at REAL NOT NULL
      );
      CREATE TABLE IF NOT EXISTS decisions (
         set_id TEXT PRIMARY KEY REFERENCES duplicate_groups(id) ON DELETE CASCADE,
         deleted_images_json TEXT NOT NULL, seen INTEGER NOT NULL
      );
   `);

   migrateColumns();
   return database;
};

const tableColumns = (table: string): Set<string> =>
   new Set((getDatabase().prepare(`PRAGMA table_info(${table})`).all() as unknown as TableColumnRow[]).map((column) => column.name));

const migrateColumns = (): void => {
   if (database === null) return;
   database.exec("PRAGMA foreign_keys = OFF");
   try {
      const imageColumns = tableColumns("images");
      if (imageColumns.has("group_id") && !imageColumns.has("set_id")) {
         database.exec("ALTER TABLE images RENAME COLUMN group_id TO set_id");
      }

      const decisionColumns = tableColumns("decisions");
      if (decisionColumns.has("group_id") && !decisionColumns.has("set_id")) {
         database.exec("ALTER TABLE decisions RENAME COLUMN group_id TO set_id");
      }
      if (decisionColumns.has("deleted_images_json") && decisionColumns.has("completed") && !decisionColumns.has("seen")) {
         database.exec("ALTER TABLE decisions RENAME COLUMN completed TO seen");
      } else if (!decisionColumns.has("deleted_images_json") || !decisionColumns.has("seen")) {
         database.exec(`
            DROP TABLE decisions;
            CREATE TABLE decisions (
               set_id TEXT PRIMARY KEY REFERENCES duplicate_groups(id) ON DELETE CASCADE,
               deleted_images_json TEXT NOT NULL, seen INTEGER NOT NULL
            );
         `);
      }
   } finally {
      database.exec("PRAGMA foreign_keys = ON");
   }
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

export const saveScan = (rootPath: string, groups: GroupedImages[]): void => {
   const db = getDatabase();
   const insertGroup = db.prepare("INSERT INTO duplicate_groups (id, similarity, sort_index, folder_path) VALUES (?, ?, ?, ?)");
   const insertImage = db.prepare(
      "INSERT INTO images (original_path, set_id, file_name, hash, width, height, size, modified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
   );

   db.exec("BEGIN IMMEDIATE");
   try {
      db.exec("DELETE FROM decisions; DELETE FROM images; DELETE FROM duplicate_groups;");
      groups.forEach((group, index) => {
         const setId = `set_${String(index + 1).padStart(3, "0")}`;
         insertGroup.run(setId, group.similarity, index, rootPath);
         for (const image of group.images) {
            insertImage.run(image.originalPath, setId, image.file, image.hash, image.width, image.height, image.size, image.modifiedAt);
         }
      });
      setSetting("scan_root", rootPath);
      setSetting("last_file_action", "idle");
      setSetting("current_set_id", groups.length === 0 ? "" : "set_001");
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
      .prepare("SELECT set_id AS setId, deleted_images_json AS deletedImagesJson, seen FROM decisions")
      .all() as unknown as DecisionRow[];
   return Object.fromEntries(rows.map((row) => [row.setId, { deletedImages: parseStringArray(row.deletedImagesJson), seen: row.seen === 1 }]));
};

export const saveDecisions = (decisions: Decisions): void => {
   const db = getDatabase();
   const existingRows = db.prepare("SELECT set_id, deleted_images_json, seen FROM decisions").all() as unknown as {
      set_id: string;
      deleted_images_json: string;
      seen: number;
   }[];
   const existing = new Map(existingRows.map((row) => [row.set_id, row]));
   const upsert = db.prepare(
      "INSERT INTO decisions (set_id, deleted_images_json, seen) VALUES (?, ?, ?) " +
         "ON CONFLICT(set_id) DO UPDATE SET deleted_images_json = excluded.deleted_images_json, seen = excluded.seen"
   );

   db.exec("BEGIN IMMEDIATE");
   try {
      const seenIds = new Set<string>();
      for (const [setId, decision] of Object.entries(decisions)) {
         seenIds.add(setId);
         const serialized = JSON.stringify(decision.deletedImages);
         const row = existing.get(setId);
         if (row?.deleted_images_json === serialized && row.seen === (decision.seen ? 1 : 0)) continue;
         upsert.run(setId, serialized, decision.seen ? 1 : 0);
      }
      const remove = db.prepare("DELETE FROM decisions WHERE set_id = ?");
      for (const setId of existing.keys()) {
         if (!seenIds.has(setId)) remove.run(setId);
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
   return scanRoot === null ? null : path.join(scanRoot, duplicateContainerFolderName, managedDuplicateFolderName);
};

export const saveCurrentSetId = (setId: string): void => {
   const row = getDatabase().prepare("SELECT 1 AS value FROM duplicate_groups WHERE id = ?").get(setId) as SettingRow | undefined;
   if (row === undefined) throw new Error(`Unknown set: ${setId}`);
   setSetting("current_set_id", setId);
};

const statExists = async (filePath: string): Promise<boolean> =>
   stat(filePath)
      .then(() => true)
      .catch(() => false);

const findMovedPath = async (row: ImageRow, scanRoot: string | null): Promise<string | null> => {
   if (scanRoot === null) return null;
   const relativePath = path.relative(scanRoot, row.originalPath);
   const safeRelativePath = relativePath.startsWith("..") || path.isAbsolute(relativePath) ? row.file : relativePath;
   const movedPath = path.join(scanRoot, duplicateContainerFolderName, managedDuplicateFolderName, row.setId, safeRelativePath);
   return stat(movedPath)
      .then((value) => (value.isFile() ? movedPath : null))
      .catch(() => null);
};

const buildImageItem = async (row: ImageRow, decisions: Decisions, scanRoot: string | null, lastFileAction: FileActionStatus): Promise<ImageItem> => {
   const exists = await statExists(row.originalPath);
   const movedPath = exists ? null : await findMovedPath(row, scanRoot);
   const wasRecycledByApp =
      movedPath === null &&
      lastFileAction === "recycled" &&
      decisions[row.setId]?.seen === true &&
      decisions[row.setId]?.deletedImages.includes(row.originalPath) === true;
   const previewPath = movedPath ?? row.originalPath;
   return {
      file: row.file,
      originalPath: row.originalPath,
      currentPath: previewPath,
      folderPath: path.dirname(previewPath),
      hash: row.hash,
      width: row.width,
      height: row.height,
      size: row.size,
      previewUrl: createPreviewUrl(previewPath),
      fullPreviewUrl: createPreviewUrl(previewPath, "full"),
      exists,
      sourceStatus: exists ? "available" : movedPath !== null ? "movedByApp" : wasRecycledByApp ? "recycledByApp" : "missing",
   };
};

const mapWithConcurrency = async <T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> => {
   const results = new Array<R>(items.length);
   let nextIndex = 0;
   const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (nextIndex < items.length) {
         const index = nextIndex;
         nextIndex += 1;
         const item = items[index];
         if (item !== undefined) results[index] = await worker(item);
      }
   });
   await Promise.all(runners);
   return results;
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
      .prepare("SELECT set_id AS setId, file_name AS file, original_path AS originalPath, hash, width, height, size FROM images ORDER BY set_id, original_path")
      .all() as unknown as ImageRow[];
   resetPreviewAccess();

   const items = await mapWithConcurrency(imageRows, 64, (row) => buildImageItem(row, decisions, scanRoot, lastFileAction));
   const imagesBySet = new Map<string, ImageItem[]>();
   imageRows.forEach((row, index) => {
      const item = items[index];
      if (item === undefined) return;
      imagesBySet.set(row.setId, [...(imagesBySet.get(row.setId) ?? []), item]);
   });

   return groupRows.map((row) => ({ ...row, images: imagesBySet.get(row.id) ?? [] }));
};

export const getDuplicateFolderFiles = async (): Promise<string[]> => {
   const duplicatePath = getDuplicateFolderPath();
   return duplicatePath === null ? [] : collectManagedFolderFiles(duplicatePath);
};

export const getDuplicateFolderStatus = async (): Promise<boolean> => (await getDuplicateFolderFiles()).length > 0;

export const getLoadResult = async (): Promise<LoadDataResult> => {
   const decisions = loadDecisions();
   const scanRoot = getSetting("scan_root");
   const lastFileAction = getLastFileAction();
   const groups = await loadGroups(decisions, scanRoot, lastFileAction);
   const savedSetId = getSetting("current_set_id") ?? getSetting("current_group_id");
   return {
      groups,
      decisions,
      scanRoot,
      duplicateFolderPath: getDuplicateFolderPath(),
      currentSetId: savedSetId !== null && groups.some((group) => group.id === savedSetId) ? savedSetId : (groups[0]?.id ?? null),
      duplicateFolderHasContent: await getDuplicateFolderStatus(),
      lastFileAction,
      scanWarningCount: 0,
   };
};
