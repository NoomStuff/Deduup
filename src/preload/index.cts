import type { AppApi, Decisions, LoadDataResult, MoveResult, ScanProgress, ScanRequest } from "../shared/types.js";

const { contextBridge, ipcRenderer, webUtils } = require("electron") as typeof import("electron");

const api: AppApi = {
   loadData: async (): Promise<LoadDataResult> => ipcRenderer.invoke("data:load") as Promise<LoadDataResult>,
   chooseFolder: async (): Promise<string | null> => ipcRenderer.invoke("scan:choose-folder") as Promise<string | null>,
   scanFolder: async (request: ScanRequest): Promise<LoadDataResult> => ipcRenderer.invoke("scan:start", request) as Promise<LoadDataResult>,
   onScanProgress: (listener: (progress: ScanProgress) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: ScanProgress): void => listener(progress);
      ipcRenderer.on("scan:progress", handler);
      return () => ipcRenderer.removeListener("scan:progress", handler);
   },
   onScanComplete: (listener: (result: LoadDataResult) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, result: LoadDataResult): void => listener(result);
      ipcRenderer.on("scan:complete", handler);
      return () => ipcRenderer.removeListener("scan:complete", handler);
   },
   onAppError: (listener: (message: string) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, message: string): void => listener(message);
      ipcRenderer.on("app:error", handler);
      return () => ipcRenderer.removeListener("app:error", handler);
   },
   saveDecisions: async (decisions: Decisions): Promise<void> => {
      await ipcRenderer.invoke("decisions:save", decisions);
   },
   saveCurrentSet: async (setId: string): Promise<void> => {
      await ipcRenderer.invoke("sets:save-position", setId);
   },
   applyMoves: async (decisions: Decisions): Promise<MoveResult> => ipcRenderer.invoke("moves:apply", decisions) as Promise<MoveResult>,
   getDuplicateFolderStatus: async (): Promise<boolean> => ipcRenderer.invoke("duplicate:status") as Promise<boolean>,
   restoreDuplicateFolder: async (): Promise<MoveResult> => ipcRenderer.invoke("duplicate:restore") as Promise<MoveResult>,
   trashDuplicateFolder: async (): Promise<void> => {
      await ipcRenderer.invoke("duplicate:trash");
   },
   openSetFolder: async (folderPath: string): Promise<void> => {
      await ipcRenderer.invoke("sets:open-folder", folderPath);
   },
   showImage: async (imagePath: string): Promise<void> => {
      await ipcRenderer.invoke("image:show", imagePath);
   },
   openImage: async (imagePath: string): Promise<void> => {
      await ipcRenderer.invoke("image:open", imagePath);
   },
   getPathForFile: (file: File): string => webUtils.getPathForFile(file),
};

contextBridge.exposeInMainWorld("imageDeduplicator", api);
