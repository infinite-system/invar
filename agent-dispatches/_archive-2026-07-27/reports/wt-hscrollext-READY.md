# Horizontal extent fix — READY

## Root cause

The suspected initialization path was clean: `TextDocument.loadFromFile` and
`TextDocument.loadFromText` already scanned the full document. The stale authority was the
horizontal momentum consumer in `Workspace.tickScrollAnimations`. Every Alt-wheel animation step
recomputed its clamp from only the currently visible lines and passed that viewport-local width to
`Viewport.scrollByColumns`. The fdcf56d work had moved the scrollbar and drag paths to the
full-document aggregate, but this momentum path still used the old visible-window generator.

That explains why `src/modules/image/JpegDecoder.test.ts` stopped at the opening viewport's extent:
its true widest line is deeper in the file.

## Fix

- Horizontal editor momentum now clamps against the single full-document authority,
  `TextDocument.maximumLineWidth`.
- The exact aggregate is consumer-gated: no-wrap enables it; wrap mode clears it and performs no
  maximum-width maintenance.
- Full rebuilds use the requested cheap-bound algorithm: an integer UTF-16-length pass seeds the
  champion, the safe `2 × length` bound rejects non-candidates, and exact grapheme/display
  measurement runs only for survivors. Tab lines always take the exact path.
- Local edits update the champion incrementally. Deleting or shrinking the champion reruns the same
  prefiltered rescan.
- The editor contract now records the consumer-scoped rule: exact for hard boundaries, stable
  approximation where only proportion consumes geometry, and absent without a consumer. Its
  evidence cites the 2026-07-24 thumb oscillation and 2026-07-25 horizontal-clamp regressions.
- The scrollbar fixture now has 500 lines with its unique widest line at line 400. One drive proves
  per-frame thumb stability and then reaches that line's end at the unchanged extent.
- A permanent PTY acceptance smoke opens the real `JpegDecoder.test.ts`, Alt-wheels to the clamp,
  vertically reveals the deep widest line, and checks the exact tail from the byte-level terminal
  oracle. It is registered in `scripts/merge-gate.sh`.

## Red → green proof

| Drive | Code under test | Result |
|---|---|---|
| Final real-file acceptance smoke | Old visible-window momentum clamp | **RED**, exit 1. Alt-wheel stopped at `scrollLeft 29`; after vertically revealing `contract shape: dims plus rgba`, the exact tail `length width*height*4', () => {` was absent. |
| Same finalized acceptance smoke | Full-document momentum clamp | **GREEN**. Alt-wheel stopped at `scrollLeft 30`; vertical scrolling preserved that clamp and the exact tail was visible. |
| Deep 500-line fixture | Fixed aggregate and consumers | **GREEN**. Horizontal thumb length stayed identical through every captured vertical-scroll frame; the unique line-400 tail was reachable at the same extent. |

Red log: `/tmp/wt-hscrollext-horizontal-red.log`  
Green log: `/tmp/wt-hscrollext-horizontal-green.log`

## Final verification after rebase

| Instrument | Result |
|---|---|
| `bunx tsc --noEmit` | PASS |
| `bun test` | PASS — 1053 passed, 0 failed, 14563 expectations across 125 files |
| invariant checker `--all` | PASS |
| invariant checker `--all --refs` | PASS — 558 annotations resolved, 39 lattice links, 0 problems |
| `scripts/conventions-gate.sh` | PASS |
| `smoke-editor-harness.ts` | **5/5 PASS** |
| `smoke-scrollbars-harness.ts` (deep widest line + thumb stability) | **5/5 PASS** |
| `smoke-horizontal-extent-harness.ts` (real file acceptance) | **5/5 PASS** |

The smoke matrix began only after a quiet-machine check confirmed no
`scripts/merge-gate.sh` process was active. No merge gate was run.

## Rebase and tip

