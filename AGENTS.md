# Image Deduplicator

We will be working on a local-first tool for finding, reviewing, and safely removing redundant images. It exists to reclaim disk space, speed up duplicate review, and leave image libraries easier to manage.

## What we optimize for

1. **Speed.** Reviewing a large library should feel immediate. Power users need a flow they can move through quickly.
2. **Detection quality.** Do not trade reliable, useful detections for implementation convenience or superficial performance wins.
3. **Safety.** A user must understand what will happen to their files and remain in control of every removal.

The UI must be understandable without prior knowledge while rewarding fluency with sensible defaults, visible state, and optional accelerators.

## The user's files are theirs

Similarity is ranked evidence, not truth. It can order work and support low-risk automation, but it never replaces the user's judgment about whether an image should leave their library.

Removal is deliberately staged:

1. The user marks **removal candidates** while reviewing.
2. They see those choices in a final review and explicitly confirm them.
3. Candidates move to the app-owned quarantine folder.
4. The user may then move that quarantine folder to the Recycle Bin.

Preserve this clear, reversible path. Never blur a proposed action with one that has already changed a file.

## Canonical language

- **Image**: one file.
- **Set** / **detection**: one reviewable collection of related images.
- **Similarity group**: sets sharing a displayed similarity score. Used as user facing a navigation and bulk-action aid.
- **Similarity band**: the container that has all owns all the sets that share a displayed similarity score and the sets contained within them.
- **Removal candidate**: an image selected for removal that remains at its source.
- **Quarantined image**: a removal candidate moved into the app-managed duplicate folder.

Use these terms consistently in code, UI, tests, and documentation. Avoid calling a removal candidate "deleted" before it has actually left its source.

## How to make changes

Every feature should make review or deduplication faster, easier, or more trustworthy. This is not a general photo manager.

Prefer clean, minimal, strictly typed changes that preserve intentional flows. Keep the design extensible when there is a concrete need, but do not introduce abstraction for its own sake. Performance must scale to large libraries without freezing the workflow or compromising detection quality.

## Verifying changes

Agents should always run `bun run test` (typecheck plus unit tests) and `bun run lint` before claiming an outcome. For anything that touches the renderer, run `bun run test:ui` as well: it builds the app, launches it in Electron against an isolated profile, generates a deterministic fixture library (`scripts/makeFixtures.mjs`), and walks the core flows through the real DOM. Screenshots from that run land in `.cache/ui-smoke/` — inspect them when a change is visual.

To explore the app manually without touching real scan data, launch the built app with `--user-data-dir=<isolated folder>` plus `--scan=<folder>` (and `IMAGE_DEDUPLICATOR_PROD=1` when running from sources); the scan hook starts the scan without the native folder dialog. Never point a test scan at the real `%APPDATA%` profile: a scan replaces all saved review choices.
