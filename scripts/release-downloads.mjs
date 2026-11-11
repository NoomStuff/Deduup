import { copyFile, lstat, mkdir, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";

export const feeds = ["latest.yml", "latest-linux.yml", "latest-linux-arm64.yml"];

/**
 * Build output name to versionless public name, stable for releases/latest/download links.
 * @param {string} version
 * @returns {{ source: string, name: string }[]}
 */
export function publishedDownloads(version) {
   if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error("Invalid release version.");
   return [
      ["win-x64-Installer.exe", "windows-x64-setup.exe"],
      ["win-x64-Installer.exe.blockmap", "windows-x64-setup.exe.blockmap"],
      ["win-x64.exe", "windows-x64-portable.exe"],
      ["mac-x64.dmg", "macos-x64.dmg"],
      ["mac-arm64.dmg", "macos-arm64.dmg"],
      ["linux-x86_64.AppImage", "linux-x64.AppImage"],
      ["linux-arm64.AppImage", "linux-arm64.AppImage"],
   ].map(([source, name]) => ({ source: `Deduup-${version}-${source}`, name: `Deduup-${name}` }));
}

/**
 * @param {string} version
 * @param {string} source
 */
export function publishedName(version, source) {
   const file = publishedDownloads(version).find((entry) => entry.source === source);
   if (!file) throw new Error(`Not a published app download: ${source}`);
   return file.name;
}

/** Everything the release page carries: app downloads and the updater feeds. */
export function publishedAssets(/** @type {string} */ version) {
   return [...publishedDownloads(version).map((file) => file.name), ...feeds];
}

/**
 * @param {string} source
 * @param {string} feedDirectory
 * @param {string} destination
 * @param {string} version
 */
export async function selectReleaseDownloads(source, feedDirectory, destination, version) {
   if (resolve(source) === resolve(destination)) throw new Error("Use a separate empty download destination.");
   await mkdir(destination, { recursive: true });
   if ((await readdir(destination)).length) throw new Error("Download destination must be empty.");
   const files = [
      ...publishedDownloads(version).map((file) => ({ from: join(source, file.source), name: file.name })),
      ...feeds.map((name) => ({ from: join(feedDirectory, name), name })),
   ];
   for (const file of files) {
      const info = await lstat(file.from);
      if (!info.isFile() || info.size === 0) throw new Error(`Invalid release file: ${file.name}`);
   }
   for (const file of files) await copyFile(file.from, join(destination, file.name));
}

if (import.meta.main) {
   const [source, feedDirectory, destination, tag, ...extra] = process.argv.slice(2);
   if (!source || !feedDirectory || !destination || !tag?.startsWith("v") || extra.length)
      throw new Error("Usage: bun scripts/release-downloads.mjs <dist> <feed directory> <empty destination> <tag>");
   await selectReleaseDownloads(source, feedDirectory, destination, tag.slice(1));
}
