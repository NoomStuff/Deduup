import { app, BrowserWindow, dialog, Menu } from "electron";
import path from "node:path";
import { closeDatabase, getDatabase } from "./database.js";
import { registerIpcHandlers, runScan, startLibraryMonitoring, stopLibraryMonitoring } from "./ipc.js";
import { registerPreviewProtocol } from "./previewProtocol.js";
import { createWindow } from "./window.js";
import { registerWindowsIdentity } from "./identity.js";
import { takeApplyUpdate, updateManager } from "./updates.js";

const scanArg = process.argv.find((argument) => argument.startsWith("--scan="));

// An unhandled main-process failure dies silently otherwise; surface it once,
// then let the app exit instead of limping along with unknown state.
let reportedFatalError = false;
process.on("uncaughtException", (error: unknown) => {
   console.error(error);
   if (reportedFatalError) return;
   reportedFatalError = true;
   dialog.showErrorBox("Deduup ran into a problem", `${error instanceof Error ? error.message : String(error)}\n\nThe app will now close.`);
   app.exit(1);
});
process.on("unhandledRejection", (reason: unknown) => {
   console.error(reason);
});

if (!app.requestSingleInstanceLock()) {
   app.quit();
} else {
   registerIpcHandlers();

   void app.whenReady().then(() => {
      getDatabase();
      registerPreviewProtocol();
      registerWindowsIdentity();
      Menu.setApplicationMenu(null);
      const window = createWindow();
      updateManager.attach(window);
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
      if (BrowserWindow.getAllWindows().length === 0) {
         const window = createWindow();
         updateManager.attach(window);
         startLibraryMonitoring(window.webContents);
      }
   });

   app.on("window-all-closed", () => {
      stopLibraryMonitoring();
      closeDatabase();
      const applyUpdate = takeApplyUpdate();
      if (applyUpdate !== null) applyUpdate();
      else if (process.platform !== "darwin") app.quit();
   });
}
