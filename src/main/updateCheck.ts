import type { AvailableUpdate } from "../shared/types.js";

// Pure update-decision logic, free of electron imports so bun can unit test it.
export const repository = "NoomStuff/Deduup";

export const isNewerVersion = (candidate: string, current: string): boolean => {
   const parse = (value: string) => /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(value.trim());
   const next = parse(candidate);
   const installed = parse(current);
   if (next === null || installed === null) return false;
   for (let index = 1; index <= 3; index++) {
      if (Number(next[index]) !== Number(installed[index])) return Number(next[index]) > Number(installed[index]);
   }
   if (next[4] === undefined || installed[4] === undefined) return next[4] === undefined && installed[4] !== undefined;
   const a = next[4].split(".");
   const b = installed[4].split(".");
   for (let index = 0; index < Math.max(a.length, b.length); index++) {
      const left = a[index];
      const right = b[index];
      if (left === right) continue;
      if (left === undefined || right === undefined) return right === undefined;
      const leftNumeric = /^\d+$/.test(left);
      const rightNumeric = /^\d+$/.test(right);
      if (leftNumeric && rightNumeric) return Number(left) > Number(right);
      if (leftNumeric !== rightNumeric) return !leftNumeric;
      return left > right;
   }
   return false;
};

interface ReleasePayload {
   tag_name: unknown;
   name: unknown;
   html_url: unknown;
   draft: unknown;
   prerelease: unknown;
}

export const fetchAvailableUpdate = async (
   currentVersion: string,
   request: (url: string, init: RequestInit) => Promise<Response>
): Promise<AvailableUpdate | null> => {
   const response = await request(`https://api.github.com/repos/${repository}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": `Deduup/${currentVersion}` },
   });
   if (!response.ok) throw new Error(`Update check failed with ${response.status}.`);
   const release = (await response.json()) as ReleasePayload;
   if (
      typeof release.tag_name !== "string" ||
      typeof release.html_url !== "string" ||
      typeof release.draft !== "boolean" ||
      typeof release.prerelease !== "boolean" ||
      (release.name !== null && typeof release.name !== "string")
   )
      throw new Error("The update check returned an unexpected payload.");
   const version = release.tag_name.replace(/^v/, "");
   if (release.draft || release.prerelease || !isNewerVersion(version, currentVersion)) return null;
   const name = release.name?.trim();
   return { version, name: name !== undefined && name.length > 0 ? name : `Deduup ${version}`, url: release.html_url, mode: "releases" };
};
