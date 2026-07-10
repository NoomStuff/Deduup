import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, shell } from "electron";
import { copyFile, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { isObject, normalizeDecisions } from "../shared/schema.js";
import type { Decisions, FileActionStatus, ImageItem, ImageSet, LoadDataResult, PatchMove, PatchResult, ScanProgress, ScanRequest } from "../shared/types.js";

interface ScannedImage {
   file: string;
   originalPath: string;
   hash: string;
   width: number;
   height: number;
   size: number;
   modifiedAt: number;
}

interface GroupedImages {
   similarity: number;
   images: ScannedImage[];
}

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

const supportedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".avif", ".tif", ".tiff"]);
const hashDistanceThreshold = 13;
const previewProtocol = "image-deduplicator-preview";
const isDev = process.env["VITE_DEV_SERVER_URL"] !== undefined || !app.isPackaged;

let database: DatabaseSync | null = null;

protocol.registerSchemesAsPrivileged([{ scheme: previewProtocol, privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

const getDatabasePath = (): string => path.join(app.getPath("userData"), "image-deduplicator.sqlite");

const getDatabase = (): DatabaseSync => {
   if (database !== null) {
      return database;
   }

   database = new DatabaseSync(getDatabasePath());
   database.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS settings (
         key TEXT PRIMARY KEY,
         value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS duplicate_groups (
         id TEXT PRIMARY KEY,
         similarity REAL NOT NULL,
         sort_index INTEGER NOT NULL,
         folder_path TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS images (
         original_path TEXT PRIMARY KEY,
         group_id TEXT NOT NULL REFERENCES duplicate_groups(id) ON DELETE CASCADE,
         file_name TEXT NOT NULL,
         hash TEXT NOT NULL,
         width INTEGER NOT NULL,
         height INTEGER NOT NULL,
         size INTEGER NOT NULL,
         modified_at REAL NOT NULL
      );

      CREATE TABLE IF NOT EXISTS decisions (
         group_id TEXT PRIMARY KEY REFERENCES duplicate_groups(id) ON DELETE CASCADE,
         deleted_images_json TEXT NOT NULL,
         completed INTEGER NOT NULL
      );
   `);

   const decisionColumns = new Set((database.prepare("PRAGMA table_info(decisions)").all() as unknown as TableColumnRow[]).map((column) => column.name));
   if (!decisionColumns.has("deleted_images_json") || !decisionColumns.has("completed")) {
      database.exec(`
         DROP TABLE decisions;

         CREATE TABLE decisions (
            group_id TEXT PRIMARY KEY REFERENCES duplicate_groups(id) ON DELETE CASCADE,
            deleted_images_json TEXT NOT NULL,
            completed INTEGER NOT NULL
         );
      `);
   }

   return database;
};

const getSetting = (key: string): string | null => {
   const row = getDatabase().prepare("SELECT value FROM settings WHERE key = ?").get(key) as SettingRow | undefined;
   return row?.value ?? null;
};

const setSetting = (key: string, value: string): void => {
   getDatabase().prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
};

const getPreviewUrl = (filePath: string): string => `${previewProtocol}://file/${Buffer.from(filePath, "utf8").toString("base64url")}`;

const registerPreviewProtocol = (): void => {
   protocol.handle(previewProtocol, (request) => {
      try {
         const encodedPath = new URL(request.url).pathname.slice(1);
         const filePath = Buffer.from(encodedPath, "base64url").toString("utf8");
         if (!path.isAbsolute(filePath)) {
            return new Response("Invalid preview path", { status: 400 });
         }

         return net.fetch(pathToFileURL(filePath).href);
      } catch {
         return new Response("Invalid preview URL", { status: 400 });
      }
   });
};

const createWindow = (): void => {
   const iconPath = path.join(app.getAppPath(), isDev ? "public" : "dist", "favicon.ico");
   const window = new BrowserWindow({
      width: 1500,
      height: 940,
      minWidth: 1100,
      minHeight: 720,
      backgroundColor: "#000000",
      icon: iconPath,
      webPreferences: {
         preload: path.join(app.getAppPath(), "dist-electron", "preload", "index.js"),
         contextIsolation: true,
         nodeIntegration: false,
         sandbox: false,
      },
   });

   if (isDev) {
      void window.loadURL("http://127.0.0.1:5173");
      return;
   }

   void window.loadFile(path.join(app.getAppPath(), "dist", "index.html"));
};

const emitProgress = (sender: Electron.WebContents, progress: ScanProgress): void => {
   sender.send("scan:progress", progress);
};

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

const collectImagePaths = async (rootPath: string, includeSubfolders: boolean): Promise<string[]> => {
   const collected: string[] = [];
   const normalizedRoot = path.resolve(rootPath);
   const duplicateOutputPath = path.join(normalizedRoot, "duplicate");

   const visit = async (folderPath: string, isRoot = false): Promise<void> => {
      const normalizedFolderPath = path.resolve(folderPath);
      if (!isRoot && normalizedFolderPath === duplicateOutputPath) {
         return;
      }

      const entries = await readdir(folderPath, { withFileTypes: true }).catch((error: unknown) => {
         if (isRoot) {
            throw error;
         }

         console.warn(`Skipping unreadable folder: ${folderPath}`, error);
         return [];
      });
      for (const entry of entries) {
         const entryPath = path.join(folderPath, entry.name);
         if (entry.isDirectory()) {
            if (includeSubfolders) {
               await visit(entryPath);
            }
            continue;
         }

         if (entry.isFile() && supportedExtensions.has(path.extname(entry.name).toLowerCase())) {
            collected.push(entryPath);
         }
      }
   };

   await visit(rootPath, true);
   return collected.sort((a, b) => a.localeCompare(b));
};

const createDifferenceHash = (pixels: Buffer): string => {
   let hash = 0n;
   for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
         const offset = y * 9 + x;
         hash = (hash << 1n) | ((pixels[offset] ?? 0) > (pixels[offset + 1] ?? 0) ? 1n : 0n);
      }
   }

   return hash.toString(16).padStart(16, "0");
};

const scanImage = async (filePath: string): Promise<ScannedImage | null> => {
   try {
      const source = sharp(filePath, { animated: false, failOn: "none" }).rotate();
      const metadata = await source.metadata();
      const pixels = await source.clone().resize(9, 8, { fit: "fill" }).greyscale().raw().toBuffer();
      const fileStat = await stat(filePath);
      return {
         file: path.basename(filePath),
         originalPath: path.normalize(filePath),
         hash: createDifferenceHash(pixels),
         width: metadata.width,
         height: metadata.height,
         size: fileStat.size,
         modifiedAt: fileStat.mtimeMs,
      };
   } catch (error: unknown) {
      console.warn(`Skipping unreadable image: ${filePath}`, error);
      return null;
   }
};

const scanImages = async (paths: string[], sender: Electron.WebContents): Promise<ScannedImage[]> => {
   const results: (ScannedImage | null)[] = Array.from({ length: paths.length }, () => null);
   let nextIndex = 0;
   let completed = 0;
   const workerCount = Math.min(8, Math.max(1, paths.length));

   const worker = async (): Promise<void> => {
      while (nextIndex < paths.length) {
         const index = nextIndex;
         nextIndex += 1;
         const filePath = paths[index];
         if (filePath === undefined) {
            continue;
         }

         results[index] = await scanImage(filePath);
         completed += 1;
         emitProgress(sender, { phase: "hashing", completed, total: paths.length, currentFile: path.basename(filePath) });
      }
   };

   await Promise.all(Array.from({ length: workerCount }, worker));
   return results.filter((image): image is ScannedImage => image !== null);
};

const getHashDistance = (left: string, right: string): number => {
   let value = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
   let distance = 0;
   while (value !== 0n) {
      value &= value - 1n;
      distance += 1;
   }
   return distance;
};

const getGroupSimilarity = (images: ScannedImage[]): number => {
   let totalDistance = 0;
   let comparisons = 0;
   for (let leftIndex = 0; leftIndex < images.length; leftIndex += 1) {
      const left = images[leftIndex];
      if (left === undefined) {
         continue;
      }

      for (let rightIndex = leftIndex + 1; rightIndex < images.length; rightIndex += 1) {
         const right = images[rightIndex];
         if (right === undefined) {
            continue;
         }
         totalDistance += getHashDistance(left.hash, right.hash);
         comparisons += 1;
      }
   }

   return comparisons === 0 ? 0 : totalDistance / comparisons;
};

const getConnectedGroups = (images: ScannedImage[]): ScannedImage[][] => {
   const parent = images.map((_, index) => index);
   const find = (index: number): number => {
      let root = index;
      while (parent[root] !== root) {
         root = parent[root] ?? root;
      }

      while (parent[index] !== index) {
         const next = parent[index] ?? root;
         parent[index] = root;
         index = next;
      }

      return root;
   };
   const union = (left: number, right: number): void => {
      const leftRoot = find(left);
      const rightRoot = find(right);
      if (leftRoot !== rightRoot) {
         parent[rightRoot] = leftRoot;
      }
   };

   for (let leftIndex = 0; leftIndex < images.length; leftIndex += 1) {
      const left = images[leftIndex];
      if (left === undefined) {
         continue;
      }

      for (let rightIndex = leftIndex + 1; rightIndex < images.length; rightIndex += 1) {
         const right = images[rightIndex];
         if (right !== undefined && getHashDistance(left.hash, right.hash) <= hashDistanceThreshold) {
            union(leftIndex, rightIndex);
         }
      }
   }

   const groupsByRoot = new Map<number, ScannedImage[]>();
   images.forEach((image, index) => {
      const root = find(index);
      const group = groupsByRoot.get(root) ?? [];
      group.push(image);
      groupsByRoot.set(root, group);
   });

   return [...groupsByRoot.values()];
};

const groupImages = (images: ScannedImage[], sender: Electron.WebContents): GroupedImages[] => {
   const connectedGroups = getConnectedGroups(images);
   connectedGroups.forEach((_, index) => {
      emitProgress(sender, { phase: "grouping", completed: index + 1, total: connectedGroups.length });
   });

   return connectedGroups
      .filter((group) => group.length > 1)
      .map((group) => ({ similarity: getGroupSimilarity(group), images: group }))
      .sort((a, b) => a.similarity - b.similarity);
};

const saveScan = (rootPath: string, includeSubfolders: boolean, groups: GroupedImages[]): void => {
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

const findMovedPath = async (row: ImageRow, decisions: Decisions, scanRoot: string | null): Promise<string | null> => {
   const decision = decisions[row.groupId];
   if (scanRoot === null || decision === undefined || !decision.completed || !decision.deletedImages.includes(row.originalPath)) {
      return null;
   }

   const relativePath = path.relative(scanRoot, row.originalPath);
   const safeRelativePath = relativePath.startsWith("..") || path.isAbsolute(relativePath) ? row.file : relativePath;
   const movedPath = path.join(scanRoot, "duplicate", row.groupId, safeRelativePath);
   const movedFile = path.parse(movedPath);
   return readdir(movedFile.dir)
      .then((entries) => {
         const entry = entries.find((candidateEntry) => {
            const candidate = path.parse(candidateEntry);
            return candidate.base === movedFile.base || (candidate.ext === movedFile.ext && candidate.name.startsWith(movedFile.name + "-"));
         });
         return entry === undefined ? null : path.join(movedFile.dir, entry);
      })
      .catch(() => null);
};

const getLastFileAction = (): FileActionStatus => {
   const value = getSetting("last_file_action");
   return value === "moved" || value === "restored" || value === "recycled" ? value : "idle";
};

const loadGroups = async (
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
            previewUrl: getPreviewUrl(movedPath ?? row.originalPath),
            exists,
            sourceStatus: exists ? "available" : movedPath !== null ? "movedByApp" : wasRecycledByApp ? "recycledByApp" : "missing",
         };
         const groupImages = imagesByGroup.get(row.groupId) ?? [];
         groupImages.push(item);
         imagesByGroup.set(row.groupId, groupImages);
      })
   );

   return groupRows.map((row) => ({
      id: row.id,
      similarity: row.similarity,
      folderPath: row.folderPath,
      images: imagesByGroup.get(row.id) ?? [],
   }));
};

const parseStringArray = (value: string): string[] => {
   try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
   } catch {
      return [];
   }
};

