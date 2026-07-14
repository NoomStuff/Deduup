import { dialog, ipcMain, shell } from "electron";
import { stat } from "node:fs/promises";
import path from "node:path";
import { isObject, normalizeDecisions } from "../shared/schema.js";
import type { LoadDataResult, ScanProgress, ScanRequest } from "../shared/types.js";
import { getDuplicateFolderPath, getDuplicateFolderStatus, getLoadResult, getSetting, saveDecisions, saveScan, setSetting } from "./database.js";
import { applyDecisions, restoreDuplicateFolder } from "./fileActions.js";
import { collectImagePaths, groupImages, scanImages } from "./scanner.js";

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

const normalizeScanRequest = (value: unknown): ScanRequest => {
   if (!isObject(value) || typeof value["rootPath"] !== "string" || typeof value["includeSubfolders"] !== "boolean") {
      throw new TypeError("Invalid scan request");
   }
   return { rootPath: path.resolve(value["rootPath"]), includeSubfolders: value["includeSubfolders"] };
};

const isWithinScanRoot = (candidatePath: string): boolean => {
   const scanRoot = getSetting("scan_root");
   if (scanRoot === null || !path.isAbsolute(candidatePath)) return false;
   const relativePath = path.relative(scanRoot, path.resolve(candidatePath));
   return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
};

export const registerIpcHandlers = (): void => {
   ipcMain.handle("data:load", getLoadResult);
   ipcMain.handle("scan:choose-folder", async (): Promise<string | null> => {
      const result = await dialog.showOpenDialog({ properties: ["openDirectory"], title: "Choose image folder" });
      return result.canceled ? null : (result.filePaths[0] ?? null);
   });
   ipcMain.handle("scan:start", async (event, rawRequest: unknown): Promise<LoadDataResult> => {
      const request = normalizeScanRequest(rawRequest);
      if (!(await stat(request.rootPath)).isDirectory()) throw new Error("The selected path is not a directory");
      const report = (progress: ScanProgress): void => event.sender.send("scan:progress", progress);
      report({ phase: "discovering", completed: 0, total: 0 });
      const paths = await collectImagePaths(request.rootPath, request.includeSubfolders);
      report({ phase: "discovering", completed: paths.length, total: paths.length });
      const groups = await groupImages(await scanImages(paths, report), report);
      report({ phase: "saving", completed: 0, total: groups.length });
      saveScan(request.rootPath, request.includeSubfolders, groups);
      report({ phase: "saving", completed: groups.length, total: groups.length });
      return getLoadResult();
   });
   ipcMain.handle("decisions:save", (_event, rawDecisions: unknown): void => saveDecisions(normalizeDecisions(rawDecisions)));
   ipcMain.handle("group:open-folder", async (_event, folderPath: unknown): Promise<void> => {
      if (isNonEmptyString(folderPath) && isWithinScanRoot(folderPath)) await shell.openPath(folderPath);
   });
   ipcMain.handle("image:show", (_event, imagePath: unknown): void => {
      if (isNonEmptyString(imagePath) && isWithinScanRoot(imagePath)) shell.showItemInFolder(imagePath);
   });
   ipcMain.handle("image:open", async (_event, imagePath: unknown): Promise<void> => {
      if (isNonEmptyString(imagePath) && isWithinScanRoot(imagePath)) await shell.openPath(imagePath);
   });
   ipcMain.handle("patch:apply", async (_event, rawDecisions: unknown) => applyDecisions(normalizeDecisions(rawDecisions)));
   ipcMain.handle("duplicate:status", getDuplicateFolderStatus);
   ipcMain.handle("duplicate:restore", restoreDuplicateFolder);
   ipcMain.handle("duplicate:trash", async (): Promise<void> => {
      const duplicatePath = getDuplicateFolderPath();
      if (duplicatePath === null) throw new Error("No scan folder is selected");
      const exists = await stat(duplicatePath)
         .then((value) => value.isDirectory())
         .catch(() => false);
      if (exists) {
         await shell.trashItem(duplicatePath);
         setSetting("last_file_action", "recycled");
      }
   });
};
