# Deduup

We will be working on Deduup, a local-first tool for finding, reviewing, and safely removing redundant images. It exists to reclaim disk space, speed up duplicate review, and leave image libraries easier to manage.

## What we optimize for

1. **Speed.** Reviewing a large library should feel immediate. Power users need a flow they can move through quickly.
2. **Detection quality.** Do not trade reliable, useful detections for implementation convenience or superficial performance wins.
3. **Safety.** A user must understand what will happen to their files and remain in control of every removal.

Every feature should make review or deduplication faster, easier, or more trustworthy. This is not a general photo manager.

The UI must be understandable without prior knowledge while rewarding fluency with sensible defaults, visible state, and optional accelerators.

## The user's files are theirs

Similarity is ranked evidence, not truth. It can order work and support low-risk automation, but it never replaces the user's judgment about whether an image should leave their library.

Removal is deliberately staged:

1. The user marks **Discarded files** while reviewing.
2. They see those choices in a final review and explicitly confirm them.
3. Candidates move to the managed duplicate folder inside the scan root.
4. The user may then move that duplicate folder to the Recycle Bin.

Preserve this clear, reversible path. Never blur a proposed action with one that has already changed a file.

## Canonical language

- **Image**: one file.
- **Set** / **detection**: one reviewable collection of related images.
- **Similarity group**: sets sharing a displayed similarity score. Used as user facing a navigation and bulk-action aid.
- **Similarity band**: the container that has all owns all the sets that share a displayed similarity score and the sets contained within them.
- **Discarded file**: an file selected for removal that remains at its source.
- **Moved image**: a Discarded file now living in the managed duplicate folder. The UI says "in the duplicate folder"; it is still recoverable until the folder is recycled.

Use these terms consistently in code, UI, tests, and documentation. Avoid calling a Discarded file "deleted" before it has actually left its source. Never call an image a "copy": duplication is the relationship between images, not what a file is.

## Verifying changes

Agents should always run `bun run verify` (format check, lint, typecheck plus unit tests, and the UI smoke test) or at minimum `bun run test` and `bun run lint` before claiming an outcome. The same checks run in GitHub Actions on every push. For anything that touches the renderer, run `bun run test:ui` as well: it builds the app, launches it in Electron against an isolated profile, generates a deterministic fixture library (`scripts/makeFixtures.mjs`), and walks the core flows through the real DOM. Screenshots from that run land in `.cache/ui-smoke/` — inspect them when a change is visual.

To explore the app manually without touching real scan data, launch the built app with `--user-data-dir=<isolated folder>` plus `--scan=<folder>` (and `IMAGE_DEDUPLICATOR_PROD=1` when running from sources); the scan hook starts the scan without the native folder dialog. Never point a test scan at the real `%APPDATA%` profile: a scan replaces all saved review choices.
