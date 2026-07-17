import { app, BrowserWindow } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";

const devServerUrl = process.env["VITE_DEV_SERVER_URL"] ?? "http://127.0.0.1:5173";
const isDev = !app.isPackaged;

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
         preload: path.join(app.getAppPath(), "dist-electron", "preload", "index.cjs"),
         contextIsolation: true,
         nodeIntegration: false,
         sandbox: true,
      },
   });
   window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
   window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
   window.webContents.on("will-navigate", (event, targetUrl) => {
      const target = new URL(targetUrl);
      const isExpected = isDev
         ? target.origin === new URL(devServerUrl).origin
         : target.protocol === "file:" && target.pathname === pathToFileURL(path.join(app.getAppPath(), "dist", "index.html")).pathname;
      if (!isExpected) event.preventDefault();
   });

   if (isDev) void window.loadURL(devServerUrl);
   else void window.loadFile(path.join(app.getAppPath(), "dist", "index.html"));
};
