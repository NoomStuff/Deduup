import { rmSync } from "node:fs";
import { resolve } from "node:path";

const targets = ["dist", "dist-electron", "release", ".cache", "tsconfig.electron.tsbuildinfo", "tsconfig.renderer.tsbuildinfo"];

for (const target of targets) {
   rmSync(resolve(target), { force: true, recursive: true, maxRetries: 4, retryDelay: 250 });
}
