/**
 * End-to-end smoke test for agents and CI. Builds nothing itself: run
 * `bun run build` first (or use the `test:ui` script, which does both).
 *
 * Launches the packaged renderer in Electron against an isolated profile and a
 * generated fixture folder, then walks the core flows through the real DOM:
 *   - auto-scan (via the --scan test hook, no native dialog involved)
 *   - filmstrip rendering and set navigation
 *   - marking, X-confirm, autoselect, undo
 *   - final review: move list, per-image "Keep this", disabled recycle
 *   - drag-and-drop API surface (getPathForFile bridge)
 *
 * Screenshots land in .cache/ui-smoke/ so a human (or agent) can inspect them.
 */
import { mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createFixtures } from "./makeFixtures.mjs";

const require = createRequire(import.meta.url);
const { _electron: electron } = require("playwright-core");

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactsDir = path.join(repoRoot, ".cache", "ui-smoke");
const profileDir = path.join(artifactsDir, "profile");
const fixturesRoot = path.join(artifactsDir, "scan-root");

const failures = [];
const check = (name, condition, detail = "") => {
   const ok = Boolean(condition);
   console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : ` — ${detail}`}`);
   if (!ok) failures.push(name);
};

const executablePath = require("electron");

const run = async () => {
   rmSync(artifactsDir, { recursive: true, force: true });
   mkdirSync(profileDir, { recursive: true });
   await createFixtures(fixturesRoot);

   const app = await electron.launch({
      executablePath,
      cwd: repoRoot,
      args: [".", `--user-data-dir=${profileDir}`, `--scan=${fixturesRoot}`],
      env: { ...process.env, IMAGE_DEDUPLICATOR_PROD: "1", ELECTRON_ENABLE_LOGGING: "1" },
   });
   const window = await app.firstWindow();
   window.on("console", (message) => {
      if (message.type() === "error") console.log("[renderer error]", message.text());
   });

   try {
      // Scan runs automatically; the review workspace replaces the start screen.
      try {
         await window.waitForSelector(".filmstrip__item", { timeout: 90_000 });
      } catch (error) {
         await window.screenshot({ path: path.join(artifactsDir, "timeout-state.png") });
         console.log("[debug] body text at timeout:", (await window.textContent("body"))?.slice(0, 600));
         throw error;
      }
      await window.screenshot({ path: path.join(artifactsDir, "01-review.png") });

      const headerCounter = await window.textContent(".topbar__counter");
      check("review header shows set counter", /#\d+\s*\/\s*\d+/.test(headerCounter ?? ""), headerCounter ?? "missing");

      const bandTags = await window.locator(".similarityBand__tag").count();
      check("similarity bands render on the filmstrip", bandTags > 0, `bands: ${bandTags}`);

      // Navigation marks the current set seen and moves forward.
      await window.keyboard.press("ArrowRight");
      await window.waitForTimeout(250);
      const seenDots = await window.locator(".filmstrip__item--seen").count();
      check("navigating marks a set as seen", seenDots > 0, `seen dots: ${seenDots}`);

      // Keyboard marking: key 1 marks the first image of the set.
      await window.keyboard.press("1");
      await window.waitForTimeout(200);
      const markedChips = await window.locator(".imageCard__chip--marked").count();
      check("key 1 marks the first image", markedChips === 1, `marked chips: ${markedChips}`);
      await window.screenshot({ path: path.join(artifactsDir, "02-marked.png") });

      // X opens the confirm dialog; Escape cancels.
      await window.keyboard.press("x");
      await window.waitForSelector(".confirmDialog", { timeout: 5_000 });
      check("X asks for confirmation", true);
      await window.screenshot({ path: path.join(artifactsDir, "03-confirm.png") });
      await window.keyboard.press("Escape");

      // Undo removes the mark made a moment ago.
      await window.keyboard.press("Control+z");
      await window.waitForTimeout(200);
      check("undo clears the mark", (await window.locator(".imageCard__chip--marked").count()) === 0);

      // Final review reflects the workflow state.
      await window.getByRole("button", { name: /final review/i }).click();
      await window.waitForSelector(".finalReview", { timeout: 5_000 });
      await window.screenshot({ path: path.join(artifactsDir, "04-final-review.png") });

      const recycleDisabled = await window.locator(".finalReview__actions .dangerButton").isDisabled();
      check("recycle stays disabled before any move", recycleDisabled);

      // Mark something so the final review has rows, then use "Keep this".
      await window.getByRole("button", { name: /back to review/i }).click();
      await window.waitForSelector(".imageShelf");
      await window.keyboard.press("1");
      await window.waitForTimeout(200);
      await window.getByRole("button", { name: /final review/i }).click();
      await window.waitForSelector(".finalReview");
      const readyBefore = await window.locator(".moveCard:not(.moveCard--quarantined)").count();
      check("final review lists the marked image", readyBefore === 1, `ready cards: ${readyBefore}`);

      await window.locator(".moveCard__keep").first().hover();
      await window.locator(".moveCard__keep").first().click();
      await window.waitForTimeout(250);
      const readyAfter = await window.locator(".moveCard:not(.moveCard--quarantined)").count();
      check("keep-this removes the row from the move", readyAfter === 0, `ready cards: ${readyAfter}`);
      await window.screenshot({ path: path.join(artifactsDir, "05-final-review-cleared.png") });

      // The drag-and-drop bridge must exist and answer (empty string for a bare File).
      const dropBridge = await window.evaluate(() => window.imageDeduplicator.getPathForFile(new File([], "probe.png")));
      check("drag-and-drop path bridge is wired", dropBridge === "");

      // Back on the review view: the scanner must cap every set below the
      // similarity limit, and the chain fixture must have split into several sets.
      await window.getByRole("button", { name: /back to review/i }).click();
      await window.waitForSelector(".filmstrip__item");
      const bandLabels = await window.locator(".similarityBand__tag").allTextContents();
      const worstBand = Math.max(...bandLabels.map((label) => Number.parseFloat(label)));
      check("no band exceeds the similarity cap", Number.isFinite(worstBand) && worstBand <= 13.001, `worst band: ${worstBand}`);

      const setCount = await window.locator(".filmstrip__item").count();
      check("over-cap chains split into multiple sets", setCount >= 3, `sets: ${setCount}`);
      await window.screenshot({ path: path.join(artifactsDir, "06-filmstrip.png") });
   } finally {
      await app.close();
   }

   if (failures.length > 0) {
      console.error(`\n${failures.length} check(s) failed: ${failures.join(", ")}`);
      process.exitCode = 1;
   } else {
      console.log("\nAll smoke checks passed.");
   }
};

await run();
