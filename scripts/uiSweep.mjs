import { mkdir, rm } from "node:fs/promises";
import { _electron as electron } from "playwright-core";
import { createFixtures } from "./makeFixtures.mjs";

// Full-surface capture: startup screen, review, open menus, about panel,
// and the context menu. Screenshots land in .cache/ui-sweep/.
const root = ".cache/ui-sweep";
await rm(root, { recursive: true, force: true });
await mkdir(`${root}/profile`, { recursive: true });
await createFixtures(`${root}/scan-root`);

const launch = (args) => electron.launch({ args: [".", `--user-data-dir=${root}/profile`, ...args], env: { ...process.env, IMAGE_DEDUPLICATOR_PROD: "1" } });

const startupApp = await launch([]);
const startup = await startupApp.firstWindow();
await startup.waitForSelector("#startup-title", { timeout: 30000 });
await startup.waitForTimeout(600);
await startup.screenshot({ path: `${root}/00-startup.png` });
await startupApp.close();

const app = await launch([`--scan=${root}/scan-root`]);
const window = await app.firstWindow();
await window.waitForSelector(".filmstrip__item", { timeout: 30000 });
await window.waitForTimeout(500);
await window.screenshot({ path: `${root}/01-review.png` });

await window.click(".appMenu:has-text('Help') > button");
await window.waitForTimeout(300);
await window.screenshot({ path: `${root}/02-help-menu.png` });
await window.click(".menuDropdown button:has-text('About')");
await window.waitForSelector("#about-title", { timeout: 5000 });
await window.waitForTimeout(400);
await window.screenshot({ path: `${root}/03-about.png` });
await window.keyboard.press("Escape");
await window.waitForTimeout(300);

await window.click(".appMenu:has-text('Review') > button");
await window.waitForTimeout(300);
await window.screenshot({ path: `${root}/04-review-menu.png` });
await window.keyboard.press("Escape");
await window.waitForTimeout(300);

await window.locator(".imageCard").first().click({ button: "right" });
await window.waitForSelector(".contextMenu", { timeout: 5000 });
await window.waitForTimeout(300);
await window.screenshot({ path: `${root}/05-context-menu.png` });

console.log("captured", root);
await app.close();
