import type { AppApi, Decisions, LoadDataResult, MoveResult, ScanProgress, ScanRequest } from "../shared/types.js";

const { contextBridge, ipcRenderer, webUtils } = require("electron") as typeof import("electron");

const api: AppApi = {
   windowAction: async (action): Promise<void> => {
      await ipcRenderer.invoke("window:action", action);
   },
   loadData: async (): Promise<LoadDataResult> => ipcRenderer.invoke("data:load") as Promise<LoadDataResult>,
   chooseFolder: async (): Promise<string | null> => ipcRenderer.invoke("scan:choose-folder") as Promise<string | null>,
   scanFolder: async (request: ScanRequest): Promise<LoadDataResult> => ipcRenderer.invoke("scan:start", request) as Promise<LoadDataResult>,
   cancelScan: async (): Promise<void> => {
      await ipcRenderer.invoke("scan:cancel");
   },
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
   onLibraryUpdate: (listener: (result: LoadDataResult) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, result: LoadDataResult): void => listener(result);
      ipcRenderer.on("library:update", handler);
      return () => ipcRenderer.removeListener("library:update", handler);
   },
   setReviewBusy: async (busy: boolean): Promise<void> => {
      await ipcRenderer.invoke("review:busy", busy);
   },
   onLibraryError: (listener: (message: string) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, message: string): void => listener(message);
      ipcRenderer.on("library:error", handler);
      return () => ipcRenderer.removeListener("library:error", handler);
   },
   saveDecisions: async (decisions: Decisions, scanId: string): Promise<void> => {
      await ipcRenderer.invoke("decisions:save", decisions, scanId);
   },
   saveCurrentSet: async (setId: string, scanId: string): Promise<void> => {
      await ipcRenderer.invoke("sets:save-position", setId, scanId);
   },
   applyMoves: async (decisions: Decisions, scanId: string): Promise<MoveResult> => ipcRenderer.invoke("moves:apply", decisions, scanId) as Promise<MoveResult>,
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
