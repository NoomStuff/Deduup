import { app, BrowserWindow } from "electron";
import path from "node:path";

const isDev = process.env["VITE_DEV_SERVER_URL"] !== undefined || !app.isPackaged;

export const createWindow = (): void => {
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
         // Electron's sandboxed preloads cannot execute this project's ESM preload bundle.
         // Context isolation and disabled Node integration still keep renderer code separated.
         sandbox: false,
      },
   });
   if (isDev) void window.loadURL("http://127.0.0.1:5173");
   else void window.loadFile(path.join(app.getAppPath(), "dist", "index.html"));
};
