import { app, BrowserWindow, Menu } from "electron";
import path from "node:path";
import { closeDatabase, getDatabase } from "./database.js";
import { registerIpcHandlers, runScan, startLibraryMonitoring, stopLibraryMonitoring } from "./ipc.js";
import { registerPreviewProtocol } from "./previewProtocol.js";
import { createWindow } from "./window.js";

const scanArg = process.argv.find((argument) => argument.startsWith("--scan="));

if (!app.requestSingleInstanceLock()) {
   app.quit();
} else {
   registerIpcHandlers();

   void app.whenReady().then(() => {
      getDatabase();
      registerPreviewProtocol();
      Menu.setApplicationMenu(null);
      const window = createWindow();
      if (scanArg === undefined) startLibraryMonitoring(window.webContents);
      // Test/dev hook: --scan=<path> starts a scan as soon as the renderer is up,
      // so automated runs never have to drive the native folder dialog.
      if (scanArg !== undefined) {
         const rootPath = path.resolve(scanArg.slice("--scan=".length));
         window.webContents.on("did-finish-load", () => {
            void runScan(rootPath, window.webContents)
               .then((result) => window.webContents.send("scan:complete", result))
               .catch((error: unknown) => {
                  window.webContents.send("app:error", error instanceof Error ? error.message : "Scan failed");
               });
         });
      }
   });

   app.on("second-instance", () => {
      const window = BrowserWindow.getAllWindows()[0];
      if (window === undefined) return;
      if (window.isMinimized()) window.restore();
      window.focus();
   });

   app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) startLibraryMonitoring(createWindow().webContents);
   });

   app.on("window-all-closed", () => {
      stopLibraryMonitoring();
      closeDatabase();
      if (process.platform !== "darwin") app.quit();
   });
}
