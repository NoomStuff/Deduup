import { app, net, type BrowserWindow } from "electron";
import type { AvailableUpdate, UpdateState, UpdateStatus } from "../shared/types.js";
import { fetchAvailableUpdate, UpdateManager, updateMode } from "./update-manager.js";

/**
 * Main-process update state survives renderer reloads and serves Settings and the title bar.
 * Downloading, verifying and installing live in the shared update-manager core.
 */
export class Updates {
   private window: BrowserWindow | null = null;
   private current: AvailableUpdate | null = null;
   private checked = false;
   private snapshot: UpdateState = { update: null, status: null, checking: false, lastChecked: null, message: "", checkError: null };
   private readonly manager = new UpdateManager((status) => this.emit(status));

   get state(): UpdateState {
      return this.snapshot;
   }

   get downloadedPath(): string | null {
      return this.manager.downloadedPath;
   }

   get isReady(): boolean {
      return this.current?.mode === "automatic" && this.manager.isReady;
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

   private get busy(): boolean {
      return this.snapshot.status?.phase === "downloading";
   }

   check = async (manual = true): Promise<AvailableUpdate | null> => {
      if ((!manual && this.checked) || this.snapshot.checking || this.busy) return this.current;
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
      const same = this.current?.version === update.version && this.current.mode === updateMode();
      // Set before the core starts an automatic download, so its first status is not filtered out.
      this.current = { ...update, mode: updateMode() };
      this.publish({ update: this.current, status: same ? this.snapshot.status : null, message: "An update is available" });
      this.current = this.manager.offer(update);
      return this.current;
   };

   async downloadPortable(version: string): Promise<void> {
      this.emit({ phase: "downloading", version, percent: null });
      await this.manager.downloadPortable(version);
   }

   /** Starts the silent installer through the normal quit path. `onFailure` restores the app if it cannot start. */
   install(onFailure: () => void): void {
      if (!this.isReady || this.current === null) throw new Error("The update is not ready yet.");
      const version = this.current.version;
      const failed = (message: string) => {
         onFailure();
         this.emit({ phase: "error", version, percent: null, message });
      };
      try {
         this.manager.install(failed);
      } catch (error) {
         failed(error instanceof Error ? error.message : "Could not apply the update. Open the release to update manually.");
      }
   }
}

export const updateManager = new Updates();
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
