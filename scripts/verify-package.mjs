import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

// Verifies the packaged app in release/win-unpacked (or the mac/linux unpacked
// bundle) before it ships: Windows version resources must be branded, and the
// app must start, scan a small fixture library through the bundled sharp, and
// stay alive. Deeper flows are covered by the unpackaged smoke tests.
const productName = "Deduup";

const executablePath = () => {
   const base =
      process.platform === "win32"
         ? "release/win-unpacked"
         : process.platform === "linux"
           ? process.arch === "arm64"
              ? "release/linux-arm64-unpacked"
              : "release/linux-unpacked"
           : process.arch === "arm64"
             ? "release/mac-arm64"
             : "release/mac";
   const binary =
      process.platform === "darwin"
         ? path.join(base, `${productName}.app`, "Contents", "MacOS", productName)
         : process.platform === "win32"
           ? path.join(base, `${productName}.exe`)
           : path.join(base, productName);
   if (!existsSync(binary)) throw new Error(`Missing packaged executable: ${binary}`);
   return binary;
};

const powershellJson = (script) => {
   const result = spawnSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8" });
   if (result.status !== 0 || result.stdout === null) throw new Error(`PowerShell failed: ${result.stderr}`);
   return result.stdout;
};

const assertWindowsBranding = (binary) => {
   const metadata = JSON.parse(powershellJson(`(Get-Item -LiteralPath '${binary.replace(/'/gu, "''")}').VersionInfo | ConvertTo-Json -Compress`));
   if (metadata.FileDescription !== productName || metadata.ProductName !== productName) {
      throw new Error(`Unbranded Windows executable: FileDescription=${metadata.FileDescription}, ProductName=${metadata.ProductName}`);
   }
   if (Object.values(metadata).some((value) => typeof value === "string" && /electron/i.test(value))) {
      throw new Error(`Executable metadata still mentions Electron: ${JSON.stringify(metadata)}`);
   }
};

const windowsWindowShown = (pid) =>
   Number.parseInt(powershellJson(`(Get-Process | Where-Object Id -eq ${pid} | Where-Object { $_.MainWindowTitle }).Count`).trim(), 10) > 0;
const windowsProcessAlive = (pid) => powershellJson(`if (Get-Process -Id ${pid} -ErrorAction SilentlyContinue) { 'alive' } else { 'gone' }`).trim() === "alive";

const stop = async (child) => {
   if (child.exitCode !== null || child.signalCode !== null) return;
   if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"]);
   else child.kill();
   // SIGTERM is normally enough; escalate so a wedged app can never hang the run.
   for (let attempt = 0; attempt < 2; attempt++) {
      const exited = await Promise.race([
         new Promise((resolve) => child.once("exit", () => resolve(true))),
         new Promise((resolve) => setTimeout(() => resolve(false), 5000)),
      ]);
      if (exited) return;
      child.kill("SIGKILL");
   }
};

const launchAndScan = async (binary, fixtures) => {
   const profile = await mkdtemp(path.join(os.tmpdir(), "deduup-packaged-"));
   // CI runners cannot give chrome-sandbox its required root ownership, so the
   // Linux check starts without it; user machines are unaffected.
   const sandboxArgs = process.platform === "linux" ? ["--no-sandbox"] : [];
   const child = spawn(binary, [...sandboxArgs, `--user-data-dir=${profile}`, `--scan=${fixtures}`], { stdio: ["ignore", "pipe", "pipe"] });
   let output = "";
   child.stdout.on("data", (chunk) => {
      output += String(chunk);
   });
   child.stderr.on("data", (chunk) => {
      output += String(chunk);
   });
   // A spawn failure surfaces only as an "error" event; without this listener
   // the run would hang instead of reporting why the app never started.
   const spawnFailure = new Promise((resolve, reject) =>
      child.once("error", (error) => reject(new Error(`Could not start the packaged app: ${error.message}\n${output}`)))
   );
   spawnFailure.catch(() => undefined);
   try {
      const ran = (async () => {
         if (process.platform === "win32") {
            const deadline = Date.now() + 30_000;
            while (!windowsWindowShown(child.pid)) {
               if (!windowsProcessAlive(child.pid)) throw new Error(`The packaged app exited before showing a window.\n${output}`);
               if (Date.now() > deadline) throw new Error(`The packaged app never showed a window.\n${output}`);
               await new Promise((resolve) => setTimeout(resolve, 500));
            }
            // Give the --scan hook time to hash the fixtures; a broken native
            // module usually takes the process down here.
            await new Promise((resolve) => setTimeout(resolve, 8000));
         } else {
            // Without a display server there is no window title to poll; staying
            // alive through the scan is the packaging signal.
            await new Promise((resolve) => setTimeout(resolve, 12_000));
         }
         if (child.exitCode !== null || child.signalCode !== null)
            throw new Error(`The packaged app exited early (code ${child.exitCode}, signal ${child.signalCode}).\n${output}`);
      })();
      await Promise.race([
         ran,
         spawnFailure,
         new Promise((resolve, reject) => setTimeout(() => reject(new Error(`The packaged-app check timed out after 60s.\n${output}`)), 60_000)),
      ]);
   } finally {
      await stop(child).catch(() => undefined);
      await rm(profile, { recursive: true, force: true }).catch(() => undefined);
   }
};

const binary = executablePath();
if (process.platform === "win32") assertWindowsBranding(binary);
const fixtures = path.resolve(".cache/verify-package/fixtures");
const generated = spawnSync(process.execPath, ["scripts/makeFixtures.mjs", fixtures], { stdio: "inherit" });
if (generated.status !== 0 || !existsSync(fixtures)) throw new Error("Fixture generation failed.");
await launchAndScan(binary, fixtures);
console.log(`Packaged app at ${binary} launched, scanned, and closed cleanly.`);
