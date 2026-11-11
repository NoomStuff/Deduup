import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { feeds, publishedAssets, publishedDownloads, selectReleaseDownloads } from "./release-downloads.mjs";

test.each(["valid", "missing download", "missing feed", "occupied"])("selects versionless release files: %s", async (scenario) => {
   const root = await mkdtemp(join(tmpdir(), "deduup-downloads-"));
   try {
      const [source, feed, output] = ["dist", "feed", "release"].map((name) => join(root, name));
      await mkdir(source);
      await mkdir(feed);
      for (const file of publishedDownloads("0.3.0").slice(scenario === "missing download" ? 1 : 0)) await writeFile(join(source, file.source), file.source);
      for (const name of feeds.slice(scenario === "missing feed" ? 1 : 0)) await writeFile(join(feed, name), "feed");
      if (scenario === "occupied") {
         await mkdir(output);
         await writeFile(join(output, "stale.exe"), "old");
      }
      const pending = selectReleaseDownloads(source, feed, output, "0.3.0");
      if (scenario !== "valid") return void (await expect(pending).rejects.toThrow());
      await pending;
      const published = (await readdir(output)).sort();
      expect(published).toEqual(publishedAssets("0.3.0").sort());
      expect(published.some((name) => name.includes("0.3.0"))).toBe(false);
      expect(await readFile(join(output, "Deduup-windows-x64-setup.exe"), "utf8")).toBe("Deduup-0.3.0-win-x64-Installer.exe");
   } finally {
      await rm(root, { recursive: true, force: true });
   }
});
