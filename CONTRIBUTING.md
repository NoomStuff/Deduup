# Contributing to Deduup

Deduup is a local-first tool for finding, reviewing, and safely removing duplicate images. See AGENTS.md for the product charter and working conventions.

## Prerequisites

- [Bun](https://bun.sh) 1.3+ (package manager, test runner, script runner).
- Node 22+ (ships with the toolchain bun installs; used by the packaging scripts).
- Windows, macOS, or Linux for development. Packaging a platform needs that platform: sharp and the Electron binary are platform specific, and `scripts/package-app.mjs` refuses to cross-compile.

## Setup and everyday commands

```sh
bun install
bun run dev         # main process build + vite dev server + electron
bun run verify      # format:check → lint → test → test:ui
bun run test:ui     # build + electron smoke test against generated fixtures
```

`bun run verify` is the minimal gate for every change; the same checks run in CI on every pull request and push to `main`.

The UI smoke test builds the app, launches it in Electron against an isolated profile, generates a deterministic fixture library (`scripts/makeFixtures.mjs`), and walks the core flows through the real DOM. Screenshots land in `.cache/ui-smoke/` — inspect them when a change is visual.

Manual testing without touching real scan data:

```sh
bun run build
npx electron . --user-data-dir=<isolated folder> --scan=<folder> IMAGE_DEDUPLICATOR_PROD=1
```

Never point a test scan at the real `%APPDATA%` profile: a scan replaces all saved review choices.

## Code conventions

- Each renderer component owns its CSS in a co-located `.css` file; `theme.css` holds tokens, base styles, and shared controls.
- Modals and drawers are built on `components/OverlayPanel.tsx`; a dialog is content plus a skin class, never its own closing state.
- Removal is staged: candidates → confirmed move → managed duplicate folder → recycle. Never blur a proposed action with one that has changed a file.
- Canonical vocabulary: image (one file), set/detection (one reviewable collection), similarity group/band (navigation aids), removal candidate, moved image. Avoid calling a candidate "deleted" before it has left its source.
- The on-disk identifiers — `.deduup-managed`, its ownership marker, and the sqlite file name — are compatibility surfaces. Changing them needs a migration story.

## Packaging and releases

```sh
bun run dist          # current OS
bun run dist:win      # portable exe
bun run dist:win:all  # portable + NSIS installer
bun run dist:mac      # dmg (unsigned)
bun run dist:linux    # AppImage
bun run verify:package
```

`verify:package` checks Windows version-resource branding and launches the packaged app against a fixture scan. Run it after packaging on each OS you plan to ship.

### How a release happens

1. Bump `version` in `package.json` (semver; a prerelease suffix like `-rc.1` marks the release as a prerelease). Open a pull request for the change.
2. Merging to `main` triggers the Release workflow. If the version changed since the last push (or a `v*` tag was pushed), CI:
   - runs `bun run verify` on Windows (tag pushes must match `package.json`),
   - packages five targets: Windows x64 (portable + installer), macOS x64 and arm64 (dmg), Linux x64 and arm64 (AppImage), each verified with `verify:package`,
   - rewrites the electron-updater feeds (`scripts/prepare-update-feed.mjs`) to point at the release assets,
   - creates a **draft** GitHub release with all six assets, then publishes it and commits the feeds to the `updates` branch.
3. The git tag is created by the release step, after every package passed verification — a failed package never produces a tag.

Installed Windows builds update automatically through electron-updater against the `updates` branch. The portable build and AppImage verify and download the new package via the GitHub API; mac builds open the release page. Old portable builds from before the update feed existed update by downloading the new exe manually.

### Update feeds, briefly

Releases hold only user-downloadable artifacts. The `updates` branch holds `latest.yml`, `latest-linux.yml`, and `latest-linux-arm64.yml`, each rewritten to point at the release download URLs. This decouples what users download from what the updater reads, so a broken feed can be fixed by committing to that branch without touching a release.

## Reporting issues

Open a GitHub issue with the app version (Help → About) and, for scan problems, the folder structure that triggered it (names of a few files are enough; the images themselves are never needed).
