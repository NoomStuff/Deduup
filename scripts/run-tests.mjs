import { spawnSync } from "node:child_process";
import process from "node:process";

// bun test prints one line per test; most runs only need the outcome.
// A failing run still prints everything.
const result = spawnSync("bun", ["test", "scripts"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
if (result.status !== 0) {
   process.stdout.write(output);
   process.exit(result.status ?? 1);
}
const summary = output
   .split(/\r?\n/u)
   .filter((line) => /^\s*\d+ (pass|fail|skip)\b/u.test(line) || /^Ran \d+ tests/u.test(line))
   .join("\n");
process.stdout.write(`${summary}\n`);
