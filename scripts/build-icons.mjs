import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";
import pngToIco from "png-to-ico";

// Deduup's logo: two overlapping photo cards in the app's
// terracotta accent on the same dark tile family as the interface. The front
// card carries a knocked-out mountain and sun (fill-rule evenodd), the back
// card is dimmed to read as a copy of the first.
const tile = "#232323";
const accent = "#c98a5a";
// One card in local coordinates: a 150x126 rounded rect spanning (36,0)-(186,126).
const cardPath = "M52 0 h118 a16 16 0 0 1 16 16 v94 a16 16 0 0 1 -16 16 h-118 a16 16 0 0 1 -16 -16 v-94 a16 16 0 0 1 16 -16 Z";
// Holes inside the front card: a two-peak mountain range and a sun.
const mountainPath = "M48 118 L86 72 L106 96 L124 70 L162 118 Z";
const sunPath = "M61 44 a11 11 0 1 0 22 0 a11 11 0 1 0 -22 0 Z";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect x="8" y="8" width="240" height="240" rx="54" fill="${tile}"/>
  <path transform="translate(5 38)" d="${cardPath}" fill="${accent}" fill-opacity="0.45"/>
  <path transform="translate(29 90)" d="${cardPath}
    ${mountainPath}
    ${sunPath}" fill="${accent}" fill-rule="evenodd"/>
</svg>`;

await mkdir(".cache", { recursive: true });
// Regeneration costs a moment; skip it while the inputs and outputs are unchanged.
const signature = createHash("sha1").update(svg).digest("hex");
const outputs = await Promise.all(["public/icon.png", "public/favicon.ico", "public/icon.icns"].map((p) => stat(p).catch(() => null)));
const cached = outputs.every(Boolean) ? await readFile(".cache/icons-cache", "utf8").catch(() => null) : null;
if (cached === signature) {
   console.log("App icons are up to date.");
   process.exit(0);
}

const png = await sharp(Buffer.from(svg)).resize(1024, 1024).png().toBuffer();
await writeFile("public/icon.png", png);
// One entry per size: Windows scales small taskbar and title-bar icons from the
// nearest entry, so crisp 16-48px variants matter more than one large bitmap.
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const icoImages = await Promise.all(icoSizes.map((size) => sharp(png).resize(size, size).png().toBuffer()));
await writeFile("public/favicon.ico", await pngToIco(icoImages));
// ICNS supports a 1024px PNG in its ic10 element.
const element = Buffer.alloc(8);
element.write("ic10");
element.writeUInt32BE(png.length + 8, 4);
const header = Buffer.alloc(8);
header.write("icns");
header.writeUInt32BE(png.length + 16, 4);
await writeFile("public/icon.icns", Buffer.concat([header, element, png]));
await writeFile(".cache/icons-cache", signature);
console.log("Generated app icons.");
