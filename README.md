# Image Deduplicator

A local-first desktop tool for finding, reviewing, and safely removing duplicate images. It exists to reclaim disk space and speed up duplicate review without ever putting your files at risk.

## How removal stays safe

Similarity is ranked evidence, not truth. Nothing leaves your library without an explicit chain of choices:

1. **Mark** removal candidates while reviewing (nothing has moved yet).
2. **Confirm the move** in the final review. Candidates land in a managed duplicate folder (`.image-deduplicator-managed`, inside a `duplicate` folder in your scan root), organized per set.
3. **Undo move** restores everything byte-for-byte, or **Recycle** sends the duplicate folder to the Recycle Bin when you are happy.

Moving and recycling always ask for confirmation. The detector hashes image layout (64-bit difference hash), so it groups near-identical copies: resizes, re-encodes, and light edits. Rotated, cropped, or mirrored variants are out of scope by design.

## Development

```sh
bun install
bun run dev       # build the main process, start vite + electron
```

Useful launch-time flags (any Electron app accepts these; they are how automated runs avoid the native folder dialog):

- `--user-data-dir=<folder>` — isolated profile, so a test scan never touches your real saved review.
- `--scan=<folder>` — start scanning the given folder as soon as the renderer is up.
- `IMAGE_DEDUPLICATOR_PROD=1` — load the built renderer (`build/renderer/`) instead of the dev server.

## Verification

```sh
bun run verify    # format check, lint, typecheck, unit tests, UI smoke test
```

`bun run test:ui` builds the app and walks the core flows in real Electron against a generated fixture library (`scripts/makeFixtures.mjs`); screenshots land in `.cache/ui-smoke/`.

## Packaging

```sh
bun run dist        # package for the current OS
bun run dist:win    # portable Windows exe
bun run dist:mac    # dmg (unsigned)
bun run dist:linux  # AppImage
bun run open        # launch the packaged app from release/
```

Artifacts land in `release/`. Windows and Linux packages can be built from any machine; a macOS dmg needs a Mac. The `Build` workflow packages all three on GitHub Actions (run it manually or push a `v*` tag), so full cross-platform releases do not require a machine per OS. The macOS build is unsigned; Gatekeeper asks for a right-click → Open the first time.

## Layout

- `src/main/` — Electron main process: scanner, SQLite persistence, file operations, IPC, preview protocol.
- `src/preload/` — the typed bridge (`window.imageDeduplicator`).
- `src/renderer/` — React UI. `reviewModel.ts` + `reviewActions.ts` hold the review logic; `hooks/` owns scan, history, compare, and overlay plumbing; each component has a co-located CSS file.
- `src/shared/` — types and IPC payload validation shared by both processes.
- `scripts/` — unit tests, UI smoke test, fixture generation.
- `build/` — compile output (gitignored): `build/renderer/` is vite's build, `build/electron/` the compiled main/preload/shared code.
- `release/` — packaged installers and executables (gitignored).

`AGENTS.md` describes the working conventions and the canonical vocabulary used across code and UI.
