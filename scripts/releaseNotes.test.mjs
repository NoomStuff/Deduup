import { expect, test } from "bun:test";
import { releaseNotes } from "./release-notes.mjs";

const commit = (sha, message, parents = 1) => ({ sha: sha.repeat(40), parents: Array(parents).fill({}), commit: { message } });

test("release notes list the commits since the previous release, without merges or the version bump", async () => {
   const requested = [];
   const notes = await releaseNotes({
      tag: "v0.4.0",
      commit: "c".repeat(40),
      api: async (path) => {
         requested.push(path);
         if (path.startsWith("releases"))
            return [
               { tag_name: "v0.4.0", draft: true, prerelease: false },
               { tag_name: "v0.3.0", draft: false, prerelease: false },
            ];
         return { commits: [commit("a", "Fix the scan\n\nLonger body."), commit("b", "Merge branch", 2), commit("c", "Release 0.4.0")] };
      },
   });
   expect(requested).toEqual(["releases?per_page=100", `compare/v0.3.0...${"c".repeat(40)}`]);
   expect(notes).toBe("- Fix the scan (aaaaaaa)");
});

test("the first release has no notes", async () => {
   expect(await releaseNotes({ tag: "v0.1.0", commit: "a".repeat(40), api: async () => [] })).toBe("");
});
