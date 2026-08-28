import { rmSync } from "node:fs";
import { resolve } from "node:path";

const targets = ["dist", "dist-electron", "release", ".cache", "tsconfig.electron.tsbuildinfo", "tsconfig.renderer.tsbuildinfo"];

for (const target of targets) {
   try {
      rmSync(resolve(target), { force: true, recursive: true, maxRetries: 4, retryDelay: 250 });
   } catch (error) {
      // A running packaged app keeps release/ locked; building without it is fine.
      if (target === "release") console.warn(`Skipping locked folder: ${target}`);
      else throw error;
   }
}
