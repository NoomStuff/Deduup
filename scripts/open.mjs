import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const releaseDir = resolve("release");
const exes = readdirSync(releaseDir, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith(".exe"));

if (exes.length === 0) {
   console.error("No built exe found in release/. Run `bun run dist:win` first.");
   process.exit(1);
}

// The exe name embeds the version, so pick whatever is there instead of hardcoding it.
for (const exe of exes) {
   spawn(resolve(releaseDir, exe.name), { detached: true, stdio: "ignore" }).unref();
}
