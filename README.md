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
- `IMAGE_DEDUPLICATOR_PROD=1` — load the built `dist/` renderer instead of the dev server.

## Verification

```sh
bun run verify    # format check, lint, typecheck, unit tests, UI smoke test
```

`bun run test:ui` builds the app and walks the core flows in real Electron against a generated fixture library (`scripts/makeFixtures.mjs`); screenshots land in `.cache/ui-smoke/`.

## Packaging

```sh
bun run dist:win  # portable Windows exe in release/
bun run open      # launch the newest built exe
```

## Layout

- `src/main/` — Electron main process: scanner, SQLite persistence, file operations, IPC, preview protocol.
- `src/preload/` — the typed bridge (`window.imageDeduplicator`).
- `src/renderer/` — React UI. `reviewModel.ts` + `reviewActions.ts` hold the review logic; `hooks/` owns scan, history, compare, and overlay plumbing; each component has a co-located CSS file.
- `src/shared/` — types and IPC payload validation shared by both processes.
- `scripts/` — unit tests, UI smoke test, fixture generation.

`AGENTS.md` describes the working conventions and the canonical vocabulary used across code and UI.
