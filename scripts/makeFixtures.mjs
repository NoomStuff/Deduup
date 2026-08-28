import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/**
 * Deterministic fixture library for manual review sessions and the smoke test.
 * Layout:
 *   twins/    — one image and its exact copy (distance 0 band)
 *   resized/  — same image at two sizes (still distance ~0)
 *   drift/    — progressively color-shifted copies (tight band, small distance)
 *   chain/    — a chain of small shifts that links unrelated images together
 *               (loose band: bulk actions must be disabled here)
 *   singles/  — unrelated images that must not group
 *   broken.jpg— corrupt file that must be counted as a scan warning
 */
export const createFixtures = async (root) => {
   await mkdir(root, { recursive: true });
   for (const folder of ["twins", "resized", "drift", "chain", "singles"]) {
      await mkdir(path.join(root, folder), { recursive: true });
   }

   const scene = (hue, w = 900, h = 700) =>
      `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
         <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="hsl(${hue} 80% 55%)"/><stop offset="1" stop-color="hsl(${(hue + 160) % 360} 70% 35%)"/>
         </linearGradient></defs>
         <rect width="${w}" height="${h}" fill="url(#g)"/>
         <circle cx="${w * 0.35}" cy="${h * 0.4}" r="${h * 0.2}" fill="#fff" opacity="0.85"/>
         <rect x="${w * 0.55}" y="${h * 0.5}" width="${w * 0.3}" height="${h * 0.32}" fill="#111" opacity="0.75"/>
      </svg>`;

   const writeJpeg = (svg, file) => sharp(Buffer.from(svg), { failOn: "none" }).jpeg({ quality: 92 }).toFile(file);
   const writePng = (svg, file) => sharp(Buffer.from(svg), { failOn: "none" }).png().toFile(file);

   await writeJpeg(scene(210), path.join(root, "twins", "original.jpg"));
   await writeJpeg(scene(210), path.join(root, "twins", "copy of original.jpg"));

   await writePng(scene(120), path.join(root, "resized", "poster.png"));
   await writePng(scene(120, 450, 350), path.join(root, "resized", "poster_small.png"));

   for (const [index, hueShift] of [0, 6, 12].entries()) {
      await writeJpeg(scene(40 + hueShift), path.join(root, "drift", `drift_${index + 1}.jpg`));
   }

   // Each chain image slides the same circle a small step to the side: adjacent
   // copies stay within the match threshold, but 20 steps of drift leave the ends
   // with almost no shared structure, so the connected group averages well above
   // the limit (verified ~21.5). This is what exercises the loose-band guard.
   for (const index of Array.from({ length: 20 }, (_, entry) => entry)) {
      const svg = `<svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
         <rect width="800" height="600" fill="#5a5a66"/>
         <circle cx="${100 + index * 15}" cy="280" r="110" fill="#f2f2f5"/>
      </svg>`;
      await writePng(svg, path.join(root, "chain", `link_${String(index + 1).padStart(2, "0")}.png`));
   }

   // Structurally unrelated: dHash reads luminance layout, so different
   // compositions (not just different colors) keep these apart.
   await writeJpeg(
      `<svg width="900" height="700" xmlns="http://www.w3.org/2000/svg">
      <rect width="900" height="700" fill="#202028"/>
      ${Array.from({ length: 14 }, (_, row) => `<rect x="0" y="${row * 50}" width="900" height="24" fill="#d8d8e2"/>`).join("")}
   </svg>`,
      path.join(root, "singles", "unique_one.jpg")
   );
   await writeJpeg(
      `<svg width="900" height="700" xmlns="http://www.w3.org/2000/svg">
      <rect width="900" height="700" fill="#101014"/>
      <path d="M0 700 L450 60 L900 700 Z" fill="#c9c9d4"/>
   </svg>`,
      path.join(root, "singles", "unique_two.jpg")
   );

   // Sharp rejects truncated files, so this yields one skipped-image warning.
   await writeFile(path.join(root, "broken.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]));

   return root;
};

const isDirectRun = process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, "/")}`).href;

if (isDirectRun) {
   const root = process.argv[2] ?? path.resolve(".cache/fixtures/scan-root");
   console.log(await createFixtures(root));
}
