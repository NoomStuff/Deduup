// Launches the packaged app produced by `bun run dist`. The artifact layout
// differs per platform, so the search depends on where this is running:
//   win32  → portable .exe at the release/ root
//   darwin → .app bundle inside release/mac*/
//   linux  → .AppImage at the release/ root
import { chmodSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";

const releaseDir = resolve("release");

const listDir = (dir) => {
   try {
      return readdirSync(dir, { withFileTypes: true });
   } catch {
      return [];
   }
};

const findArtifact = () => {
   const entries = listDir(releaseDir).sort((a, b) => a.name.localeCompare(b.name));
   if (process.platform === "win32") {
      const exe = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".exe")).at(-1);
      return exe && join(releaseDir, exe.name);
   }
   if (process.platform === "darwin") {
      for (const entry of entries.filter((entry) => entry.isDirectory() && entry.name.startsWith("mac"))) {
         const app = listDir(join(releaseDir, entry.name)).find((child) => child.isDirectory() && child.name.endsWith(".app"));
         if (app) return join(releaseDir, entry.name, app.name);
      }
      return undefined;
   }
   const appImage = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".AppImage")).at(-1);
   return appImage && join(releaseDir, appImage.name);
};

const artifact = findArtifact();
if (!artifact) {
   console.error(`No packaged app found in release/. Run \`bun run dist\` first.`);
   process.exit(1);
}

if (process.platform === "linux") {
   // AppImages are not executable as extracted by electron-builder.
   chmodSync(artifact, 0o755);
}
if (process.platform === "darwin") {
   spawn("open", [artifact], { detached: true, stdio: "ignore" }).unref();
} else {
   spawn(artifact, { detached: true, stdio: "ignore" }).unref();
}
