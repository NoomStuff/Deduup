import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { LibraryMonitor } from "../src/main/libraryMonitor.ts";

test("restarting monitoring cancels the old refresh and schedules the new root independently", async () => {
   const root = await mkdtemp(path.join(os.tmpdir(), "deduup-monitor-"));
   const errors = [];
   let firstSignal;
   let releaseFirst;
   let markFirstStarted;
   let markSecondStarted;
   let markFirstFinished;
   const firstStarted = new Promise((resolve) => {
      markFirstStarted = resolve;
   });
   const secondStarted = new Promise((resolve) => {
      markSecondStarted = resolve;
   });
   const firstFinished = new Promise((resolve) => {
      markFirstFinished = resolve;
   });
   const barrier = new Promise((resolve) => {
      releaseFirst = resolve;
   });
   let calls = 0;
   const monitor = new LibraryMonitor(
      async (_root, signal) => {
         calls += 1;
         if (calls === 1) {
            firstSignal = signal;
            markFirstStarted();
            await barrier;
            markFirstFinished();
            throw new Error("retired refresh failed");
         }
         markSecondStarted();
         return true;
      },
      (error) => errors.push(error)
   );
   try {
      monitor.start(root);
      await firstStarted;
      monitor.busy = true;
      monitor.start(root);
      assert.equal(firstSignal.aborted, true);
      assert.equal(monitor.busy, false);
      await secondStarted;
      releaseFirst();
      await firstFinished;
      await new Promise((resolve) => setImmediate(resolve));
      assert.deepEqual(errors, []);
      assert.equal(calls, 2);
   } finally {
      releaseFirst();
      monitor.stop();
      await rm(root, { recursive: true, force: true });
   }
});
