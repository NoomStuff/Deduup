import { rmSync } from "node:fs";
import { resolve } from "node:path";

// build/ holds intermediates (renderer + electron compile output), release/
// holds packaged artifacts, .cache/ holds tsbuildinfo files and test screenshots.
const targets = ["build", "release", ".cache"];

for (const target of targets) {
   try {
      rmSync(resolve(target), { force: true, recursive: true, maxRetries: 4, retryDelay: 250 });
   } catch (error) {
      // A running packaged app keeps release/ locked; building without it is fine.
      if (target === "release") console.warn(`Skipping locked folder: ${target}`);
      else throw error;
   }
}
