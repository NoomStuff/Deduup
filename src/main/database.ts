import { app } from "electron";
import { createHash, randomUUID } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import type { Stats } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { StatementSync } from "node:sqlite";
import type { Decisions, FileActionStatus, ImageItem, ImageSet, LoadDataResult, PlannedMove } from "../shared/types.js";
import { reconcileDecisions } from "../shared/reconcileDecisions.js";
import { collectManagedFolderFiles, isMissingPathError } from "./fileOperations.js";
import { getManagedFolderPath, isPathInside } from "./paths.js";
import { createPreviewUrl, clearThumbnailCache } from "./previewProtocol.js";
import { HASH_VERSION } from "./scanner.js";
import type { GroupedImages, ScannedImage } from "./scanner.js";

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
const statements = new Map<string, StatementSync>();
let scanMembership: Map<string, Set<string>> | null = null;

export const getDatabase = (): DatabaseSync => {
   if (database !== null) return database;
   database = new DatabaseSync(path.join(app.getPath("userData"), "deduup.sqlite"));
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
   return database;
};

/** Prepared once per connection; every query here is a fixed string. */
const query = (sql: string): StatementSync => {
   let statement = statements.get(sql);
   if (statement === undefined) {
      statement = getDatabase().prepare(sql);
      statements.set(sql, statement);
   }
   return statement;
};

const transaction = (run: () => void): void => {
   const db = getDatabase();
   db.exec("BEGIN IMMEDIATE");
   try {
      run();
      db.exec("COMMIT");
   } catch (error: unknown) {
      db.exec("ROLLBACK");
      throw error;
   }
};

export const closeDatabase = (): void => {
   statements.clear();
   database?.close();
   database = null;
   scanMembership = null;
};

