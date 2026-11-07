import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { _electron as electron } from "playwright-core";
import sharp from "sharp";

// Large-library benchmark. Builds a deterministic synthetic library (thousands
// of 3-image source groups) and measures the app the way a user meets it:
//   cold     fresh profile, scan the library, review appears
//   relaunch saved review opens without a scan, first thumbnails paint, idle
//            cost while the library monitor reconciles, memory, interactions
//   rescan   scanning the same, unchanged library again
// Interactions are driven and timed inside the page (rAF polling) so protocol
// latency does not pollute the numbers.
//   node scripts/perfProbe.mjs            build fixtures if missing, then measure
//   node scripts/perfProbe.mjs --rebuild  wipe fixtures, rebuild, measure

const root = ".cache/bench";
const scanRoot = path.join(root, "scan-root");
const profile = path.join(root, "profile");
const resultFile = path.join(root, process.env["PERF_RESULT"] ?? "result.json");
const rebuild = process.argv.includes("--rebuild");

const setCount = 2_500;
const setSize = 3;

// Each set is a seeded grid of saturated blocks, so unrelated sets sit far
// apart in hash space. Variants are what real duplicates look like: the
// original, a downscaled re-encode, and a slightly brightened copy.
const random = (seed) => () => {
   seed = (seed + 0x6d2b79f5) | 0;
   let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
   value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
   return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
};
const scene = (setIndex) => {
   const next = random(setIndex + 1);
   const blocks = [];
   for (let y = 0; y < 4; y += 1)
      for (let x = 0; x < 5; x += 1)
         blocks.push(
            `<rect x="${x * 320}" y="${y * 300}" width="320" height="300" fill="hsl(${Math.floor(next() * 360)} ${50 + Math.floor(next() * 50)}% ${15 + Math.floor(next() * 70)}%)"/>`
         );
   return Buffer.from(`<svg width="1600" height="1200" xmlns="http://www.w3.org/2000/svg">${blocks.join("")}</svg>`);
};
const writeVariant = (setIndex, variant, file) => {
   const image = sharp(scene(setIndex), { failOn: "none" });
   if (variant === 1) return image.resize(1200, 900).jpeg({ quality: 78 }).toFile(file);
   if (variant === 2) return image.modulate({ brightness: 1.04 }).jpeg({ quality: 92 }).toFile(file);
   return image.jpeg({ quality: 88 }).toFile(file);
};

const buildLibrary = async () => {
   await mkdir(scanRoot, { recursive: true });
   let wrote = 0;
   for (let setIndex = 0; setIndex < setCount; setIndex += 1) {
      const folder = path.join(scanRoot, `setgroup_${String(Math.floor(setIndex / 200)).padStart(2, "0")}`);
      if (setIndex % 200 === 0) await mkdir(folder, { recursive: true });
      for (let variant = 0; variant < setSize; variant += 1) {
         const file = path.join(folder, `im${setIndex}_${variant}.jpg`);
         if ((await stat(file).catch(() => null))?.isFile() === true) continue;
         await writeVariant(setIndex, variant, file);
         wrote += 1;
      }
   }
   return wrote;
};

const summarize = (samples) => {
   const cleaned = samples.filter((value) => value >= 0).sort((left, right) => left - right);
   const pick = (fraction) => cleaned[Math.min(cleaned.length - 1, Math.floor(fraction * cleaned.length))] ?? null;
   const round = (value) => (value === null ? null : Math.round(value * 10) / 10);
   return { n: cleaned.length, p50: round(pick(0.5)), p90: round(pick(0.9)), max: round(cleaned.at(-1) ?? null) };
};

const launch = (args) => electron.launch({ args: [".", `--user-data-dir=${profile}`, ...args], env: { ...process.env, IMAGE_DEDUPLICATOR_PROD: "1" } });

/** CPU seconds and memory across every app process. */
const sampleMetrics = (app) =>
   app.evaluate(({ app: electronApp }) => {
      const metrics = electronApp.getAppMetrics();
      return {
         cpuSeconds: metrics.reduce((total, metric) => total + (metric.cpu.cumulativeCPUUsage ?? 0), 0),
         mainCpuSeconds: metrics.find((metric) => metric.type === "Browser")?.cpu.cumulativeCPUUsage ?? 0,
         workingSetMb: Math.round(metrics.reduce((total, metric) => total + metric.memory.workingSetSize, 0) / 1024),
         mainWorkingSetMb: Math.round((metrics.find((metric) => metric.type === "Browser")?.memory.workingSetSize ?? 0) / 1024),
      };
   });

/** Every card image in the current set has decoded pixels. */
const thumbsPainted = () => {
   const images = [...document.querySelectorAll(".imageCard__img")];
   return images.length > 0 && images.every((image) => image.complete && image.naturalWidth > 0);
};

if (rebuild) await rm(scanRoot, { recursive: true, force: true });
const imagesWritten = await buildLibrary();
await rm(profile, { recursive: true, force: true });
const report = { imagesWritten, sourceGroupCount: setCount, imagesPerSourceGroup: setSize };

// Cold: fresh profile, full hash of every image.
{
   const started = Date.now();
   const app = await launch([`--scan=${scanRoot}`]);
   try {
      const window = await app.firstWindow();
      await window.waitForSelector(".filmstrip__item", { timeout: 600_000 });
      report.coldScanMs = Date.now() - started;
      report.detectedSetCount = await window.locator(".filmstrip__item").count();
      await window.evaluate(() => window.localStorage.setItem("show-start-screen-on-startup", "false"));
      await window.waitForTimeout(500);
   } finally {
      await app.close();
   }
}

