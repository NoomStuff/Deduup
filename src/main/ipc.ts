import { dialog, ipcMain, shell } from "electron";
import { stat } from "node:fs/promises";
import path from "node:path";
import { isObject, normalizeDecisions } from "../shared/schema.js";
import type { LoadDataResult, ScanProgress, ScanRequest } from "../shared/types.js";
import { getDuplicateFolderStatus, getLoadResult, getSetting, saveCurrentGroupId, saveDecisions, saveScan, setSetting } from "./database.js";
import { applyDecisions, assertDuplicateFolderCanBeRecycled, restoreDuplicateFolder } from "./fileActions.js";
import { collectImagePaths, groupImages, scanImages } from "./scanner.js";

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

const normalizeScanRequest = (value: unknown): ScanRequest => {
   if (!isObject(value) || typeof value["rootPath"] !== "string") throw new TypeError("Invalid scan request");
   return { rootPath: path.resolve(value["rootPath"]) };
};

const isWithinScanRoot = (candidatePath: string): boolean => {
   const scanRoot = getSetting("scan_root");
   if (scanRoot === null || !path.isAbsolute(candidatePath)) return false;
   const relativePath = path.relative(scanRoot, path.resolve(candidatePath));
   return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
};

const openPath = async (targetPath: string): Promise<void> => {
   const message = await shell.openPath(targetPath);
   if (message.length > 0) throw new Error(message);
};

export const registerIpcHandlers = (): void => {
   ipcMain.handle("data:load", getLoadResult);
   ipcMain.handle("scan:choose-folder", async (): Promise<string | null> => {
      const result = await dialog.showOpenDialog({ properties: ["openDirectory"], title: "Choose image folder" });
      return result.canceled ? null : (result.filePaths[0] ?? null);
   });
   ipcMain.handle("scan:start", async (event, rawRequest: unknown): Promise<LoadDataResult> => {
      const request = normalizeScanRequest(rawRequest);
      if (await getDuplicateFolderStatus()) {
         throw new Error("Restore or recycle the currently moved duplicates before starting another scan.");
      }
      if (!(await stat(request.rootPath)).isDirectory()) throw new Error("The selected path is not a directory");
      const report = (progress: ScanProgress): void => event.sender.send("scan:progress", progress);
      let scanWarningCount = 0;
      const reportWarning = (): void => {
         scanWarningCount += 1;
      };
      report({ phase: "discovering", completed: 0, total: 0 });
      const paths = await collectImagePaths(request.rootPath, reportWarning);
      report({ phase: "discovering", completed: paths.length, total: paths.length });
      const groups = await groupImages(await scanImages(paths, report, reportWarning), report);
      report({ phase: "saving", completed: 0, total: groups.length });
      saveScan(request.rootPath, groups);
      report({ phase: "saving", completed: groups.length, total: groups.length });
      return { ...(await getLoadResult()), scanWarningCount };
   });
   ipcMain.handle("decisions:save", (_event, rawDecisions: unknown): void => saveDecisions(normalizeDecisions(rawDecisions)));
   ipcMain.handle("position:save", (_event, groupId: unknown): void => {
      if (!isNonEmptyString(groupId)) throw new TypeError("Invalid detection id");
      saveCurrentGroupId(groupId);
   });
   ipcMain.handle("group:open-folder", async (_event, folderPath: unknown): Promise<void> => {
      if (isNonEmptyString(folderPath) && isWithinScanRoot(folderPath)) await openPath(folderPath);
   });
   ipcMain.handle("image:show", (_event, imagePath: unknown): void => {
      if (isNonEmptyString(imagePath) && isWithinScanRoot(imagePath)) shell.showItemInFolder(imagePath);
   });
   ipcMain.handle("image:open", async (_event, imagePath: unknown): Promise<void> => {
      if (isNonEmptyString(imagePath) && isWithinScanRoot(imagePath)) await openPath(imagePath);
   });
   ipcMain.handle("patch:apply", async (_event, rawDecisions: unknown) => {
      const decisions = normalizeDecisions(rawDecisions);
      saveDecisions(decisions);
      return applyDecisions(decisions);
   });
   ipcMain.handle("duplicate:status", getDuplicateFolderStatus);
   ipcMain.handle("duplicate:restore", restoreDuplicateFolder);
   ipcMain.handle("duplicate:trash", async (): Promise<void> => {
      const duplicatePath = await assertDuplicateFolderCanBeRecycled();
      await shell.trashItem(duplicatePath);
      setSetting("last_file_action", "recycled");
   });
};