- Rebased onto `main` at `53ab6a158f12dd82cd967eebf06c68794189c55f`.
- Pre-rebase twin preserved as annotated tag
  `orphaned/fix-horizontal-extent-init-pre-rebase`.
- Final commit: `a164f732d23d4f41eadd3c2601ae9bc968c2274e`
  (`fix(editor): clamp horizontal glide to full extent`).

# Task 3 — Wrap-mode vertical restoration

## Leak and exact revert

The horizontal-extent activation added an `Editor` constructor that called
`synchronizeHorizontalExtentTracking()`. That call read the ref-returning `wordWrap` getter before
`Workspace.attachSettings()` installed the shared `settings.wordWrap` ref. ivue cached the first
returned ref, so the editor retained its local `false` fallback: configured wrap never became the
active mode, and vertical scrolling consequently stopped at the logical-line clamp (`scrollTop=168`)
instead of the wrapped visual-row extent.

Every wrap-affecting `Editor.ts` change from Task 2 was reverted; the file is now byte-identical to
`main`. The added editor-owned watch, constructor read, synchronization calls, and effect teardown
are gone. Wrap once again receives the shared settings ref through the original `attachWordWrap`
path and keeps its exact `EditorWrap.totalVisualRows` boundary.

The horizontal work remains:

- `TextDocument.maximumLineWidth` uses the cheap UTF-16 upper-bound scan and exact measurement only
  for viable candidates.
- Localized edits maintain one maximum-width champion incrementally; deleting or replacing that
  champion reruns the same bounded rescan.
- Horizontal momentum reads the exact full-document width only when word wrap is off. A focused
  `Workspace.scroll` test proves residual horizontal glide is not consumed in wrap mode.
- The real `JpegDecoder.test.ts` acceptance drive and deep line-400 widest-line fixture remain
  registered and green.

## Corrected invariant

`Geometry aggregates match their consumers` now states the corrected boundary:

- hard boundaries are always exact;
- the no-wrap horizontal clamp uses exact `TextDocument.maximumLineWidth`;
- the wrap vertical clamp uses exact `EditorWrap.totalVisualRows`;
- only a pure thumb ratio may use a stable approximation, and never in place of an exact clamp
  computed elsewhere;
- an aggregate is absent only when its owning surface has no consumer.

The impossibility boundary now explicitly includes wrap-mode scrolling stopping at logical-line
extent before the true last visual row.

## Task 3 driven runs

The smoke lane started only after a quiet-machine check found no active
`scripts/merge-gate.sh`, behavioral-contract, or smoke-harness process.

| Driven instrument | Result |
|---|---|
| `scripts/behavioral-contracts.sh` | PASS — wrap glide `early=4 settled=8 rest=8`; exact bottom `scrollTop=568 > 200`; suite ALL-PASS |
| `smoke-comment-styling-harness.ts` | PASS |
| `smoke-settings-applied-harness.ts` | PASS |
| `smoke-wrap-harness.ts` | PASS |
| `smoke-editor-harness.ts` | PASS |
| `smoke-scrollbars-harness.ts` | PASS — deep line-400 widest-line fixture |
| Required seam-adjacent harness matrix | **5/5 PASS** |
| `smoke-horizontal-extent-harness.ts` | PASS — real `JpegDecoder.test.ts`, clamp 30, deep tail visible |

## Task 3 static and unit runs

| Instrument | Result |
|---|---|
| Targeted editor + workspace tests | PASS — 18 passed, 0 failed |
| `bunx tsc --noEmit` | PASS (`TSC=0`) |
| `bun test` | PASS — 1058 passed, 0 failed, 14587 expectations across 126 files |
| invariant checker `--all` | PASS |
| invariant checker `--refs` | PASS — 563 annotations, 39 lattice links, 0 problems |
| `scripts/conventions-gate.sh` | PASS |

No merge gate was run.

## Task 3 tip

- Commit: `728f3e9cd87e62a2d2b2d061b382670f29595224`
  (`fix(editor): restore exact wrap extent`).
