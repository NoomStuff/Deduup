import { execFileSync } from "node:child_process";
import process from "node:process";

// Usage: node scripts/package-app.mjs <dist|package> [win32|darwin|linux] [portable|installer|all]
const [mode, platform = process.platform, flavor = "portable", ...extra] = process.argv.slice(2);
if ((mode !== "dist" && mode !== "package") || extra.length > 0 || !["portable", "installer", "all"].includes(flavor)) {
   throw new Error("Usage: node scripts/package-app.mjs <dist|package> [win32|darwin|linux] [portable|installer|all]");
}
if (platform !== "win32" && platform !== "darwin" && platform !== "linux") throw new Error(`Unsupported platform: ${platform}`);
if (platform === "linux" && flavor === "installer") throw new Error("installer is not available on Linux.");
// Native modules (sharp) and the Electron binary are platform specific; a
// cross-platform invocation would silently package the wrong ones.
if (platform !== process.platform) throw new Error(`Build ${platform} on a ${platform} machine.`);
if (process.arch !== "x64" && process.arch !== "arm64") throw new Error(`Unsupported architecture: ${process.arch}`);

const run = (args) => {
   execFileSync("bun", args, { stdio: "inherit" });
};
run(["run", "build"]);

// Windows ships both shapes: the portable exe and an NSIS installer (the only
// target the automatic updater can apply updates to). mac ships a dmg, linux an AppImage.
const targets =
   platform === "win32"
      ? flavor === "installer"
         ? ["nsis"]
         : flavor === "all"
           ? ["portable", "nsis"]
           : ["portable"]
      : platform === "darwin"
        ? ["dmg"]
        : ["AppImage"];
run([
   "x",
   "--no-install",
   "electron-builder",
   platform === "darwin" ? "--mac" : platform === "win32" ? "--win" : "--linux",
   ...(mode === "dist" ? targets : []),
   `--${process.arch}`,
   "--publish=never",
   ...(mode === "package" ? ["--dir"] : []),
]);
