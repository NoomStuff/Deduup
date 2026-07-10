import { rmSync } from "node:fs";
import { resolve } from "node:path";

const targets = ["dist", "dist-electron", "release", ".cache", "tsconfig.electron.tsbuildinfo", "tsconfig.renderer.tsbuildinfo"];

for (const target of targets) {
   try {
      rmSync(resolve(target), { force: true, recursive: true });
   } catch (error) {
      if (error?.code !== "EBUSY" && error?.code !== "EPERM") {
         throw error;
      }

      console.warn(`Skipped locked build artifact: ${error.path ?? target}`);
   }
}
