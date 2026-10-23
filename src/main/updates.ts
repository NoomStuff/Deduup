import { app, net, type BrowserWindow } from "electron";
import { createHash } from "node:crypto";
import { open, link, copyFile, rm } from "node:fs/promises";
import { constants, existsSync } from "node:fs";
import { basename, join } from "node:path";
import type { AppUpdater } from "electron-updater";
import type { AvailableUpdate, UpdateStatus, UpdateState } from "../shared/types.js";
import { isPackagedApp } from "./identity.js";
import { fetchAvailableUpdate, repository } from "./updateCheck.js";

const updateFeedUrl = `https://raw.githubusercontent.com/${repository}/updates/`;

export const updateMode = (): AvailableUpdate["mode"] => {
   if (!isPackagedApp()) return "releases";
   if (process.platform === "win32")
      return process.env["PORTABLE_EXECUTABLE_FILE"] ? "download" : existsSync(join(process.resourcesPath, "app-update.yml")) ? "automatic" : "releases";
   if (process.platform === "linux")
      return Boolean(process.env["APPIMAGE"]) && existsSync(join(process.resourcesPath, "app-update.yml")) ? "automatic" : "releases";
   // Unsigned mac builds cannot use Squirrel.Mac; it needs a signed app and a zip feed.
   return "releases";
};

/** Main-process state survives renderer reloads and serves Settings and the title bar. */
export class UpdateManager {
   private window: BrowserWindow | null = null;
   private updater: AppUpdater | null = null;
   private current: AvailableUpdate | null = null;
   private busy = false;
   private readyVersion: string | null = null;
   private automaticVersion: string | null = null;
   private automaticRunning = false;
   private automaticWired = false;
   private checked = false;
   private installRecovery: (() => void) | null = null;
   private snapshot: UpdateState = { update: null, status: null, checking: false, lastChecked: null, message: "", checkError: null };
   downloadedPath: string | null = null;

   get state(): UpdateState {
      return this.snapshot;
   }

   attach(window: BrowserWindow): void {
      this.window = window;
   }

   private publish(patch: Partial<UpdateState>): void {
      this.snapshot = { ...this.snapshot, ...patch };
      if (this.window !== null && !this.window.isDestroyed()) this.window.webContents.send("update:state", this.snapshot);
   }

   private emit(status: UpdateStatus): void {
      if (status.version !== this.current?.version) return;
      this.publish({ status });
   }

   check = async (manual = true): Promise<AvailableUpdate | null> => {
      if ((!manual && this.checked) || this.snapshot.checking || this.busy || this.automaticRunning) return this.current;
      this.checked = true;
      this.publish({ checking: true, message: "Checking for updates", checkError: null });
      try {
         const update = await fetchAvailableUpdate(app.getVersion(), (url, init) => net.fetch(url, init));
         this.publish({ lastChecked: Date.now() });
         if (update === null) {
            this.current = null;
            this.publish({ update: null, status: null, message: manual ? "You're up to date" : "" });
            return null;
         }
         return this.offer(update);
      } catch {
         this.publish({ checkError: manual ? "Couldn't check for updates. Try again later." : null, message: "" });
         return this.current;
      } finally {
         this.publish({ checking: false });
      }
   };

   offer = (update: AvailableUpdate): AvailableUpdate => {
      const mode = updateMode();
      const same = this.current?.version === update.version && this.current.mode === mode;
      this.current = { ...update, mode };
      if (!same) this.downloadedPath = null;
      this.publish({ update: this.current, status: same ? this.snapshot.status : null, message: "An update is available" });
      if (mode === "automatic" && !this.automaticRunning && !this.isReady) void this.prepareAutomatic(this.current);
      return this.current;
   };

   private async prepareAutomatic(update: AvailableUpdate): Promise<void> {
      this.automaticRunning = true;
      this.automaticVersion = update.version;
      try {
         const module = (await import("electron-updater")) as { autoUpdater?: AppUpdater; default?: { autoUpdater?: AppUpdater } };
         const updater = module.autoUpdater ?? module.default?.autoUpdater;
         if (updater === undefined) throw new Error("electron-updater is unavailable.");
         this.updater = updater;
         updater.setFeedURL({ provider: "generic", url: updateFeedUrl });
         updater.autoDownload = true;
         updater.autoInstallOnAppQuit = false;
         // Only app packages appear on GitHub Releases; NSIS must download the
         // full installer because its separate blockmap is not published.
         if (process.platform === "win32") updater.disableDifferentialDownload = true;
         // electron-updater exposes a module singleton: wiring the listeners once keeps
         // repeated update offers from stacking duplicate progress and error handlers.
         if (!this.automaticWired) {
            this.automaticWired = true;
            updater.on("update-available", (info) => {
               this.automaticVersion = info.version;
            });
            updater.on("download-progress", (progress) => {
               if (this.automaticVersion !== null) this.emit({ phase: "downloading", version: this.automaticVersion, percent: Math.round(progress.percent) });
            });
            updater.on("update-downloaded", (info) => {
               this.readyVersion = info.version;
               this.emit({ phase: "ready", version: info.version, percent: 100 });
            });
            updater.on("error", () => {
               this.recoverInstall();
               this.emit({
                  phase: "error",
                  version: this.automaticVersion ?? update.version,
                  percent: null,
                  message: this.isReady
                     ? "Could not apply the update. Open the release to update manually."
                     : "Could not download the update. Open the release to update manually.",
               });
            });
         }
         this.emit({ phase: "downloading", version: update.version, percent: null });
         const result = await updater.checkForUpdates();
         if (result?.downloadPromise) await result.downloadPromise;
         if (this.readyVersion !== update.version)
            this.emit({
               phase: "error",
               version: update.version,
               percent: null,
               message: "The update package is not available yet. Open the release to update manually.",
            });
      } catch {
         this.emit({ phase: "error", version: update.version, percent: null, message: "Could not download the update. Open the release to update manually." });
      } finally {
         this.automaticRunning = false;
         // A newer release can be offered while the previous package is downloading.
         if (this.current?.mode === "automatic" && this.current.version !== update.version && !this.isReady) void this.prepareAutomatic(this.current);
      }
   }