export const getSetting = (key: string): string | null => {
   const row = query("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
   return row?.value ?? null;
};

export const setSetting = (key: string, value: string): void => {
   query("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
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

const setIdAt = (index: number): string => `set_${String(index + 1).padStart(3, "0")}`;

export const saveScan = (rootPath: string, groups: GroupedImages[], warnings: { count: number; paths: string[] }, inventory: ScannedImage[]): void => {
   const sameRoot = getSetting("scan_root") === rootPath;
   const previousRows = query(
      "SELECT set_id AS setId, original_path AS originalPath, hash AS evidence, size, modified_at AS modifiedAt FROM images"
   ).all() as unknown as (Pick<ImageRow, "setId" | "originalPath" | "size" | "modifiedAt"> & { evidence: string })[];
   const previousGroups = new Map<string, typeof previousRows>();
   for (const row of previousRows) {
      const images = previousGroups.get(row.setId);
      if (images === undefined) previousGroups.set(row.setId, [row]);
      else images.push(row);
   }
   const nextGroups = groups.map((group, index) => ({
      id: setIdAt(index),
      images: group.images.map((image) => ({ originalPath: image.originalPath, evidence: image.hash, size: image.size, modifiedAt: image.modifiedAt })),
   }));
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

   transaction(() => {
      getDatabase().exec("DELETE FROM decisions; DELETE FROM images; DELETE FROM duplicate_groups; DELETE FROM file_moves; DELETE FROM image_inventory;");
      const insertGroup = query("INSERT INTO duplicate_groups (id, similarity, sort_index, folder_path) VALUES (?, ?, ?, ?)");
      const insertImage = query(
         "INSERT INTO images (original_path, set_id, file_name, hash, width, height, size, modified_at, changed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      );
      groups.forEach((group, index) => {
         const setId = setIdAt(index);
         insertGroup.run(setId, group.similarity, index, rootPath);
         for (const image of group.images)
            insertImage.run(image.originalPath, setId, image.file, image.hash, image.width, image.height, image.size, image.modifiedAt, image.changedAt);
      });
      const insertInventory = query("INSERT INTO image_inventory VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
      for (const image of inventory)
         insertInventory.run(image.originalPath, image.file, image.hash, image.width, image.height, image.size, image.modifiedAt, image.changedAt);
      const insertDecision = query("INSERT INTO decisions VALUES (?, ?)");
      for (const [id, decision] of Object.entries(retained)) insertDecision.run(id, JSON.stringify(decision.deletedImages));
      setSetting("scan_root", rootPath);
      setSetting("scan_id", randomUUID());
      setSetting("last_file_action", "idle");
      setSetting("current_set_id", currentSetId ?? (groups.length === 0 ? "" : setIdAt(0)));
      setSetting("hash_version", HASH_VERSION);
      setSetting("scan_warning_count", String(warnings.count));
      setSetting("scan_warning_paths", JSON.stringify(warnings.paths));
   });
   scanMembership = null;
   if (!sameRoot) clearThumbnailCache();
};

export const loadImageInventory = (): ScannedImage[] =>
   getSetting("hash_version") !== HASH_VERSION
      ? []
      : (query(
           "SELECT original_path AS originalPath, file_name AS file, hash, width, height, size, modified_at AS modifiedAt, changed_at AS changedAt FROM image_inventory"
        ).all() as unknown as ScannedImage[]);

export const loadMoveRecords = (): MoveRecord[] =>
   query(
      'SELECT original_path AS "from", destination_path AS "to", set_id AS setId, file_name AS file, checksum, status FROM file_moves'
   ).all() as unknown as MoveRecord[];

export const recordPendingMove = (move: PlannedMove, checksum: string): void => {
   query(
      "INSERT INTO file_moves (original_path, set_id, file_name, destination_path, checksum, status) VALUES (?, ?, ?, ?, ?, 'pending') " +
         "ON CONFLICT(original_path) DO UPDATE SET set_id = excluded.set_id, file_name = excluded.file_name, destination_path = excluded.destination_path, checksum = excluded.checksum, status = 'pending'"
   ).run(move.from, move.setId, move.file, move.to, checksum);
};

export const updateMoveStatus = (originalPath: string, status: MoveRecord["status"]): void => {
   query("UPDATE file_moves SET status = ? WHERE original_path = ?").run(status, originalPath);
};

/** Where every Discarded file in the given choices goes inside the managed folder. */
export const loadMovePlan = (decisions: Decisions): PlannedMove[] => {
   const scanRoot = getSetting("scan_root");
   if (scanRoot === null) return [];
   const duplicatePath = getManagedFolderPath(scanRoot);
   const rows = query(
      "SELECT set_id AS setId, file_name AS file, original_path AS originalPath, size, modified_at AS modifiedAt FROM images"
   ).all() as unknown as Pick<ImageRow, "setId" | "file" | "originalPath" | "size" | "modifiedAt">[];
   const selectedBySet = new Map(Object.entries(decisions).map(([setId, decision]) => [setId, new Set(decision.deletedImages)]));
   return rows.flatMap((row) => {
      if (selectedBySet.get(row.setId)?.has(row.originalPath) !== true) return [];
      if (!isPathInside(scanRoot, row.originalPath)) throw new Error("A saved image is outside the scan folder.");
      return [
         {
            setId: row.setId,
            file: row.file,
            from: row.originalPath,
            to: path.join(duplicatePath, row.setId, path.relative(scanRoot, row.originalPath)),
            expectedSource: { size: row.size, modifiedAt: row.modifiedAt },
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
   const rows = query("SELECT set_id AS setId, deleted_images_json AS deletedImagesJson FROM decisions").all() as unknown as DecisionRow[];
   return Object.fromEntries(rows.map((row) => [row.setId, { deletedImages: parseStringArray(row.deletedImagesJson) }]));
};

export const saveDecisions = (decisions: Decisions): void => {
   if (scanMembership === null) {
      scanMembership = new Map();
      for (const row of query("SELECT set_id AS setId, original_path AS originalPath FROM images").all() as unknown as Pick<
         ImageRow,
         "setId" | "originalPath"
      >[]) {
         const paths = scanMembership.get(row.setId);
         if (paths === undefined) scanMembership.set(row.setId, new Set([row.originalPath]));
         else paths.add(row.originalPath);
      }
   }
   for (const [setId, decision] of Object.entries(decisions)) {
      const paths = scanMembership.get(setId);
      if (paths === undefined || decision.deletedImages.some((candidate) => !paths.has(candidate)))
         throw new Error("The review contains unknown sets or images.");
   }
   const existing = new Map(
      (query("SELECT set_id AS setId, deleted_images_json AS deletedImagesJson FROM decisions").all() as unknown as DecisionRow[]).map((row) => [
         row.setId,
         row.deletedImagesJson,
      ])
   );
   transaction(() => {
      const upsert = query(
         "INSERT INTO decisions (set_id, deleted_images_json) VALUES (?, ?) ON CONFLICT(set_id) DO UPDATE SET deleted_images_json = excluded.deleted_images_json"
      );
      for (const [setId, decision] of Object.entries(decisions)) {
         const serialized = JSON.stringify(decision.deletedImages);
         if (existing.get(setId) !== serialized) upsert.run(setId, serialized);
         existing.delete(setId);
      }
      const remove = query("DELETE FROM decisions WHERE set_id = ?");
      for (const setId of existing.keys()) remove.run(setId);
   });
};

export const getLastFileAction = (): FileActionStatus => {
   const value = getSetting("last_file_action");
   return value === "moved" || value === "restored" || value === "recycled" ? value : "idle";
};

export const getDuplicateFolderPath = (): string | null => {
   const scanRoot = getSetting("scan_root");
   return scanRoot === null ? null : getManagedFolderPath(scanRoot);
};

export const saveCurrentSetId = (setId: string): void => {
   if (query("SELECT 1 FROM duplicate_groups WHERE id = ?").get(setId) === undefined) throw new Error(`Unknown set: ${setId}`);
   setSetting("current_set_id", setId);
};

const statFile = async (filePath: string) =>
   stat(filePath)
      .then((value) => (value.isFile() ? value : null))
      .catch((error: unknown) => {
         if (isMissingPathError(error)) return null;
         throw error;
      });

const buildImageItem = (row: ImageRow, present: ReadonlySet<string>, move: MoveRecord | undefined, movedStat: Stats | null): ImageItem => {
   // Only a journalled move can have put the image in the managed folder.
   const movedPath = movedStat === null ? null : (move?.to ?? null);
   const previewPath = movedPath ?? row.originalPath;
   // A source's revision is its scan evidence: a change on disk triggers a
   // rescan, which writes new values and so a new preview URL.
   const revision = movedStat !== null ? `${movedStat.size}-${movedStat.mtimeMs}-${movedStat.ctimeMs}` : `${row.size}-${row.modifiedAt}-${row.changedAt}`;
   return {
      file: row.file,
      originalPath: row.originalPath,
      currentPath: previewPath,
      folderPath: path.dirname(previewPath),
      evidence: createHash("sha1").update(row.hash).digest("base64url").slice(0, 16),
      width: row.width,
      height: row.height,
      size: row.size,
      modifiedAt: row.modifiedAt,
      previewUrl: createPreviewUrl(previewPath, "thumbnail", revision),
      sourceStatus: movedPath !== null ? "movedByApp" : present.has(row.originalPath) ? "available" : move?.status === "recycled" ? "recycledByApp" : "missing",
   };
};

/** Which regular files exist in these folders: one readdir per folder instead of one stat per image. */
const listPresentFiles = async (folders: string[]): Promise<Set<string>> => {
   const present = new Set<string>();
   await mapWithConcurrency(folders, 16, async (folder) => {
      const entries = await readdir(folder, { withFileTypes: true }).catch((error: unknown) => {
         if (isMissingPathError(error)) return [];
         throw error;
      });
      for (const entry of entries) if (entry.isFile()) present.add(path.join(folder, entry.name));
   });
   return present;
};

const mapWithConcurrency = async <T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> => {
   const results = new Array<R>(items.length);
   let nextIndex = 0;
   const runner = async (): Promise<void> => {
      while (nextIndex < items.length) {
         const index = nextIndex;
         nextIndex += 1;
         results[index] = await worker(items[index] as T);
      }
   };
   await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
   return results;
};

const loadGroups = async (): Promise<ImageSet[]> => {
   const groupRows = query("SELECT id, similarity, folder_path AS folderPath FROM duplicate_groups ORDER BY sort_index").all() as unknown as GroupRow[];
   const imageRows = query(
      "SELECT set_id AS setId, file_name AS file, original_path AS originalPath, hash, width, height, size, modified_at AS modifiedAt, changed_at AS changedAt FROM images ORDER BY set_id, original_path"
   ).all() as unknown as ImageRow[];
   const moves = new Map(loadMoveRecords().map((record) => [record.from, record]));
   const activeMoves = [...moves.values()].filter((move) => move.status === "moved" || move.status === "pending");
   const [present, movedStats] = await Promise.all([
      listPresentFiles([...new Set(imageRows.map((row) => path.dirname(row.originalPath)))]),
      mapWithConcurrency(activeMoves, 16, async (move) => [move.from, await statFile(move.to)] as const),
   ]);
   const movedStatByPath = new Map(movedStats);
   const imagesBySet = new Map<string, ImageItem[]>();
   for (const row of imageRows) {
      const item = buildImageItem(row, present, moves.get(row.originalPath), movedStatByPath.get(row.originalPath) ?? null);
      const images = imagesBySet.get(row.setId);
      if (images === undefined) imagesBySet.set(row.setId, [item]);
      else images.push(item);
   }
   return groupRows.map((row) => ({ ...row, images: imagesBySet.get(row.id) ?? [] }));
};

export const getDuplicateFolderFiles = async (): Promise<string[]> => {
   const duplicatePath = getDuplicateFolderPath();
   return duplicatePath === null ? [] : collectManagedFolderFiles(duplicatePath);
};

export const getDuplicateFolderStatus = async (): Promise<boolean> => (await getDuplicateFolderFiles()).length > 0;

export const getLoadResult = async (): Promise<LoadDataResult> => {
   const [groups, duplicateFolderHasContent] = await Promise.all([loadGroups(), getDuplicateFolderStatus()]);
   const savedSetId = getSetting("current_set_id");
   return {
      scanId: getScanId(),
      groups,
      decisions: loadDecisions(),
      scanRoot: getSetting("scan_root"),
      duplicateFolderPath: getDuplicateFolderPath(),
      currentSetId: savedSetId !== null && groups.some((group) => group.id === savedSetId) ? savedSetId : (groups[0]?.id ?? null),
      duplicateFolderHasContent,
      lastFileAction: getLastFileAction(),
      scanWarningCount: Number(getSetting("scan_warning_count") ?? 0),
   };
};