// Relaunch: the saved review, no scan.
{
   const started = Date.now();
   const app = await launch([]);
   try {
      const window = await app.firstWindow();
      await window.waitForSelector(".setHeader__number", { timeout: 120_000 });
      report.relaunchToReviewMs = Date.now() - started;
      await window.waitForFunction(thumbsPainted, undefined, { timeout: 120_000, polling: 16 });
      report.relaunchToThumbnailsMs = Date.now() - started;

      const before = await sampleMetrics(app);
      await window.waitForTimeout(15_000);
      const after = await sampleMetrics(app);
      report.idle15s = {
         cpuSeconds: Math.round((after.cpuSeconds - before.cpuSeconds) * 100) / 100,
         mainCpuSeconds: Math.round((after.mainCpuSeconds - before.mainCpuSeconds) * 100) / 100,
      };
      report.memoryAfterIdle = { workingSetMb: after.workingSetMb, mainWorkingSetMb: after.mainWorkingSetMb };
      report.rendererHeapMb = await window.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1048576));

      // Normalize the starting set and choices so repeated runs measure the same thing.
      await window.locator(".filmstrip__item").first().click();
      await window.waitForFunction(() => document.querySelector(".filmstrip__item")?.getAttribute("aria-current") === "true");
      await window.waitForTimeout(500);

      const probe = await window.evaluate(
         async ({ toggles, undos, navigations, jumps }) => {
            const now = () => performance.now();
            const until = (condition, deadlineMs = 10_000) =>
               new Promise((resolve) => {
                  const t0 = now();
                  const check = () => {
                     if (condition()) return resolve(now() - t0);
                     if (now() - t0 > deadlineMs) return resolve(-1);
                     requestAnimationFrame(check);
                  };
                  check();
               });
            const press = (key, extra = {}) => window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...extra }));
            const chipCount = () => document.querySelectorAll(".imageCard__chip--discarded").length;
            const setNumber = () => document.querySelector(".setHeader__number")?.textContent ?? "";
            const painted = () => {
               const images = [...document.querySelectorAll(".imageCard__img")];
               return images.length > 0 && images.every((image) => image.complete && image.naturalWidth > 0);
            };
            const results = { toggle: [], undo: [], navigate: [], coldSetThumbs: [] };

            for (let index = 0; index < toggles; index += 1) {
               const target = chipCount() === 1 ? 0 : 1;
               press("1");
               results.toggle.push(await until(() => chipCount() === target));
            }
            for (let index = 0; index < undos; index += 1) {
               const before = chipCount();
               press("z", { ctrlKey: true });
               results.undo.push(await until(() => chipCount() !== before));
            }
            for (let index = 0; index < navigations; index += 1) {
               const before = setNumber();
               press("ArrowRight");
               results.navigate.push(await until(() => setNumber() !== before && setNumber() !== ""));
            }
            // Jump far outside the preload window: thumbnails are cold.
            const items = document.querySelectorAll(".filmstrip__item");
            for (let index = 0; index < jumps; index += 1) {
               const target = items[300 + index * 97];
               if (target === undefined) break;
               await new Promise((resolve) => setTimeout(resolve, 400));
               const before = setNumber();
               target.click();
               results.coldSetThumbs.push(await until(() => setNumber() !== before && painted()));
            }
            return results;
         },
         { toggles: 60, undos: 14, navigations: 40, jumps: 12 }
      );
      report.toggle = summarize(probe.toggle);
      report.undo = summarize(probe.undo);
      report.navigate = summarize(probe.navigate);
      report.coldSetThumbs = summarize(probe.coldSetThumbs);
      const afterUse = await sampleMetrics(app);
      report.memoryAfterUse = { workingSetMb: afterUse.workingSetMb, mainWorkingSetMb: afterUse.mainWorkingSetMb };

      // Final review with every set auto-selected: band autoselect walks the library.
      await window.locator(".filmstrip__item").first().click();
      await window.waitForTimeout(300);
      await window.evaluate(async () => {
         const press = (key) => window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
         for (let index = 0; index < 400; index += 1) {
            press("v");
            await new Promise((resolve) => setTimeout(resolve, 120));
         }
      });
      report.finalReviewOpenMs = await window.evaluate(async () => {
         const t0 = performance.now();
         window.dispatchEvent(new KeyboardEvent("keydown", { key: "m", bubbles: true, cancelable: true }));
         await new Promise((resolve) => {
            const check = () => (document.querySelector(".moveSet") !== null ? resolve() : requestAnimationFrame(check));
            check();
         });
         await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
         return Math.round(performance.now() - t0);
      });
      report.finalReviewSets = await window.locator(".moveSet").count();
      report.finalReviewDomNodes = await window.evaluate(() => document.querySelectorAll("*").length);
      await window.keyboard.press("Escape");
      // Restore an untouched review for the rescan phase.
      await window.waitForTimeout(300);
   } finally {
      await app.close();
   }
}

// Rescan: same unchanged library, cached hashes.
{
   const started = Date.now();
   const app = await launch([`--scan=${scanRoot}`]);
   try {
      const window = await app.firstWindow();
      await window.getByText("Duplicate sets ready").waitFor({ timeout: 600_000 });
      report.rescanMs = Date.now() - started;
   } finally {
      await app.close();
   }
}

console.log(JSON.stringify(report, null, 2));
await writeFile(resultFile, JSON.stringify(report, null, 2));
