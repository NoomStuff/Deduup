import { contextBridge, ipcRenderer } from "electron";
import type { AppApi, Decisions, LoadDataResult, PatchResult, ScanProgress, ScanRequest } from "../shared/types.js";

const api: AppApi = {
   loadData: async (): Promise<LoadDataResult> => ipcRenderer.invoke("data:load") as Promise<LoadDataResult>,
   chooseFolder: async (): Promise<string | null> => ipcRenderer.invoke("scan:choose-folder") as Promise<string | null>,
   scanFolder: async (request: ScanRequest): Promise<LoadDataResult> => ipcRenderer.invoke("scan:start", request) as Promise<LoadDataResult>,
   onScanProgress: (listener: (progress: ScanProgress) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: ScanProgress): void => listener(progress);
      ipcRenderer.on("scan:progress", handler);
      return () => ipcRenderer.removeListener("scan:progress", handler);
   },
   saveDecisions: async (decisions: Decisions): Promise<void> => {
      await ipcRenderer.invoke("decisions:save", decisions);
   },
   applyPatch: async (decisions: Decisions): Promise<PatchResult> => ipcRenderer.invoke("patch:apply", decisions) as Promise<PatchResult>,
   getDuplicateFolderStatus: async (): Promise<boolean> => ipcRenderer.invoke("duplicate:status") as Promise<boolean>,
   restoreDuplicateFolder: async (): Promise<PatchResult> => ipcRenderer.invoke("duplicate:restore") as Promise<PatchResult>,
   trashDuplicateFolder: async (): Promise<void> => {
      await ipcRenderer.invoke("duplicate:trash");
   },
   openGroupFolder: async (folderPath: string): Promise<void> => {
      await ipcRenderer.invoke("group:open-folder", folderPath);
   },
   showImage: async (imagePath: string): Promise<void> => {
      await ipcRenderer.invoke("image:show", imagePath);
   },
   openImage: async (imagePath: string): Promise<void> => {
      await ipcRenderer.invoke("image:open", imagePath);
   },
};

contextBridge.exposeInMainWorld("imageDeduplicator", api);
