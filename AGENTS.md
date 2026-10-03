# Deduup

We are building a local-first desktop tool for finding and safely removing duplicate images, for Windows, macOS, and Linux.

Deduup scans a folder for images that look the same, groups them into reviewable sets, and moves what the user discards into a managed duplicate folder that stays restorable until it is recycled. Speed and safety only matter if the detections are worth trusting.

## What we optimize for

1. **Speed.** Reviewing a large library should feel immediate. Opening a folder, judging a set, and moving on should take seconds, and detection must scale to six-figure libraries without freezing the workflow.
2. **Detection quality.** Do not trade reliable, useful groupings for implementation convenience or superficial wins. A wrong grouping costs the user's trust; a missed group costs their disk space.
3. **Safety.** A user must understand what will happen to their files and remain in control of every removal.

### Key principles

- **Similarity is evidence, not truth**: it orders the work and supports low-risk automation, but it never removes anything on its own and never replaces the user's judgment.
- **Removal is staged**: the user discards files while reviewing, confirms the move in a final review, and recycles the managed folder when happy. Never blur a proposed action with one that has already changed a file.
- **Explain limits plainly**: rotated, cropped, and mirrored variants are out of scope; say so instead of quietly missing them.

## Scope

The core job is grouping near-identical images into sets the user can judge once, then moving discarded files safely. Detection hashes image layout (a 64-bit difference hash), so exact duplicates, resizes, re-encodes, and light edits group together.

Rotated, cropped, and mirrored variants, general photo management, and cloud integrations are outside the current scope. Growth needs a reason tied to the review workflow.

## Canonical language

- **Image**: one file. Never call one a "copy": duplication is the relationship between images, not what a file is.
- **Set** / **detection**: one reviewable collection of related images.
- **Similarity group**: sets sharing a displayed similarity score, used as a navigation and bulk-action aid.
- **Similarity band**: the container that owns all the sets sharing a displayed similarity score.
- **Discarded file**: a file selected for removal that remains at its source.
- **Moved image**: a discarded file now living in the managed duplicate folder. The UI says "in the duplicate folder"; it is still recoverable until the folder is recycled.

Use these terms consistently in code, UI, tests, and documentation. Avoid calling a discarded file "deleted" before it has actually left its source.

## Making changes

Every feature should make review or deduplication faster, easier, or more trustworthy. Prefer clean, minimal, strictly typed changes that preserve intentional flows; do not introduce abstraction for its own sake.

Each renderer component owns its CSS in a co-located `.css` file; `theme.css` holds tokens, base styles, and the shared overlay keyframes. Modals and drawers are built on `components/OverlayPanel.tsx`: a dialog is content plus a skin class, never its own closing state. Animations are part of the design: every surface that appears animates in and out.

The on-disk identifiers — `.image-deduplicator-managed`, its ownership marker, and the sqlite file name — are compatibility surfaces. Changing them needs a migration story.

## Verifying changes

Run `bun run verify` (format check, lint, typecheck, unit tests, UI smoke test) before claiming an outcome; the same checks run on every push. For anything that touches the renderer, run `bun run test:ui` as well: it builds the app, launches it in Electron against an isolated profile, generates a deterministic fixture library, and walks the core flows through the real DOM. Screenshots land in `.cache/ui-smoke/` — inspect them when a change is visual.

To explore the app manually without touching real scan data, launch the built app with `--user-data-dir=<isolated folder>` plus `--scan=<folder>` (and `IMAGE_DEDUPLICATOR_PROD=1` when running from sources). Never point a test scan at the real `%APPDATA%` profile: a scan replaces all saved review choices.

## Versioning

Bumping the version in `package.json` is what triggers a release: pushing the change to `main` makes CI verify, package all five targets, and publish a GitHub release with auto-update feeds. Choose the number deliberately for the changes made, and open a pull request before a version change lands on `main` unless the user says otherwise. A `v*` tag must match `package.json`'s version or CI fails it.

After a version bump, watch the release to make sure it succeeds; if it fails, resolve the issue and push a fix version.

The product name and repository are Deduup (`NoomStuff/Deduup`); the npm package name stays `image-deduplicator` (deliberate: it keeps existing dev profiles at `%APPDATA%/image-deduplicator`).
