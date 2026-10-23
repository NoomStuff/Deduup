import { watch } from "node:fs";
import type { FSWatcher } from "node:fs";
import path from "node:path";
import { getManagedFolderPaths } from "./managedFolder.js";

/** Coalesce filesystem changes and retry while review or file operations own the library. */
export class LibraryMonitor {
   private watcher: FSWatcher | null = null;
   private timer: ReturnType<typeof setTimeout> | null = null;
   private poll: ReturnType<typeof setInterval> | null = null;
   private controller: AbortController | null = null;
   private generation = 0;
   private dirty = false;
   private running = false;
   private lastError: string | null = null;
   busy = false;

   private readonly refresh: (root: string, signal: AbortSignal) => Promise<boolean>;
   private readonly reportError: (error: unknown) => void;
   constructor(refresh: (root: string, signal: AbortSignal) => Promise<boolean>, reportError: (error: unknown) => void) {
      this.refresh = refresh;
      this.reportError = reportError;
   }

   start(root: string): void {
      this.stop();
      const controller = new AbortController();
      this.controller = controller;
      const generation = this.generation;
      const schedule = (): void => {
         if (generation !== this.generation) return;
         this.dirty = true;
         if (this.timer !== null || this.running) return;
         this.timer = setTimeout(() => {
            this.timer = null;
            void this.flush(root, generation, controller.signal, schedule);
         }, 1000);
      };
      const managed = path.relative(root, getManagedFolderPaths(root).managedPath);
      try {
         this.watcher = watch(root, { recursive: true }, (_event, filename) => {
            if (filename !== null && (filename === managed || filename.startsWith(`${managed}${path.sep}`))) return;
            schedule();
         });
         this.watcher.on("error", () => {
            this.watcher?.close();
            this.watcher = null;
            schedule();
         });
      } catch {
         // Periodic reconciliation also covers roots whose filesystem cannot be watched.
      }
      this.poll = setInterval(schedule, 60_000);
      schedule();
   }

   private async flush(root: string, generation: number, signal: AbortSignal, schedule: () => void): Promise<void> {
      if (generation !== this.generation) return;
      if (this.busy) {
         schedule();
         return;
      }
      this.running = true;
      this.dirty = false;
      try {
         const refreshed = await this.refresh(root, signal);
         if (generation === this.generation) {
            if (!refreshed) this.dirty = true;
            else this.lastError = null;
         }
      } catch (error: unknown) {
         if (!signal.aborted) {
            const message = error instanceof Error ? error.message : String(error);
            if (message !== this.lastError) this.reportError(error);
            this.lastError = message;
         }
      } finally {
         if (generation === this.generation) {
            this.running = false;
            if (this.dirty) schedule();
         }
      }
   }

   stop(): void {
      this.generation += 1;
      this.controller?.abort();
      this.controller = null;
      this.watcher?.close();
      this.watcher = null;
      if (this.timer !== null) clearTimeout(this.timer);
      if (this.poll !== null) clearInterval(this.poll);
      this.timer = null;
      this.poll = null;
      this.dirty = false;
      this.running = false;
      this.busy = false;
      this.lastError = null;
   }
}