   private recoverInstall(): void {
      const recover = this.installRecovery;
      this.installRecovery = null;
      recover?.();
   }

   install(onFailure: () => void): void {
      if (!this.isReady || this.updater === null || this.current === null) throw new Error("The update is not ready yet.");
      this.installRecovery = onFailure;
      try {
         this.updater.quitAndInstall(false, true);
      } catch {
         this.recoverInstall();
         this.emit({
            phase: "error",
            version: this.current.version,
            percent: null,
            message: "Could not apply the update. Open the release to update manually.",
         });
      }
   }
   get isReady(): boolean {
      return this.current?.mode === "automatic" && this.readyVersion !== null && this.readyVersion === this.current.version && this.updater !== null;
   }

   async downloadPortable(version: string): Promise<void> {
      if (this.busy || this.current?.mode !== "download" || this.current.version !== version || !/^\d+\.\d+\.\d+$/.test(version))
         throw new Error("This download is not available.");
      this.busy = true;
      this.emit({ phase: "downloading", version, percent: null });
      let temporary: string | null = null;
      let temporaryOwned = false;
      // A stalled connection must not pin the download slot forever: the watchdog aborts
      // after 30 seconds without progress, so users can retry the download.
      const abort = new AbortController();
      const guarded = <T>(work: Promise<T>): Promise<T> =>
         new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => {
               abort.abort();
               reject(new Error("The download stalled and was cancelled."));
            }, 30000);
            work.then(
               (value) => {
                  clearTimeout(timer);
                  resolve(value);
               },
               (error: unknown) => {
                  clearTimeout(timer);
                  reject(error instanceof Error ? error : new Error("The download failed."));
               }
            );
         });
      try {
         const name = `Deduup-${version}-win-${process.arch}.exe`;
         const releaseResponse = await guarded(
            net.fetch(`https://api.github.com/repos/${repository}/releases/tags/v${version}`, {
               headers: { Accept: "application/vnd.github+json", "User-Agent": `Deduup/${app.getVersion()}` },
               signal: abort.signal,
            })
         );
         if (!releaseResponse.ok) throw new Error("Could not find that release.");
         const release = (await guarded(releaseResponse.json())) as {
            assets?: ({ name?: unknown; browser_download_url?: unknown; digest?: unknown } | null)[];
         };
         const asset = Array.isArray(release.assets) ? release.assets.find((entry) => entry?.name === name) : undefined;
         if (!asset || typeof asset.browser_download_url !== "string") throw new Error("The matching download is missing from this release.");
         const expectedHash = typeof asset.digest === "string" && asset.digest.startsWith("sha256:") ? asset.digest.slice(7) : null;
         if (!expectedHash || !/^[0-9a-f]{64}$/i.test(expectedHash)) throw new Error("The download could not be verified.");
         const directory = app.getPath("downloads");
         const stem = name.slice(0, -4);
         let destination = join(directory, name);
         for (let index = 2; existsSync(destination) || existsSync(`${destination}.part`); index++) destination = join(directory, `${stem} (${index}).exe`);
         temporary = `${destination}.part`;
         const response = await guarded(net.fetch(asset.browser_download_url, { signal: abort.signal }));
         if (!response.ok || !response.body) throw new Error("The download failed.");
         const file = await open(temporary, "wx");
         temporaryOwned = true;
         const reader = response.body.getReader();
         const hash = createHash("sha256");
         const total = Number(response.headers.get("content-length")) || 0;
         let received = 0;
         let lastReported: number | null | undefined;
         try {
            for (;;) {
               const { done, value } = await guarded(reader.read());
               if (done) break;
               hash.update(value);
               await file.writeFile(value);
               received += value.length;
               const percent = total ? Math.min(99, Math.round((received / total) * 100)) : null;
               if (percent !== lastReported) {
                  lastReported = percent;
                  this.emit({ phase: "downloading", version, percent });
               }
            }
         } finally {
            await file.close();
         }
         if (hash.digest("hex").toLowerCase() !== expectedHash.toLowerCase()) throw new Error("The download did not pass verification.");
         // Publish without overwriting a file created while the download was in flight.
         try {
            await link(temporary, destination);
         } catch (error) {
            if (!["ENOTSUP", "ENOSYS", "EPERM", "EXDEV"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
            await copyFile(temporary, destination, constants.COPYFILE_EXCL);
         }
         await rm(temporary);
         temporary = null;
         this.downloadedPath = destination;
         this.emit({ phase: "downloaded", version, percent: 100, message: `Saved ${basename(destination)} to Downloads.`, path: destination });
      } catch (error) {
         this.emit({ phase: "error", version, percent: null, message: error instanceof Error ? error.message : "The download failed." });
         throw error;
      } finally {
         abort.abort();
         if (temporary && temporaryOwned) await rm(temporary, { force: true }).catch(() => undefined);
         this.busy = false;
      }
   }
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
