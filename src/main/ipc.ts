import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import { stat } from "node:fs/promises";
import path from "node:path";
import type { WebContents } from "electron";
import { isObject, parseDecisions } from "../shared/schema.js";
import type { LoadDataResult, ScanProgress, ScanRequest } from "../shared/types.js";
import {
   assertScanId,
   getDuplicateFolderStatus,
   getLoadResult,
   getSetting,
   loadImageInventory,
   saveCurrentSetId,
   saveDecisions,
   saveScan,
} from "./database.js";
import { moveMarkedImages, assertDuplicateFolderCanBeRecycled, recordRecycledMoves, restoreDuplicateFolder } from "./fileActions.js";
import { ScanCancelledError, collectImagePaths, groupImages, scanImages } from "./scanner.js";
import { assertReviewWritable, hasActiveOperation, runExclusiveOperation } from "./operationCoordinator.js";
import { LibraryMonitor } from "./libraryMonitor.js";

/** All scan entry points share the same cancellation owner. */
let activeScanController: AbortController | null = null;
let monitoringSender: WebContents | null = null;
class RefreshDeferredError extends Error {}
const libraryMonitor = new LibraryMonitor(
   async (root) => {
      const sender = monitoringSender;
      if (sender === null || sender.isDestroyed() || hasActiveOperation() || (await getDuplicateFolderStatus())) return false;
      try {
         await runExclusiveOperation("refresh", async () => {
            if (await executeScan(root, sender, new AbortController().signal, true)) {
               const result = await getLoadResult();
               if (!sender.isDestroyed()) sender.send("library:update", result);
            }
         });
         return true;
      } catch (error: unknown) {
         if (error instanceof RefreshDeferredError) return false;
         throw error;
      }
   },
   (error) => {
      if (monitoringSender !== null && !monitoringSender.isDestroyed())
         monitoringSender.send("library:error", error instanceof Error ? error.message : "Library update failed");
   }
);

export const startLibraryMonitoring = (sender: WebContents): void => {
   monitoringSender = sender;
   const root = getSetting("scan_root");
   if (root !== null) libraryMonitor.start(root);
};
export const stopLibraryMonitoring = (): void => libraryMonitor.stop();

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

const normalizeScanRequest = (value: unknown): ScanRequest => {
   if (!isObject(value) || !isNonEmptyString(value["rootPath"])) throw new TypeError("Invalid scan request");
   return { rootPath: path.resolve(value["rootPath"]) };
};

const isWithinScanRoot = (candidatePath: string): boolean => {
   const scanRoot = getSetting("scan_root");
   if (scanRoot === null || !path.isAbsolute(candidatePath)) return false;
   const relativePath = path.relative(scanRoot, path.resolve(candidatePath));
   return relativePath !== ".." && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath);
};

const openPath = async (targetPath: string): Promise<void> => {
   const message = await shell.openPath(targetPath);
   if (message.length > 0) throw new Error(message);
};

const executeScan = async (rootPath: string, sender: WebContents, signal: AbortSignal, background = false): Promise<boolean> => {
   if (await getDuplicateFolderStatus()) {
      throw new Error("Restore or recycle the currently moved duplicates before starting another scan.");
   }
   if (!(await stat(rootPath)).isDirectory()) throw new Error("The selected path is not a directory");
   const report = (progress: ScanProgress): void => {
      if (!background && !sender.isDestroyed()) sender.send("scan:progress", progress);
   };
   let scanWarningCount = 0;
   const scanWarningPaths: string[] = [];
   const reportWarning = (filePath: string): void => {
      scanWarningCount += 1;
      if (scanWarningPaths.length < 5) scanWarningPaths.push(filePath);
   };
   report({ phase: "discovering", completed: 0, total: 0 });
   const paths = await collectImagePaths(rootPath, reportWarning, signal);
   report({ phase: "discovering", completed: paths.length, total: paths.length });
   const previousInventory = getSetting("scan_root") === rootPath ? loadImageInventory() : [];
   const cache = new Map(previousInventory.map((image) => [image.originalPath, image]));
   const images = await scanImages(paths, report, reportWarning, signal, cache);
   if (
      background &&
      images.length === cache.size &&
      images.every((image) => {
         const previous = cache.get(image.originalPath);
         return previous?.size === image.size && previous.modifiedAt === image.modifiedAt && previous.changedAt === image.changedAt;
      }) &&
      scanWarningCount === Number(getSetting("scan_warning_count") ?? 0) &&
      JSON.stringify(scanWarningPaths) === (getSetting("scan_warning_paths") ?? "[]")
   )
      return false;
   const groups = await groupImages(images, report, signal);
   report({ phase: "saving", completed: 0, total: groups.length });
   if (signal.aborted) throw new ScanCancelledError();
   if (background && libraryMonitor.busy) throw new RefreshDeferredError();
   saveScan(rootPath, groups, { count: scanWarningCount, paths: scanWarningPaths }, images);
   report({ phase: "saving", completed: groups.length, total: groups.length });
   return true;
};

