import { app } from "electron";
import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { duplicateContainerFolderName, managedDuplicateFolderName } from "../shared/constants.js";
import type { Decisions, FileActionStatus, ImageItem, ImageSet, LoadDataResult, PlannedMove } from "../shared/types.js";
import { createPreviewUrl, resetPreviewAccess } from "./previewProtocol.js";
import { collectManagedFolderFiles, isMissingPathError } from "./fileOperations.js";
import type { GroupedImages } from "./scanner.js";
import type { ScannedImage } from "./scanner.js";
import { reconcileDecisions } from "../shared/reconcileDecisions.js";

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
   modifiedAt: number;
   changedAt: number;
}
interface DecisionRow {
   setId: string;
   deletedImagesJson: string;
}

export interface MoveRecord extends PlannedMove {
   checksum: string;
   status: "pending" | "moved" | "restored" | "recycled";
}

let database: DatabaseSync | null = null;
let scanMembership: Map<string, Set<string>> | null = null;

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
         size INTEGER NOT NULL, modified_at REAL NOT NULL, changed_at REAL NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS decisions (
         set_id TEXT PRIMARY KEY REFERENCES duplicate_groups(id) ON DELETE CASCADE,
         deleted_images_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS file_moves (
         original_path TEXT PRIMARY KEY, set_id TEXT NOT NULL, file_name TEXT NOT NULL,
         destination_path TEXT NOT NULL, checksum TEXT NOT NULL, status TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS image_inventory (
         original_path TEXT PRIMARY KEY, file_name TEXT NOT NULL, hash TEXT NOT NULL,
         width INTEGER NOT NULL, height INTEGER NOT NULL, size INTEGER NOT NULL, modified_at REAL NOT NULL, changed_at REAL NOT NULL DEFAULT 0
      );
   `);
   for (const table of ["images", "image_inventory"]) {
      const fields = database.prepare(`PRAGMA table_info(${table})`).all() as unknown as { name: string }[];
      if (!fields.some((field) => field.name === "changed_at")) database.exec(`ALTER TABLE ${table} ADD COLUMN changed_at REAL NOT NULL DEFAULT 0`);
   }
   const columns = database.prepare("PRAGMA table_info(decisions)").all() as unknown as { name: string }[];
   if (columns.some((column) => column.name === "seen")) {
      // Old empty records only established visits, not explicit keep-all intent.
      const rows = database.prepare("SELECT set_id AS setId, deleted_images_json AS deletedImagesJson FROM decisions").all() as unknown as DecisionRow[];
      database.exec("BEGIN IMMEDIATE");
      try {
         database.exec(
            "DROP TABLE decisions; CREATE TABLE decisions (set_id TEXT PRIMARY KEY REFERENCES duplicate_groups(id) ON DELETE CASCADE, deleted_images_json TEXT NOT NULL);"
         );
         const insert = database.prepare("INSERT INTO decisions VALUES (?, ?)");
         for (const row of rows) {
            const candidates = parseStringArray(row.deletedImagesJson);
            if (candidates.length > 0) insert.run(row.setId, JSON.stringify(candidates));
         }
         database.exec("COMMIT");
      } catch (error: unknown) {
         database.exec("ROLLBACK");
         throw error;
      }
   }
   return database;
};

export const closeDatabase = (): void => {
   database?.close();
   database = null;
   scanMembership = null;
};

export const getSetting = (key: string): string | null => {
   const row = getDatabase().prepare("SELECT value FROM settings WHERE key = ?").get(key) as SettingRow | undefined;
   return row?.value ?? null;
};

export const setSetting = (key: string, value: string): void => {
   getDatabase().prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
};

export const getScanId = (): string => {
   const existing = getSetting("scan_id");
   if (existing !== null) return existing;
   const id = randomUUID();
   setSetting("scan_id", id);
   return id;
};

export const assertScanId = (scanId: unknown): void => {
   if (typeof scanId !== "string" || scanId !== getScanId()) throw new Error("The scan changed. Reload the review before saving or moving images.");
};

export const saveScan = (
   rootPath: string,
   groups: GroupedImages[],
   warnings: { count: number; paths: string[] } = { count: 0, paths: [] },
   inventory: ScannedImage[] = groups.flatMap((group) => group.images)
): void => {
   const db = getDatabase();
   const sameRoot = getSetting("scan_root") === rootPath;
   const previousRows = db
      .prepare("SELECT set_id AS setId, original_path AS originalPath, size, modified_at AS modifiedAt, changed_at AS changedAt FROM images")
      .all() as unknown as Pick<ImageRow, "setId" | "originalPath" | "size" | "modifiedAt" | "changedAt">[];
   const previousGroups = new Map<string, typeof previousRows>();
   for (const row of previousRows) {
      const images = previousGroups.get(row.setId);
      if (images === undefined) previousGroups.set(row.setId, [row]);
      else images.push(row);
   }
   const nextGroups = groups.map((group, index) => ({ id: `set_${String(index + 1).padStart(3, "0")}`, images: group.images }));
   const retained = sameRoot
      ? reconcileDecisions(
           [...previousGroups].map(([id, images]) => ({ id, images })),
           nextGroups,
           loadDecisions()
        )
      : {};
   const anchor = previousGroups.get(getSetting("current_set_id") ?? "")?.[0]?.originalPath;
   const currentSetId =
      sameRoot && anchor !== undefined ? nextGroups.find((group) => group.images.some((image) => image.originalPath === anchor))?.id : undefined;
   const insertGroup = db.prepare("INSERT INTO duplicate_groups (id, similarity, sort_index, folder_path) VALUES (?, ?, ?, ?)");
   const insertImage = db.prepare(
      "INSERT INTO images (original_path, set_id, file_name, hash, width, height, size, modified_at, changed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
   );

   db.exec("BEGIN IMMEDIATE");
   try {
      db.exec("DELETE FROM decisions; DELETE FROM images; DELETE FROM duplicate_groups;");
      db.exec("DELETE FROM file_moves;");
      db.exec("DELETE FROM image_inventory;");
      groups.forEach((group, index) => {
         const setId = `set_${String(index + 1).padStart(3, "0")}`;
         insertGroup.run(setId, group.similarity, index, rootPath);
         for (const image of group.images) {
            insertImage.run(image.originalPath, setId, image.file, image.hash, image.width, image.height, image.size, image.modifiedAt, image.changedAt);
         }
      });
      const insertInventory = db.prepare("INSERT INTO image_inventory VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
      for (const image of inventory)
         insertInventory.run(image.originalPath, image.file, image.hash, image.width, image.height, image.size, image.modifiedAt, image.changedAt);
      const insertDecision = db.prepare("INSERT INTO decisions VALUES (?, ?)");
      for (const [id, decision] of Object.entries(retained)) insertDecision.run(id, JSON.stringify(decision.deletedImages));
      setSetting("scan_root", rootPath);
      setSetting("scan_id", randomUUID());
      setSetting("move_journal_version", "1");
      setSetting("last_file_action", "idle");
      setSetting("current_set_id", currentSetId ?? (groups.length === 0 ? "" : "set_001"));
      setSetting("hash_version", "dhash64-v1");
      setSetting("scan_warning_count", String(warnings.count));
      setSetting("scan_warning_paths", JSON.stringify(warnings.paths));
      db.exec("COMMIT");
      scanMembership = null;
      if (!sameRoot) resetPreviewAccess();
   } catch (error: unknown) {
      db.exec("ROLLBACK");
      throw error;
   }
};

export const loadImageInventory = (): ScannedImage[] =>
   getSetting("hash_version") !== "dhash64-v1"
      ? []
      : (getDatabase()
           .prepare(
              "SELECT original_path AS originalPath, file_name AS file, hash, width, height, size, modified_at AS modifiedAt, changed_at AS changedAt FROM image_inventory"
           )
           .all() as unknown as ScannedImage[]);

export const loadMoveRecords = (): MoveRecord[] =>
   getDatabase()
      .prepare('SELECT original_path AS "from", destination_path AS "to", set_id AS setId, file_name AS file, checksum, status FROM file_moves')
      .all() as unknown as MoveRecord[];

export const recordPendingMove = (move: PlannedMove, checksum: string): void => {
   getDatabase()
      .prepare(
         "INSERT INTO file_moves (original_path, set_id, file_name, destination_path, checksum, status) VALUES (?, ?, ?, ?, ?, 'pending') " +
            "ON CONFLICT(original_path) DO UPDATE SET set_id = excluded.set_id, file_name = excluded.file_name, destination_path = excluded.destination_path, checksum = excluded.checksum, status = 'pending'"
      )
      .run(move.from, move.setId, move.file, move.to, checksum);
};

export const updateMoveStatus = (originalPath: string, status: MoveRecord["status"]): void => {
   getDatabase().prepare("UPDATE file_moves SET status = ? WHERE original_path = ?").run(status, originalPath);
};

export const loadMovePlan = (decisions: Decisions | null): PlannedMove[] => {
   const scanRoot = getSetting("scan_root");
   const duplicatePath = getDuplicateFolderPath();
   if (scanRoot === null || duplicatePath === null) return [];
   const rows = getDatabase()
      .prepare("SELECT set_id AS setId, file_name AS file, original_path AS originalPath, size, modified_at AS modifiedAt, changed_at AS changedAt FROM images")
      .all() as unknown as Pick<ImageRow, "setId" | "file" | "originalPath" | "size" | "modifiedAt" | "changedAt">[];
   const selectedBySet = decisions === null ? null : new Map(Object.entries(decisions).map(([setId, decision]) => [setId, new Set(decision.deletedImages)]));
   return rows.flatMap((row) => {
      if (selectedBySet !== null && selectedBySet.get(row.setId)?.has(row.originalPath) !== true) return [];
      const relative = path.relative(scanRoot, row.originalPath);
      if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("A saved image is outside the scan folder.");
      return [
         {
            setId: row.setId,
            file: row.file,
            from: row.originalPath,
            to: path.join(duplicatePath, row.setId, relative),
            expectedSource: { size: row.size, modifiedAt: row.modifiedAt, ...(row.changedAt === 0 ? {} : { changedAt: row.changedAt }) },
         },
      ];
   });
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
   const rows = getDatabase().prepare("SELECT set_id AS setId, deleted_images_json AS deletedImagesJson FROM decisions").all() as unknown as DecisionRow[];
   return Object.fromEntries(rows.map((row) => [row.setId, { deletedImages: parseStringArray(row.deletedImagesJson) }]));
};

export const saveDecisions = (decisions: Decisions): void => {
   const db = getDatabase();
   if (scanMembership === null) {
      const imageRows = db.prepare("SELECT set_id, original_path FROM images").all() as unknown as { set_id: string; original_path: string }[];
      scanMembership = new Map();
      for (const row of imageRows) {
         const paths = scanMembership.get(row.set_id);
         if (paths === undefined) scanMembership.set(row.set_id, new Set([row.original_path]));
         else paths.add(row.original_path);
      }
   }
   for (const [setId, decision] of Object.entries(decisions)) {
      const paths = scanMembership.get(setId);
      if (paths === undefined || decision.deletedImages.some((candidate) => !paths.has(candidate)))
         throw new Error("The review contains unknown sets or images.");
   }
   const existingRows = db.prepare("SELECT set_id, deleted_images_json FROM decisions").all() as unknown as {
      set_id: string;
      deleted_images_json: string;
   }[];
   const existing = new Map(existingRows.map((row) => [row.set_id, row]));
   const upsert = db.prepare(
      "INSERT INTO decisions (set_id, deleted_images_json) VALUES (?, ?) " +
         "ON CONFLICT(set_id) DO UPDATE SET deleted_images_json = excluded.deleted_images_json"
   );

   db.exec("BEGIN IMMEDIATE");
   try {
      const seenIds = new Set<string>();
      for (const [setId, decision] of Object.entries(decisions)) {
         seenIds.add(setId);
         const serialized = JSON.stringify(decision.deletedImages);
         const row = existing.get(setId);
         if (row?.deleted_images_json === serialized) continue;
         upsert.run(setId, serialized);
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

const statFile = async (filePath: string) =>
   stat(filePath)
      .then((value) => (value.isFile() ? value : null))
      .catch((error: unknown) => {
         if (isMissingPathError(error)) return null;
         throw error;
      });

const findMovedPath = async (row: ImageRow, scanRoot: string | null): Promise<string | null> => {
   if (scanRoot === null) return null;
   const relativePath = path.relative(scanRoot, row.originalPath);
   const safeRelativePath = relativePath === ".." || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath) ? row.file : relativePath;
   const movedPath = path.join(scanRoot, duplicateContainerFolderName, managedDuplicateFolderName, row.setId, safeRelativePath);
   return (await statFile(movedPath)) === null ? null : movedPath;
};

const buildImageItem = async (
   row: ImageRow,
   decisions: Decisions,
   scanRoot: string | null,
   lastFileAction: FileActionStatus,
   moveStatus: MoveRecord["status"] | undefined,
   legacyJournal: boolean
): Promise<ImageItem> => {
   const sourceStat = await statFile(row.originalPath);
   const exists = sourceStat !== null;
   const movedPath = await findMovedPath(row, scanRoot);
   const wasRecycledByApp =
      movedPath === null &&
      (moveStatus === "recycled" ||
         (legacyJournal && lastFileAction === "recycled" && decisions[row.setId]?.deletedImages.includes(row.originalPath) === true));
   const previewPath = movedPath ?? row.originalPath;
   const previewStat = movedPath === null ? sourceStat : await statFile(movedPath);
   const previewRevision = previewStat === null ? "missing" : `${previewStat.size}-${previewStat.mtimeMs}-${previewStat.ctimeMs}`;
   return {
      file: row.file,
      originalPath: row.originalPath,
      currentPath: previewPath,
      folderPath: path.dirname(previewPath),
      hash: row.hash,
      width: row.width,
      height: row.height,
      size: row.size,
      modifiedAt: row.modifiedAt,
      changedAt: row.changedAt,
      previewUrl: createPreviewUrl(previewPath, "thumbnail", previewRevision),
      fullPreviewUrl: createPreviewUrl(previewPath, "full", previewRevision),
      exists,
      sourceStatus: movedPath !== null ? "movedByApp" : exists ? "available" : wasRecycledByApp ? "recycledByApp" : "missing",
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
      .prepare(
         "SELECT set_id AS setId, file_name AS file, original_path AS originalPath, hash, width, height, size, modified_at AS modifiedAt, changed_at AS changedAt FROM images ORDER BY set_id, original_path"
      )
      .all() as unknown as ImageRow[];

   const moveStatuses = new Map(loadMoveRecords().map((record) => [record.from, record.status]));
   const legacyJournal = getSetting("move_journal_version") === null;
   const items = await mapWithConcurrency(imageRows, 64, (row) =>
      buildImageItem(row, decisions, scanRoot, lastFileAction, moveStatuses.get(row.originalPath), legacyJournal)
   );
   const imagesBySet = new Map<string, ImageItem[]>();
   imageRows.forEach((row, index) => {
      const item = items[index];
      if (item === undefined) return;
      const images = imagesBySet.get(row.setId);
      if (images === undefined) imagesBySet.set(row.setId, [item]);
      else images.push(item);
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
   const savedSetId = getSetting("current_set_id");
   return {
      scanId: getScanId(),
      groups,
      decisions,
      scanRoot,
      duplicateFolderPath: getDuplicateFolderPath(),
      currentSetId: savedSetId !== null && groups.some((group) => group.id === savedSetId) ? savedSetId : (groups[0]?.id ?? null),
      duplicateFolderHasContent: await getDuplicateFolderStatus(),
      lastFileAction,
      scanWarningCount: Number(getSetting("scan_warning_count") ?? 0),
      scanWarningPaths: parseStringArray(getSetting("scan_warning_paths") ?? "[]"),
   };
};
