import { mkdir, rm } from "node:fs/promises";
import { _electron as electron } from "playwright-core";
import { createFixtures } from "./makeFixtures.mjs";

// One-off visual probe: hover a band tag and capture the filmstrip so the
// hover-highlight on the similarity line can be verified.
const root = ".cache/hover-check";
await rm(root, { recursive: true, force: true });
await mkdir(`${root}/profile`, { recursive: true });
await createFixtures(`${root}/scan-root`);

const app = await electron.launch({
   args: [".", `--user-data-dir=${root}/profile`, `--scan=${root}/scan-root`],
   env: { ...process.env, IMAGE_DEDUPLICATOR_PROD: "1" },
});
const window = await app.firstWindow();
await window.waitForSelector(".filmstrip__item", { timeout: 30000 });

const rects = await window.evaluate(() => {
   const band = document.querySelectorAll(".similarityBand")[1];
   const tag = band.querySelector(".similarityBand__tag");
   const link = band.querySelector(".similarityBand__link");
   const items = band.querySelector(".similarityBand__items");
   const tile = band.querySelector(".filmstrip__item");
   const r = (element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, height: rect.height };
   };
   return { tag: r(tag), link: r(link), items: r(items), tile: r(tile), devicePixelRatio: window.devicePixelRatio };
});
console.log(JSON.stringify(rects, null, 2));

const strip = window.locator(".filmstrip");
await strip.screenshot({ path: `${root}/rest.png` });
await window.hover(".similarityBand__tag >> nth=1");
await window.waitForTimeout(400);
await strip.screenshot({ path: `${root}/hover.png` });
console.log("captured", `${root}/rest.png`, `${root}/hover.png`);
await app.close();