export const runScan = (rootPath: string, sender: WebContents): Promise<LoadDataResult> =>
   runExclusiveOperation("scan", async () => {
      const controller = new AbortController();
      activeScanController = controller;
      try {
         await executeScan(rootPath, sender, controller.signal);
         const result = await getLoadResult();
         startLibraryMonitoring(sender);
         return result;
      } finally {
         activeScanController = null;
      }
   });

export const registerIpcHandlers = (): void => {
   ipcMain.handle("review:busy", (_event, busy: unknown): void => {
      if (typeof busy !== "boolean") throw new TypeError("Invalid review activity");
      libraryMonitor.busy = busy;
   });
   ipcMain.handle("window:action", (event, action: unknown): void => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (window === null) return;
      if (action === "minimize") window.minimize();
      else if (action === "maximize") {
         if (window.isMaximized()) window.unmaximize();
         else window.maximize();
      } else if (action === "close") window.close();
   });
   ipcMain.handle("data:load", getLoadResult);
   ipcMain.handle("scan:choose-folder", async (): Promise<string | null> => {
      const result = await dialog.showOpenDialog({ properties: ["openDirectory"], title: "Choose image folder" });
      return result.canceled ? null : (result.filePaths[0] ?? null);
   });
   ipcMain.handle("scan:start", async (event, rawRequest: unknown): Promise<LoadDataResult> => {
      const request = normalizeScanRequest(rawRequest);
      return runScan(request.rootPath, event.sender);
   });
   ipcMain.handle("scan:cancel", (): void => {
      activeScanController?.abort();
   });
   ipcMain.handle("decisions:save", (_event, rawDecisions: unknown, scanId: unknown): void => {
      assertReviewWritable();
      assertScanId(scanId);
      saveDecisions(parseDecisions(rawDecisions));
   });
   ipcMain.handle("sets:save-position", (_event, setId: unknown, scanId: unknown): void => {
      if (!isNonEmptyString(setId)) throw new TypeError("Invalid set id");
      assertReviewWritable();
      assertScanId(scanId);
      saveCurrentSetId(setId);
   });
   ipcMain.handle("sets:open-folder", async (_event, folderPath: unknown): Promise<void> => {
      if (isNonEmptyString(folderPath) && isWithinScanRoot(folderPath)) await openPath(folderPath);
   });
   ipcMain.handle("image:show", (_event, imagePath: unknown): void => {
      if (isNonEmptyString(imagePath) && isWithinScanRoot(imagePath)) shell.showItemInFolder(imagePath);
   });
   ipcMain.handle("image:open", async (_event, imagePath: unknown): Promise<void> => {
      if (isNonEmptyString(imagePath) && isWithinScanRoot(imagePath)) await openPath(imagePath);
   });
   ipcMain.handle("moves:apply", (_event, rawDecisions: unknown, scanId: unknown) =>
      runExclusiveOperation("move", async () => {
         assertScanId(scanId);
         const decisions = parseDecisions(rawDecisions);
         saveDecisions(decisions);
         return moveMarkedImages(decisions);
      })
   );
   ipcMain.handle("duplicate:status", getDuplicateFolderStatus);
   ipcMain.handle("duplicate:restore", () => runExclusiveOperation("restore", restoreDuplicateFolder));
   ipcMain.handle("duplicate:trash", () =>
      runExclusiveOperation("recycle", async (): Promise<void> => {
         const recyclePlan = await assertDuplicateFolderCanBeRecycled();
         await shell.trashItem(recyclePlan.path);
         recordRecycledMoves(recyclePlan.originalPaths);
      })
   );
};
