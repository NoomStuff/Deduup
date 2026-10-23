import { spawn } from "node:child_process";
import process from "node:process";

// Each suite owns a different fixture folder and Electron profile. Run them
// together, but print each suite's output as a block so failures stay readable.
const suites = ["smoke.mjs", "fileWorkflow.smoke.mjs", "libraryRefresh.smoke.mjs"];
const results = await Promise.all(
   suites.map(
      (suite) =>
         new Promise((resolve) => {
            const child = spawn(process.execPath, [`scripts/${suite}`], { stdio: ["ignore", "pipe", "pipe"] });
            const output = [];
            child.stdout.on("data", (chunk) => output.push(chunk));
            child.stderr.on("data", (chunk) => output.push(chunk));
            child.on("error", (error) => {
               output.push(Buffer.from(`${error.message}\n`));
            });
            child.on("close", (code) => {
               process.stdout.write(`\n${suite}\n${Buffer.concat(output).toString()}`);
               resolve(code === 0);
            });
         })
   )
);
if (results.some((passed) => !passed)) process.exitCode = 1;
