import { watch } from "node:fs";
import type { FSWatcher } from "node:fs";
import path from "node:path";
import { duplicateContainerFolderName, managedDuplicateFolderName } from "../shared/constants.js";

/** Coalesce filesystem changes and retry while review or file operations own the library. */
export class LibraryMonitor {
   private watcher: FSWatcher | null = null;
   private timer: ReturnType<typeof setTimeout> | null = null;
   private poll: ReturnType<typeof setInterval> | null = null;
   private generation = 0;
   private dirty = false;
   private running = false;
   private lastError: string | null = null;
   busy = false;

   private readonly refresh: (root: string) => Promise<boolean>;
   private readonly reportError: (error: unknown) => void;
   constructor(refresh: (root: string) => Promise<boolean>, reportError: (error: unknown) => void) {
      this.refresh = refresh;
      this.reportError = reportError;
   }

   start(root: string): void {
      this.stop();
      const generation = this.generation;
      const schedule = (): void => {
         if (generation !== this.generation) return;
         this.dirty = true;
         if (this.timer !== null || this.running) return;
         this.timer = setTimeout(() => {
            this.timer = null;
            void this.flush(root, generation, schedule);
         }, 1000);
      };
      try {
         this.watcher = watch(root, { recursive: true }, (_event, filename) => {
            const managed = path.join(duplicateContainerFolderName, managedDuplicateFolderName);
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

   private async flush(root: string, generation: number, schedule: () => void): Promise<void> {
      if (generation !== this.generation) return;
      if (this.busy) {
         schedule();
         return;
      }
      this.running = true;
      this.dirty = false;
      try {
         if (!(await this.refresh(root))) this.dirty = true;
         else this.lastError = null;
      } catch (error: unknown) {
         const message = error instanceof Error ? error.message : String(error);
         if (message !== this.lastError) this.reportError(error);
         this.lastError = message;
      } finally {
         this.running = false;
         if (generation === this.generation && this.dirty) schedule();
      }
   }

   stop(): void {
      this.generation += 1;
      this.watcher?.close();
      this.watcher = null;
      if (this.timer !== null) clearTimeout(this.timer);
      if (this.poll !== null) clearInterval(this.poll);
      this.timer = null;
      this.poll = null;
      this.dirty = false;
      this.lastError = null;
   }
}
