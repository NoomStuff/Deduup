import { app, net, type BrowserWindow } from "electron";
import { createHash } from "node:crypto";
import { open, rename, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import type { AppUpdater } from "electron-updater";
import type { AvailableUpdate, UpdateStatus } from "../shared/types.js";
import { isPackagedApp } from "./identity.js";
import { repository } from "./updateCheck.js";

// electron-updater reads its feed from this branch, not from Releases, so the
// feed can point at release assets without shipping feed files on the release.
const updateFeedUrl = `https://raw.githubusercontent.com/${repository}/updates/`;

export const updateMode = (): AvailableUpdate["mode"] => {
   if (!isPackagedApp()) return "releases";
   if (process.platform === "win32")
      return process.env["PORTABLE_EXECUTABLE_FILE"] !== undefined
         ? "download"
         : existsSync(join(process.resourcesPath, "app-update.yml"))
           ? "automatic"
           : "releases";
   if (process.platform === "linux")
      return process.env["APPIMAGE"] !== undefined && existsSync(join(process.resourcesPath, "app-update.yml")) ? "automatic" : "releases";
   // Unsigned mac builds cannot use Squirrel.Mac; it needs a signed app and a zip feed.
   return "releases";
};

/**
 * One update at a time. automatic installs through electron-updater, download
 * streams the portable exe into Downloads with a sha256 check, releases only
 * carries the release URL for the renderer to open.
 */
export class UpdateManager {
   private window: BrowserWindow | null = null;
   private updater: AppUpdater | null = null;
   private current: AvailableUpdate | null = null;
   private busy = false;
   private ready = false;
   downloadedPath: string | null = null;

   attach(window: BrowserWindow): void {
      this.window = window;
   }

   private emit(status: UpdateStatus): void {
      if (this.window !== null && !this.window.isDestroyed()) this.window.webContents.send("update:status", status);
   }

   offer = (update: AvailableUpdate): AvailableUpdate => {
      const mode = updateMode();
      this.current = { ...update, mode };
      if (mode === "automatic") void this.prepareAutomatic(this.current);
      return this.current;
   };

   private async prepareAutomatic(update: AvailableUpdate): Promise<void> {
      try {
         // electron-updater is CJS; its named export can arrive on the module
         // or on default depending on how the runtime interops it.
         const module = (await import("electron-updater")) as { autoUpdater?: AppUpdater; default?: { autoUpdater?: AppUpdater } };
         const updater = module.autoUpdater ?? module.default?.autoUpdater;
         if (updater === undefined) throw new Error("electron-updater is unavailable.");
         this.updater = updater;
         updater.setFeedURL({ provider: "generic", url: updateFeedUrl });
         updater.autoDownload = true;
         updater.autoInstallOnAppQuit = false;
         // Only the installer is published for Windows; its separate blockmap
         // is not, so differential downloads would always fail.
         if (process.platform === "win32") updater.disableDifferentialDownload = true;
         updater.on("download-progress", (progress) => this.emit({ phase: "downloading", version: update.version, percent: Math.round(progress.percent) }));
         updater.on("update-downloaded", () => {
            this.ready = true;
            this.emit({ phase: "ready", version: update.version, percent: 100 });
         });
         updater.on("error", () =>
            this.emit({
               phase: "error",
               version: update.version,
               percent: null,
               message: "Could not download the update. Open the release to update manually.",
            })
         );
         this.emit({ phase: "downloading", version: update.version, percent: null });
         const result = await updater.checkForUpdates();
         if (result === null)
            this.emit({
               phase: "error",
               version: update.version,
               percent: null,
               message: "The update package is not available yet. Open the release to update manually.",
            });
      } catch {
         this.emit({ phase: "error", version: update.version, percent: null, message: "Could not download the update. Open the release to update manually." });
      }
   }

   get isReady(): boolean {
      return this.ready && this.updater !== null;
   }

   install = (): void => {
      if (!this.ready || this.updater === null) throw new Error("The update is not ready yet.");
      this.updater.quitAndInstall(false, true);
   };

   downloadPortable = async (version: string): Promise<void> => {
      if (this.busy || this.current?.mode !== "download" || this.current.version !== version || !/^\d+\.\d+\.\d+$/.test(version))
         throw new Error("This download is not available.");
      this.busy = true;
      let temporary: string | null = null;
      try {
         const name = `Deduup-${version}-win-${process.arch}.exe`;
         const releaseResponse = await net.fetch(`https://api.github.com/repos/${repository}/releases/tags/v${version}`, {
            headers: { Accept: "application/vnd.github+json", "User-Agent": `Deduup/${app.getVersion()}` },
         });
         if (!releaseResponse.ok) throw new Error("Could not find that release.");
         const release = (await releaseResponse.json()) as {
            assets?: { name?: unknown; browser_download_url?: unknown; digest?: unknown }[];
         };
         const asset = (release.assets ?? []).find((entry) => entry.name === name);
         if (asset === undefined || typeof asset.browser_download_url !== "string") throw new Error("The matching download is missing from this release.");
         // GitHub publishes a sha256 digest per asset; refuse anything else.
         const expectedHash = typeof asset.digest === "string" && asset.digest.startsWith("sha256:") ? asset.digest.slice(7) : null;
         if (expectedHash === null || !/^[0-9a-f]{64}$/i.test(expectedHash)) throw new Error("The download could not be verified.");
         const directory = app.getPath("downloads");
         const stem = name.slice(0, -4);
         let destination = join(directory, name);
         for (let index = 2; existsSync(destination) || existsSync(`${destination}.part`); index++) destination = join(directory, `${stem} (${index}).exe`);
         temporary = `${destination}.part`;
         const response = await net.fetch(asset.browser_download_url);
         if (!response.ok || response.body === null) throw new Error("The download failed.");
         const file = await open(temporary, "wx");
         const reader = response.body.getReader();
         const hash = createHash("sha256");
         const total = Number(response.headers.get("content-length")) || 0;
         let received = 0;
         let lastReported: number | null | undefined;
         try {
            for (;;) {
               const { done, value } = await reader.read();
               if (done) break;
               hash.update(value);
               await file.writeFile(value);
               received += value.length;
               const percent = total > 0 ? Math.min(99, Math.round((received / total) * 100)) : null;
               if (percent !== lastReported) {
                  lastReported = percent;
                  this.emit({ phase: "downloading", version, percent });
               }
            }
         } finally {
            await file.close();
         }
         if (hash.digest("hex").toLowerCase() !== expectedHash.toLowerCase()) throw new Error("The download did not pass verification.");
         await rename(temporary, destination);
         temporary = null;
         this.downloadedPath = destination;
         this.emit({ phase: "downloaded", version, percent: 100, message: `Saved ${basename(destination)} to Downloads.`, path: destination });
      } catch (error) {
         this.emit({ phase: "error", version, percent: null, message: error instanceof Error ? error.message : "The download failed." });
         throw error;
      } finally {
         if (temporary !== null) await rm(temporary, { force: true }).catch(() => undefined);
         this.busy = false;
      }
   };
}

export const updateManager = new UpdateManager();

// The update installs through the normal quit path: main.ts applies this after
// the database is closed instead of quitting directly.
let pendingApplyUpdate: (() => void) | null = null;
export const setApplyUpdate = (apply: () => void): void => {
   pendingApplyUpdate = apply;
};
export const takeApplyUpdate = (): (() => void) | null => {
   const apply = pendingApplyUpdate;
   pendingApplyUpdate = null;
   return apply;
};
