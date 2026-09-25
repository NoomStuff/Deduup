import { app, BrowserWindow } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";

const devServerUrl = process.env["VITE_DEV_SERVER_URL"] ?? "http://127.0.0.1:5173";
// Running from sources normally means the vite dev server; the smoke test sets
// IMAGE_DEDUPLICATOR_PROD=1 to load the built renderer instead.
const isDev = !app.isPackaged && process.env["IMAGE_DEDUPLICATOR_PROD"] !== "1";
// From sources the renderer is served by vite (assets live in public/); once
// packaged, vite's output rides along inside the app bundle.
const rendererDir = isDev ? "public" : path.join("build", "renderer");

export const createWindow = (): BrowserWindow => {
   const iconPath = path.join(app.getAppPath(), rendererDir, "favicon.ico");
   const window = new BrowserWindow({
      width: 1500,
      height: 940,
      minWidth: 960,
      minHeight: 720,
      backgroundColor: "#131313",
      titleBarStyle: "hidden",
      icon: iconPath,
      webPreferences: {
         preload: path.join(app.getAppPath(), "build", "electron", "preload", "index.cjs"),
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
         : target.protocol === "file:" && target.pathname === pathToFileURL(path.join(app.getAppPath(), rendererDir, "index.html")).pathname;
      if (!isExpected) event.preventDefault();
   });

   if (isDev) void window.loadURL(devServerUrl);
   else void window.loadFile(path.join(app.getAppPath(), rendererDir, "index.html"));
   return window;
};
