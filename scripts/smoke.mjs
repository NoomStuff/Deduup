/**
 * End-to-end smoke test for agents and CI. Builds nothing itself: run
 * `bun run build` first (or use the `test:ui` script, which does both).
 *
 * Launches the packaged renderer in Electron against an isolated profile and a
 * generated fixture folder, then walks the core flows through the real DOM:
 *   - auto-scan (via the --scan test hook, no native dialog involved)
 *   - filmstrip rendering and set navigation
 *   - marking, X-confirm, autoselect, undo
 *   - final review: move list, corrections through review, disabled recycle
 *   - drag-and-drop API surface (getPathForFile bridge)
 *   - transient scan warnings without persistent review banners
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

      // Unreadable files get a temporary notification, without taking shelf space.
      // A slow Electron debugger attachment can outlast the notification itself.
      const scanData = await window.evaluate(() => window.imageDeduplicator.loadData());
      check("scan records skipped items", scanData.scanWarningCount === 1);
      const warningToast = window.locator(".notificationToast--warning").filter({ hasText: "unreadable item" });
      await warningToast.waitFor({ state: "detached", timeout: 7_000 });
      check("review has no persistent warning or tutorial banner", (await window.locator(".scanWarnings, .reviewHints").count()) === 0);
      check("image cards always show full details", (await window.locator(".imageCard__details").count()) === (await window.locator(".imageCard").count()));

      const headerCounter = await window.textContent(".setHeader__number");
      check("review header shows set counter", /#\d+\s*\/\s*\d+/.test(headerCounter ?? ""), headerCounter ?? "missing");
      check("toolbar does not repeat the set counter", (await window.locator(".toolbar__counter").count()) === 0);
      check(
         "header has no selected-file label or Preview button",
         (await window.locator(".setHeader__selection").count()) === 0 && (await window.locator(".setHeader__action", { hasText: "Preview" }).count()) === 0
      );

      const bandTags = await window.locator(".similarityBand__tag").count();
      check("similarity bands render on the filmstrip", bandTags > 0, `bands: ${bandTags}`);
      check("previous-set navigation is disabled at the start", await window.getByRole("button", { name: "Previous set", exact: true }).isDisabled());

      // Image buttons support normal keyboard selection without discarding.
      await window.locator(".imageCard").first().focus();
      await window.keyboard.press("Space");
      check("Space selects a focused image", (await window.locator('.imageCard[aria-pressed="true"]').count()) === 1);
      check("selection does not discard an image", (await window.locator(".imageCard__chip--discarded").count()) === 0);
      await window.locator(".imageCard").first().click();
      const beforeSpace = await window.textContent(".setHeader__number");
      await window.keyboard.press("Space");
      await window.waitForFunction((previous) => document.querySelector(".setHeader__number")?.textContent !== previous, beforeSpace);
      check("Space advances after pointer selection", true);
      await window.keyboard.press("ArrowLeft");

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
      const markedChips = await window.locator(".imageCard__chip--discarded").count();
      check("key 1 marks the first image", markedChips === 1, `marked chips: ${markedChips}`);
      const badgeReadable = await window.locator(".imageCard__chip--discarded").evaluate((badge) => {
         const style = getComputedStyle(badge);
         return style.backgroundColor !== "rgba(0, 0, 0, 0)" && badge.querySelector("svg").getBoundingClientRect().width <= 14;
      });
      check("discard badge has an opaque background and a sized icon", badgeReadable);
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
      check("undo clears the mark", (await window.locator(".imageCard__chip--discarded").count()) === 0);

      const copies = await window.locator(".imageCard").count();
      await window
         .locator(".imageCard")
         .first()
         .click({ button: "right", modifiers: ["Shift"] });
      await window.waitForFunction((count) => document.querySelectorAll(".imageCard__chip--discarded").length === count - 1, copies);
      check("Shift+right-click keeps only the chosen copy", (await window.locator(".contextMenu").count()) === 0);
      await window.keyboard.press("Control+z");
      await window.waitForFunction(() => document.querySelectorAll(".imageCard__chip--discarded").length === 0);

      // K and the header button keep only the selected image; pressing again restores the others.
      await window.locator(".imageCard").first().click();
      await window.keyboard.press("k");
      await window.waitForFunction((count) => document.querySelectorAll(".imageCard__chip--discarded").length === count - 1, copies);
      check("K keeps only the selected image", (await window.locator('.imageCard[aria-pressed="true"] .imageCard__chip--discarded').count()) === 0);
      await window.getByRole("button", { name: "Restore others", exact: true }).click();
      await window.waitForFunction(() => document.querySelectorAll(".imageCard__chip--discarded").length === 0);
      check("the keep-only button restores the others", true);
      check(
         "clicked review controls leave keyboard focus free for Space",
         await window.evaluate(() => document.activeElement === document.body || !document.activeElement?.closest("button"))
      );
      check("cards show their number key", (await window.locator(".imageCard__key").first().textContent()) === "1");
      await window.keyboard.press("Shift+Digit2");
      await window.waitForFunction((count) => document.querySelectorAll(".imageCard__chip--discarded").length === count - 1, copies);
      check("Shift+2 keeps only the second image", (await window.locator(".imageCard").nth(1).locator(".imageCard__chip--discarded").count()) === 0);
      await window.keyboard.press("Control+z");
      await window.waitForFunction(() => document.querySelectorAll(".imageCard__chip--discarded").length === 0);
      const beforeAdvance = await window.textContent(".setHeader__number");
      await window.keyboard.press("Control+1");
      await window.waitForFunction((previous) => document.querySelector(".setHeader__number")?.textContent !== previous, beforeAdvance);
      check("Ctrl+1 marks and advances", true);
      await window.keyboard.press("ArrowLeft");
      await window.keyboard.press("Control+z");
      await window.waitForFunction(() => document.querySelectorAll(".imageCard__chip--discarded").length === 0);

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

      // Menu navigation starts at the right enabled item and returns focus.
      const helpTrigger = window.getByRole("button", { name: "Help", exact: true });
      await helpTrigger.click();
      await window.keyboard.press("ArrowUp");
      check(
         "ArrowUp enters an open menu at its last enabled item",
         await window.getByRole("menuitem", { name: /settings/i }).evaluate((item) => item === document.activeElement)
      );
      await window.keyboard.press("Home");
      check(
         "Home focuses the first menu item",
         await window
            .getByRole("menuitem")
            .first()
            .evaluate((item) => item === document.activeElement)
      );
      await window.keyboard.press("Escape");
      check("Escape returns focus to the menu trigger", await helpTrigger.evaluate((trigger) => trigger === document.activeElement));

      // Settings opens as a tabbed modal from the Help menu and exposes the
      // rebindable shortcuts screen.
      await window.getByRole("button", { name: "Help", exact: true }).click();
      await window.getByRole("menuitem", { name: /settings/i }).click();
      await window.waitForSelector(".settingsPanel", { timeout: 5_000 });
      check("image caption preference is removed", (await window.getByRole("group", { name: "Image captions" }).count()) === 0);
      await window.getByRole("tab", { name: "General", exact: true }).focus();
      await window.keyboard.press("ArrowRight");
      check(
         "arrow keys activate and focus settings tabs",
         await window
            .getByRole("tab", { name: "Keyboard shortcuts" })
            .evaluate((tab) => tab.getAttribute("aria-selected") === "true" && document.activeElement === tab)
      );
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
      check("empty final review offers a return action", await window.getByRole("button", { name: "Back to review", exact: true }).isVisible());
      check("empty final review omits destination metadata", (await window.locator(".finalReview__meta").count()) === 0);

      // Correct final-review choices by returning to the review workspace.
      await window.locator(".finalReview").getByLabel("Close final review").click();
      await window.waitForSelector(".imageShelf");
      await window.keyboard.press("1");
      await window.waitForTimeout(200);
      await window.getByRole("button", { name: /final review/i }).click();
      await window.waitForSelector(".finalReview");
      const readyBefore = await window.locator(".moveCard:not(.moveCard--quarantined)").count();
      check("final review lists the marked image", readyBefore === 1, `ready cards: ${readyBefore}`);
      check("final review has no keep-this control", (await window.getByRole("button", { name: "Keep this", exact: true }).count()) === 0);
      check(
         "final review shows the full image",
         await window
            .locator(".moveCard img")
            .first()
            .evaluate((img) => getComputedStyle(img).objectFit === "contain")
      );
      check("final review shows what the set keeps beside the move", (await window.locator(".moveSet .keptCard").count()) > 0);
      await window.screenshot({ path: path.join(artifactsDir, "13-final-review-populated.png") });

      // A final-review card is a way back to its set, with that image selected.
      const discardedName = await window.locator(".moveSet .moveCard strong").first().textContent();
      await window.locator(".moveSet .moveCardButton:has(.moveCard)").first().click();
      await window.waitForSelector(".finalReview", { state: "detached" });
      check(
         "final review card returns to its set with the image selected",
         (await window.locator('.imageCard[aria-pressed="true"] .imageCard__caption strong').textContent()) === discardedName,
         discardedName ?? "missing"
      );
      await window.locator(".imageCard").first().click();
      await window.getByRole("button", { name: "Restore", exact: true }).click();
      await window.waitForSelector(".imageCard__chip--discarded", { state: "detached" });
      await window.getByRole("button", { name: /final review/i }).click();
      await window.waitForSelector(".finalReview");
      await window.waitForTimeout(250);
      const readyAfter = await window.locator(".moveCard:not(.moveCard--quarantined)").count();
      check("restoring an image in review removes it from the move", readyAfter === 0, `ready cards: ${readyAfter}`);
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
      await window.locator(".filmstrip__item").last().click();
      check("next-set navigation is disabled at the end", await window.getByRole("button", { name: "Next set", exact: true }).isDisabled());

      // The strip recenters only when the set changes. A hand-scrolled position
      // must stay put; a recenter glide that never settled used to drag it back.
      // The fixture strip fits the window, so squeeze it until it overflows.
      await window.evaluate(() => document.querySelector(".filmstripWrap").style.setProperty("max-width", "140px"));
      const filmstrip = window.locator(".filmstrip");
      await window.locator(".filmstrip__item").first().click();
      await window.waitForTimeout(500);
      await window.locator(".filmstrip__item").nth(2).click();
      await window.waitForTimeout(800);
      // Real tile layouts land the centered target on a fraction of a pixel,
      // which is what stalled the glide. Offset the strip so the next target
      // sits ~0.75px past a whole pixel, then glide to it.
      await filmstrip.evaluate((strip) => {
         const tile = strip.querySelectorAll(".filmstrip__item")[1].getBoundingClientRect();
         const bounds = strip.getBoundingClientRect();
         const target = tile.left - bounds.left + strip.scrollLeft + tile.width / 2 - strip.clientWidth / 2;
         const fraction = target - Math.floor(target);
         strip.style.setProperty("padding-left", `${(((0.75 - fraction) % 1) + 1) % 1}px`);
      });
      const stripMax = await filmstrip.evaluate((strip) => strip.scrollWidth - strip.clientWidth);
      const handScrollAfter = async (delay) => {
         const centered = await filmstrip.evaluate((strip) => strip.scrollLeft);
         const handScrolled = centered > stripMax / 2 ? 0 : stripMax;
         await window.waitForTimeout(delay);
         await filmstrip.evaluate((strip, value) => (strip.scrollLeft = value), handScrolled);
         await window.waitForTimeout(800);
         const now = await filmstrip.evaluate((strip) => strip.scrollLeft);
         return { ok: stripMax > 0 && Math.abs(now - handScrolled) <= 1, detail: `max ${stripMax}, set ${handScrolled}, now ${now}` };
      };
      // Mid-glide: the user's scroll wins over the recenter in flight.
      await window.locator(".filmstrip__item").nth(1).click();
      const midGlide = await handScrollAfter(60);
      check("filmstrip yields to a scroll during the recenter glide", midGlide.ok, midGlide.detail);
      // Settled: nothing pulls the strip back afterwards either.
      await window.locator(".filmstrip__item").nth(2).click();
      await window.waitForTimeout(800);
      const settled = await handScrollAfter(0);
      check("filmstrip keeps a hand-scrolled position", settled.ok, settled.detail);
      await window.keyboard.press("ArrowRight");
      await window.waitForTimeout(800);
      const recentered = await filmstrip.evaluate((strip) => {
         const active = strip.querySelector(".filmstrip__item--active").getBoundingClientRect();
         const bounds = strip.getBoundingClientRect();
         return active.left >= bounds.left - 1 && active.right <= bounds.right + 1;
      });
      check("filmstrip recenters when the set changes", recentered);
      await window.evaluate(() => {
         document.querySelector(".filmstripWrap").style.removeProperty("max-width");
         document.querySelector(".filmstrip").style.removeProperty("padding-left");
      });
      await window.locator(".filmstrip__item").last().click();

      // Large sets must still render at the end of both shelf layouts when
      // Chromium skips offscreen cards. Exercise a narrow, reduced-motion view.
      const library = await window.evaluate(() => window.imageDeduplicator.loadData());
      const largestIndex = library.groups.reduce((largest, group, index) => (group.images.length > library.groups[largest].images.length ? index : largest), 0);
      await window.locator(".filmstrip__item").nth(largestIndex).click();
      await window.waitForFunction((count) => document.querySelectorAll(".imageCard").length === count, library.groups[largestIndex].images.length);
      await window.setViewportSize({ width: 960, height: 680 });
      await window.emulateMedia({ reducedMotion: "reduce" });
      const lastCard = window.locator(".imageCard").last();
      await lastCard.scrollIntoViewIfNeeded();
      await window.waitForFunction(() => {
         const img = document.querySelector(".imageCard:last-child img");
         return img?.complete && img.naturalWidth > 0;
      });
      const visibleLastCard = () =>
         window.evaluate(() => {
            const shelf = document.querySelector(".imageShelf").getBoundingClientRect();
            const card = document.querySelector(".imageCard:last-child").getBoundingClientRect();
            return card.top < shelf.bottom && card.bottom > shelf.top && card.left < shelf.right && card.right > shelf.left;
         });
      check("wrapped shelf displays its final image at a narrow width", await visibleLastCard());
      await window.screenshot({ path: path.join(artifactsDir, "11-narrow-wrapped-shelf.png") });
      await window.getByRole("button", { name: "Help", exact: true }).click();
      await window.getByRole("menuitem", { name: /settings/i }).click();
      await window.getByRole("button", { name: "Wrap the image shelf onto multiple rows" }).click();
      await window
         .getByRole("dialog", { name: /settings/i })
         .getByRole("button", { name: /close settings/i })
         .click();
      await window.waitForSelector(".settingsPanel", { state: "detached" });
      await lastCard.scrollIntoViewIfNeeded();
      check("single-row shelf displays its final image", await visibleLastCard());
      await window.screenshot({ path: path.join(artifactsDir, "12-narrow-single-row-shelf.png") });
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