const loadDecisions = (): Decisions => {
   const rows = getDatabase()
      .prepare("SELECT group_id AS groupId, deleted_images_json AS deletedImagesJson, completed FROM decisions")
      .all() as unknown as DecisionRow[];
   return Object.fromEntries(
      rows.map((row) => [
         row.groupId,
         {
            deletedImages: parseStringArray(row.deletedImagesJson),
            completed: row.completed === 1,
         },
      ])
   );
};

const saveDecisions = (decisions: Decisions): void => {
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

const getDuplicateFolderPath = (): string | null => {
   const scanRoot = getSetting("scan_root");
   return scanRoot === null ? null : path.join(scanRoot, "duplicate");
};

const collectFiles = async (rootPath: string): Promise<string[]> => {
   const entries = await readdir(rootPath, { withFileTypes: true }).catch(() => []);
   const files: string[] = [];
   for (const entry of entries) {
      const entryPath = path.join(rootPath, entry.name);
      if (entry.isDirectory()) {
         files.push(...(await collectFiles(entryPath)));
      } else if (entry.isFile()) {
         files.push(entryPath);
      }
   }
   return files;
};

const getDuplicateFolderStatus = async (): Promise<boolean> => {
   const duplicatePath = getDuplicateFolderPath();
   return duplicatePath === null ? false : (await collectFiles(duplicatePath)).length > 0;
};

const getLoadResult = async (): Promise<LoadDataResult> => {
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

const normalizeScanRequest = (value: unknown): ScanRequest => {
   if (!isObject(value) || typeof value["rootPath"] !== "string" || typeof value["includeSubfolders"] !== "boolean") {
      throw new TypeError("Invalid scan request");
   }

   return { rootPath: path.resolve(value["rootPath"]), includeSubfolders: value["includeSubfolders"] };
};

const getDeleteMoves = async (decisions: Decisions): Promise<PatchMove[]> => {
   const groups = await loadGroups();
   const scanRoot = getSetting("scan_root");
   if (scanRoot === null) {
      return [];
   }

   const moves: PatchMove[] = [];
   for (const group of groups) {
      const decision = decisions[group.id];
      if (decision === undefined || !decision.completed || decision.deletedImages.length === 0) {
         continue;
      }

      const deletedImages = new Set(decision.deletedImages);
      for (const image of group.images) {
         if (!deletedImages.has(image.originalPath)) {
            continue;
         }

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

const getAvailableDestination = async (destination: string): Promise<string> => {
   const parsed = path.parse(destination);
   for (let attempt = 0; attempt < 10_000; attempt += 1) {
      const candidate = attempt === 0 ? destination : path.join(parsed.dir, `${parsed.name}-${attempt + 1}${parsed.ext}`);
      const exists = await stat(candidate)
         .then(() => true)
         .catch(() => false);
      if (!exists) {
         return candidate;
      }
   }

   throw new Error(`Could not find an available destination for ${destination}`);
};

const moveFileSafely = async (move: PatchMove): Promise<"moved" | "skipped"> => {
   const sourceExists = await stat(move.from)
      .then(() => true)
      .catch(() => false);
   if (!sourceExists) {
      return "skipped";
   }

   await mkdir(path.dirname(move.to), { recursive: true });
   const destination = await getAvailableDestination(move.to);

   await rename(move.from, destination).catch(async (error: unknown) => {
      if (isObject(error) && error["code"] === "EXDEV") {
         await copyFile(move.from, destination);
         await rm(move.from);
         return;
      }
      throw error;
   });
   return "moved";
};

ipcMain.handle("data:load", getLoadResult);

ipcMain.handle("scan:choose-folder", async (): Promise<string | null> => {
   const result = await dialog.showOpenDialog({ properties: ["openDirectory"], title: "Choose image folder" });
   return result.canceled ? null : (result.filePaths[0] ?? null);
});

ipcMain.handle("scan:start", async (event, rawRequest: unknown): Promise<LoadDataResult> => {
   const request = normalizeScanRequest(rawRequest);
   const rootStat = await stat(request.rootPath);
   if (!rootStat.isDirectory()) {
      throw new Error("The selected path is not a directory");
   }

   emitProgress(event.sender, { phase: "discovering", completed: 0, total: 0 });
   const paths = await collectImagePaths(request.rootPath, request.includeSubfolders);
   emitProgress(event.sender, { phase: "discovering", completed: paths.length, total: paths.length });
   const images = await scanImages(paths, event.sender);
   const groups = groupImages(images, event.sender);
   emitProgress(event.sender, { phase: "saving", completed: 0, total: groups.length });
   saveScan(request.rootPath, request.includeSubfolders, groups);
   emitProgress(event.sender, { phase: "saving", completed: groups.length, total: groups.length });
   return getLoadResult();
});

ipcMain.handle("decisions:save", (_event, rawDecisions: unknown): void => {
   saveDecisions(normalizeDecisions(rawDecisions));
});

ipcMain.handle("group:open-folder", async (_event, folderPath: string): Promise<void> => {
   if (isNonEmptyString(folderPath)) {
      await shell.openPath(folderPath);
   }
});

ipcMain.handle("image:show", (_event, imagePath: string): void => {
   if (isNonEmptyString(imagePath)) {
      shell.showItemInFolder(imagePath);
   }
});

ipcMain.handle("image:open", async (_event, imagePath: string): Promise<void> => {
   if (isNonEmptyString(imagePath)) {
      await shell.openPath(imagePath);
   }
});

ipcMain.handle("patch:apply", async (_event, rawDecisions: unknown): Promise<PatchResult> => {
   const moves = await getDeleteMoves(normalizeDecisions(rawDecisions));
   const result: PatchResult = { moved: [], skipped: [], errors: [] };
   for (const move of moves) {
      try {
         const status = await moveFileSafely(move);
         result[status].push(move);
      } catch (error: unknown) {
         result.errors.push({ ...move, message: error instanceof Error ? error.message : "Unknown move failure" });
      }
   }
   if (result.moved.length > 0) {
      setSetting("last_file_action", "moved");
   }
   return result;
});

ipcMain.handle("duplicate:status", getDuplicateFolderStatus);

ipcMain.handle("duplicate:restore", async (): Promise<PatchResult> => {
   const scanRoot = getSetting("scan_root");
   const duplicatePath = getDuplicateFolderPath();
   if (scanRoot === null || duplicatePath === null) {
      throw new Error("No duplicate folder is available");
   }

   const result: PatchResult = { moved: [], skipped: [], errors: [] };
   for (const sourcePath of await collectFiles(duplicatePath)) {
      const relativeParts = path.relative(duplicatePath, sourcePath).split(path.sep);
      const groupId = relativeParts.shift();
      if (groupId === undefined || relativeParts.length === 0) {
         continue;
      }

      const destination = path.join(scanRoot, ...relativeParts);
      const move: PatchMove = { groupId, file: path.basename(sourcePath), from: sourcePath, to: destination };
      const destinationExists = await stat(destination)
         .then(() => true)
         .catch(() => false);
      if (destinationExists) {
         result.skipped.push(move);
         continue;
      }

      try {
         await mkdir(path.dirname(destination), { recursive: true });
         await rename(sourcePath, destination).catch(async (error: unknown) => {
            if (isObject(error) && error["code"] === "EXDEV") {
               await copyFile(sourcePath, destination);
               await rm(sourcePath);
               return;
            }
            throw error;
         });
         result.moved.push(move);
      } catch (error: unknown) {
         result.errors.push({ ...move, message: error instanceof Error ? error.message : "Unknown restore failure" });
      }
   }

   if (!(await getDuplicateFolderStatus())) {
      await rm(duplicatePath, { recursive: true, force: true });
   }
   if (result.moved.length > 0) {
      setSetting("last_file_action", "restored");
   }
   return result;
});

ipcMain.handle("duplicate:trash", async (): Promise<void> => {
   const scanRoot = getSetting("scan_root");
   if (scanRoot === null) {
      throw new Error("No scan folder is selected");
   }

   const duplicatePath = path.join(scanRoot, "duplicate");
   const duplicateFolderExists = await stat(duplicatePath)
      .then((pathStat) => pathStat.isDirectory())
      .catch(() => false);
   if (!duplicateFolderExists) {
      return;
   }

   await shell.trashItem(duplicatePath);
   setSetting("last_file_action", "recycled");
});

void app.whenReady().then(() => {
   getDatabase();
   registerPreviewProtocol();
   Menu.setApplicationMenu(null);
   createWindow();
});

app.on("activate", () => {
   if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
   }
});

app.on("window-all-closed", () => {
   database?.close();
   database = null;
   if (process.platform !== "darwin") {
      app.quit();
   }
});
