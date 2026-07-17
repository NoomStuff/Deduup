import { app, BrowserWindow, Menu } from "electron";
import { closeDatabase, getDatabase } from "./database.js";
import { registerIpcHandlers } from "./ipc.js";
import { registerPreviewProtocol } from "./previewProtocol.js";
import { createWindow } from "./window.js";

if (!app.requestSingleInstanceLock()) {
   app.quit();
} else {
   registerIpcHandlers();

   void app.whenReady().then(() => {
      getDatabase();
      registerPreviewProtocol();
      Menu.setApplicationMenu(null);
      createWindow();
   });

   app.on("second-instance", () => {
      const window = BrowserWindow.getAllWindows()[0];
      if (window === undefined) return;
      if (window.isMinimized()) window.restore();
      window.focus();
   });

   app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
   });

   app.on("window-all-closed", () => {
      closeDatabase();
      if (process.platform !== "darwin") app.quit();
   });
}
