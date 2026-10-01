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
 *   - persistent scan-warning banner (dismissable)
 *   - preview zoom via the wheel, settings modal with rebindable shortcuts
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
      // With the --scan hook the renderer sits on the loading card (spinner plus
      // the three shimmer bars) until the scan completes; capture it for review.
      await window.screenshot({ path: path.join(artifactsDir, "00-loading.png") });

      // Scan runs automatically; the review workspace replaces the start screen.
      try {
         await window.waitForSelector(".filmstrip__item", { timeout: 90_000 });
      } catch (error) {
         await window.screenshot({ path: path.join(artifactsDir, "timeout-state.png") });
         console.log("[debug] body text at timeout:", (await window.textContent("body"))?.slice(0, 600));
         throw error;
      }
      await window.screenshot({ path: path.join(artifactsDir, "01-review.png") });

      // The fixture library contains one unreadable file, so its skip warning
      // must surface as a persistent banner rather than a fleeting toast.
      const warningBanner = window.locator(".scanWarnings");
      await warningBanner.waitFor({ timeout: 5_000 });
      const bannerText = await warningBanner.textContent();
      check("scan warning banner lists skipped items", /skipped/i.test(bannerText ?? ""), bannerText ?? "missing");
      await warningBanner.locator("button.iconButton").click();
      await warningBanner.waitFor({ state: "detached", timeout: 5_000 });
      check("scan warning banner can be dismissed", true);

      const headerCounter = await window.textContent(".toolbar__counter");
      check("review header shows set counter", /#\d+\s*\/\s*\d+/.test(headerCounter ?? ""), headerCounter ?? "missing");

      const bandTags = await window.locator(".similarityBand__tag").count();
      check("similarity bands render on the filmstrip", bandTags > 0, `bands: ${bandTags}`);

      // Navigation moves forward without creating review choices or progress.
      await window.keyboard.press("ArrowRight");
      await window.waitForTimeout(250);
      const navigatedData = await window.evaluate(() => window.imageDeduplicator.loadData());
      check(
         "navigation creates no viewed state or review choices",
         Object.keys(navigatedData.decisions).length === 0 && (await window.locator(".toolbar__progress").count()) === 0
      );

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
      await window.waitForTimeout(350);
      await window.screenshot({ path: path.join(artifactsDir, "03-confirm.png") });
      await window.keyboard.press("Escape");
      await window.waitForSelector(".confirmDialog", { state: "detached", timeout: 5_000 });

      // Undo removes the mark made a moment ago.
      await window.keyboard.press("Control+z");
      await window.waitForTimeout(200);
      check("undo clears the mark", (await window.locator(".imageCard__chip--marked").count()) === 0);

      const copies = await window.locator(".imageCard").count();
      await window
         .locator(".imageCard")
         .first()
         .click({ button: "right", modifiers: ["Shift"] });
      await window.waitForFunction((count) => document.querySelectorAll(".imageCard__chip--marked").length === count - 1, copies);
      check("Shift+right-click keeps only the chosen copy", (await window.locator(".contextMenu").count()) === 0);
      await window.keyboard.press("Control+z");
      await window.waitForFunction(() => document.querySelectorAll(".imageCard__chip--marked").length === 0);
      const beforeAdvance = await window.textContent(".toolbar__counter");
      await window.keyboard.press("Control+1");
      await window.waitForFunction((previous) => document.querySelector(".toolbar__counter")?.textContent !== previous, beforeAdvance);
      check("Ctrl+1 marks and advances", true);
      await window.keyboard.press("ArrowLeft");
      await window.keyboard.press("Control+z");
      await window.waitForFunction(() => document.querySelectorAll(".imageCard__chip--marked").length === 0);

      await window
         .locator(".imageCard")
         .first()
         .click({ modifiers: ["Alt"] });
      await window.locator(".imageCard").nth(1).click();
      await window.waitForSelector(".compare__stage");
      await window.waitForFunction(() => [...document.querySelectorAll(".compare__stage img")].every((image) => image.complete && image.naturalWidth > 0));
      await window.locator(".compare__action--left").hover();
      const faithful = await window.evaluate(
         () =>
            getComputedStyle(document.querySelector(".compare__layer--top")).opacity === "1" &&
            [...document.querySelectorAll(".compare__stage img")].every((image) => getComputedStyle(image).filter === "none")
      );
      check("comparison wipe shows opaque copies without brightness changes", faithful);
      await window.screenshot({ path: path.join(artifactsDir, "10-comparison.png") });
      await window.keyboard.press("Escape");
      await window.waitForSelector(".compare__stage", { state: "detached", timeout: 5_000 });

      // Preview opens for the selected image and wheel-zooms via the native listener.
      await window.locator(".imageCard").first().click();
      await window.keyboard.press("Enter");
      await window.waitForSelector(".imagePreviewDialog__stage", { timeout: 5_000 });
      await window.waitForTimeout(350);
      await window.screenshot({ path: path.join(artifactsDir, "07-preview.png") });
      await window.mouse.move(720, 430);
      await window.mouse.wheel(0, -600);
      await window.waitForTimeout(150);
      const zoomLabel = await window.textContent(".imagePreviewDialog__zoom");
      check("preview wheel zoom raises the zoom level", zoomLabel !== "100%" && Number.parseInt(zoomLabel ?? "100", 10) > 100, zoomLabel ?? "missing");
      await window.screenshot({ path: path.join(artifactsDir, "08-preview-zoomed.png") });
      await window.keyboard.press("Escape");
      await window.waitForSelector(".imagePreviewDialog__stage", { state: "detached", timeout: 5_000 });

      // Settings opens as a tabbed modal from the Help menu and exposes the
      // rebindable shortcuts screen.
      await window.getByRole("button", { name: "Help", exact: true }).click();
      await window.getByRole("menuitem", { name: /settings/i }).click();
      await window.waitForSelector(".settingsPanel", { timeout: 5_000 });
      await window.getByRole("tab", { name: "Keyboard shortcuts" }).click();
      await window.waitForSelector(".shortcutList", { timeout: 5_000 });
      const shortcutRows = await window.locator(".shortcutRow").count();
      check("settings exposes the rebindable shortcuts screen", shortcutRows > 0, `rows: ${shortcutRows}`);
      await window.screenshot({ path: path.join(artifactsDir, "09-settings.png") });
      // The backdrop is also a "Close settings" button; target the dialog's own control.
      await window
         .getByRole("dialog", { name: /settings/i })
         .getByRole("button", { name: /close settings/i })
         .click();
      await window.waitForSelector(".settingsPanel", { state: "detached", timeout: 5_000 });

      // Final review reflects the workflow state.
      await window.getByRole("button", { name: /final review/i }).click();
      await window.waitForSelector(".finalReview", { timeout: 5_000 });
      await window.waitForTimeout(350);
      await window.screenshot({ path: path.join(artifactsDir, "04-final-review.png") });

      const recycleDisabled = await window.locator(".finalReview__actions .dangerButton").isDisabled();
      check("recycle stays disabled before any move", recycleDisabled);

      // Mark something so the final review has rows, then use "Keep this".
      await window.locator(".finalReview").getByLabel("Close final review").click();
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
      await window.locator(".finalReview").getByLabel("Close final review").click();
      await window.waitForSelector(".filmstrip__item");
      const bandLabels = await window.locator(".similarityBand__tag").allTextContents();
      const worstBand = Math.max(...bandLabels.map((label) => Number.parseFloat(label)));
      check("no band exceeds the similarity cap", Number.isFinite(worstBand) && worstBand <= 13.001, `worst band: ${worstBand}`);

      const setCount = await window.locator(".filmstrip__item").count();
      check("over-cap chains split into multiple sets", setCount >= 3, `sets: ${setCount}`);
      await window.screenshot({ path: path.join(artifactsDir, "06-filmstrip.png") });
      check("core flows show no unexpected error notifications", (await window.locator(".notificationToast--error").count()) === 0);
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
