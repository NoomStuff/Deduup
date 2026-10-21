import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { _electron as electron } from "playwright-core";
import sharp from "sharp";

// Large-library benchmark: builds a deterministic synthetic library (thousands
// of disjoint 3-image sets), opens the app against it, and measures launch plus
// the review interactions that must stay instant. Interactions are driven and
// timed inside the page (rAF polling) so protocol latency does not pollute the
// numbers.
//   node scripts/perfProbe.mjs            build fixtures if missing, then measure
//   node scripts/perfProbe.mjs --rebuild  wipe fixtures + profile, rebuild, measure

const root = ".cache/bench";
const scanRoot = path.join(root, "scan-root");
const profile = path.join(root, "profile");
const resultFile = path.join(root, "result.json");
const rebuild = process.argv.includes("--rebuild");

const setCount = 2_500;
const setSize = 3;

// Circle position varies per set so the luminance layout keeps sets apart;
// each variant nudges the hue only, which the dhash reads as near-identical.
const scene = (setIndex, variant) => {
   const hue = (setIndex * 149) % 360;
   const cx = 120 + ((setIndex * 37) % 260);
   const cy = 150 + ((setIndex * 61) % 100) + variant * 2;
   const lightness = 55 + ((setIndex * 7) % 10);
   return `<svg width="500" height="400" xmlns="http://www.w3.org/2000/svg">
      <rect width="500" height="400" fill="hsl(${hue} 40 ${lightness + variant * 3}%)"/>
      <circle cx="${cx}" cy="${cy}" r="90" fill="#f2f2f5"/>
      <rect x="310" y="220" width="140" height="110" fill="#15151c"/>
   </svg>`;
};

async function buildLibrary() {
   await mkdir(scanRoot, { recursive: true });
   let untouched = 0;
   for (let setIndex = 0; setIndex < setCount; setIndex += 1) {
      const folder = path.join(scanRoot, `setgroup_${String(Math.floor(setIndex / 200)).padStart(2, "0")}`);
      if (setIndex % 200 === 0) {
         await mkdir(folder, { recursive: true });
      }
      for (let variant = 0; variant < setSize; variant += 1) {
         const file = path.join(folder, `im${setIndex}_${variant}.jpg`);
         const existing = await stat(file).catch(() => null);
         if (existing !== null && existing.isFile()) {
            untouched += 1;
            continue;
         }
         await sharp(Buffer.from(scene(setIndex, variant)), { failOn: "none" })
            .jpeg({ quality: 88 })
            .toFile(file);
      }
   }
   return setCount * setSize - untouched;
}

async function ensureFixtures() {
   const existing = await stat(scanRoot).catch(() => null);
   if (rebuild) {
      await rm(scanRoot, { recursive: true, force: true });
      await rm(profile, { recursive: true, force: true });
      return { wrote: await buildLibrary() };
   }
   if (existing !== null) {
      return { wrote: 0 };
   }
   await rm(profile, { recursive: true, force: true });
   return { wrote: await buildLibrary() };
}

const summarize = (samples) => {
   const cleaned = samples.filter((value) => value >= 0).sort((left, right) => left - right);
   const pick = (fraction) => cleaned[Math.min(cleaned.length - 1, Math.floor(fraction * cleaned.length))] ?? null;
   return { n: cleaned.length, p50: pick(0.5), p90: pick(0.9), max: cleaned[cleaned.length - 1] ?? null };
};

const fixtures = await ensureFixtures();
const launchStart = Date.now();
const app = await electron.launch({
   args: [".", `--user-data-dir=${profile}`, `--scan=${scanRoot}`],
   env: { ...process.env, IMAGE_DEDUPLICATOR_PROD: "1" },
});
const window = await app.firstWindow();
await window.waitForSelector(".filmstrip__item", { timeout: 300_000 });
const startToReviewMs = Date.now() - launchStart;
await window.waitForTimeout(1500);

const probe = await window.evaluate(
   async ({ toggles, undos, navigations }) => {
      const startTimer = () => performance.now();

      const until = (condition, deadlineMs = 2_000) =>
         new Promise((resolve) => {
            const t0 = startTimer();
            const check = () => {
               if (condition() || startTimer() - t0 > deadlineMs) {
                  resolve(condition() ? startTimer() - t0 : -1);
                  return;
               }
               requestAnimationFrame(check);
            };
            check();
         });

      const press = (key, extra = {}) => {
         window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...extra }));
      };

      const chipCount = () => document.querySelectorAll(".imageCard__chip--discarded").length;
      const setNumber = () => document.querySelector(".setHeader__number")?.textContent ?? "";

      const results = { toggle: [], undo: [], navigate: [], navigateScript: [], navigatePaint: [] };

      // Splits navigation latency into React commit time (until the header text
      // actually mutates) and the style/layout/paint/remainder that follows.
      let headerMutatedAt = null;
      const headerObserver = new MutationObserver(() => {
         if (headerMutatedAt === null) headerMutatedAt = startTimer();
      });
      headerObserver.observe(document.querySelector(".setHeader__number"), {
         childList: true,
         characterData: true,
         subtree: true,
      });

      // Discard/restore the first image by number key; re-sync with the chip
      // state before each press so the timed condition only reacts when the
      // flip actually happens.
      for (let index = 0; index < toggles; index += 1) {
         const wasPresent = chipCount() === 1;
         const target = wasPresent ? 0 : 1;
         press("1");
         const delta = await until(() => chipCount() === target && chipCount() !== wasPresent);
         if (delta >= 0) results.toggle.push(delta);
      }

      // Roll back flips until the chip count stops reacting to undo.
      for (let index = 0; index < undos; index += 1) {
         const before = chipCount();
         press("z", { ctrlKey: true });
         const delta = await until(() => chipCount() !== before);
         if (delta < 0) break;
         results.undo.push(delta);
      }

      for (let index = 0; index < navigations; index += 1) {
         const before = setNumber();
         headerMutatedAt = null;
         const t0 = startTimer();
         press("ArrowRight");
         const delta = await until(() => setNumber() !== before && setNumber() !== "");
         if (delta >= 0) {
            results.navigate.push(delta);
            const scriptMs = headerMutatedAt === null ? delta : Math.round((headerMutatedAt - t0) * 100) / 100;
            results.navigateScript.push(scriptMs);
            results.navigatePaint.push(Math.max(0, Math.round((delta - scriptMs) * 100) / 100));
         }
      }

      headerObserver.disconnect();
      return results;
   },
   { toggles: 60, undos: 14, navigations: 40 }
);

const report = {
   fixtureRoot: scanRoot,
   imagesWritten: fixtures.wrote,
   setCount,
   imagesPerSet: setSize,
   startToReviewMs,
   toggle: summarize(probe.toggle),
   undo: summarize(probe.undo),
   navigate: summarize(probe.navigate),
   navigateScript: summarize(probe.navigateScript),
   navigatePaint: summarize(probe.navigatePaint),
};
console.log(JSON.stringify(report, null, 2));
await writeFile(resultFile, JSON.stringify(report, null, 2));
await app.close();
