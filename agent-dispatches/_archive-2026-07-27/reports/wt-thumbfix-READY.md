# READY — vertical thumb breathing regression (#65)

Branch: `fix-thumb-breathing`  
Commit: `ed949f7ee5ee53fbfa65aec16e442b1291bd274c`  
Base: rebased onto `origin/main` at `8722f66`; branch is ahead 1, behind 0.

## Culprit and driven boundary evidence

The culprit is `341590c8d3c87f7ec88696d9ebc5929eff779039`
(`fix(scrollbar): solid bg-fill thumbs via SolidThumbScrollBar + slider viewport heal`).

The strengthened current FrameProbe was run against detached historical application builds:

- `341590c^` (`2c2e781`): PASS — wrap-off visual thumb extent was exactly 2 cells across
  169 completed scroll frames.
- `341590c`: FAIL — the same drive observed extents 2 and 3 across 167 completed scroll frames.

That boundary rules out the later UI grammar conversion and layout waves.

## Mechanism

OpenTUI represents slider geometry in half cells. Its native whole-cell `getThumbRect()` floors
the moving start endpoint and ceils the moving end endpoint independently. With a constant
four-half-cell thumb, start parity therefore alternates the rectangle between two and three whole
cells.

Before `341590c`, the block-glyph painter preserved the half-cell coverage. That commit switched
the shared scrollbar seam to background-fill painting of the native whole-cell rectangle, making
the endpoint-rounding alternation visible as breathing.

The sharpened input probe confirmed this was not extent discovery:

- editor wrap off: exact `viewportRows=20`, exact `totalRows=502`;
- editor wrap on: exact `viewportRows=20`, exact `totalVisualRows=502`;
- DiffView: exact `viewportRows=19`, exact `totalRows=501`.

Those inputs remained constant while scrollTop moved through 100+ observed positions in each path.

## Fix

`SolidThumbScrollBar` now normalizes the shared slider geometry at the generator:

- derive whole-cell length once from the position-independent virtual thumb size;
- derive the moving start separately and clamp it so both extremes remain reachable;
- replace the slider instance's `getThumbRect()`, so background painting and native mouse
  hit-testing still consume the same rectangle.

The editor invariant was refined from an approximate proportional input to exact viewport/total
inputs with quantization only at final whole-cell projection. The UI scrollbar invariant now
records the normalized shared rectangle.

The permanent scrollbar harness now:

- records `viewportRows`, `totalRows`/`totalVisualRows`, `scrollTop`, and painted extent on every
  completed synchronized frame;
- drives the complete tall mixed-width file with wrap off and wrap on;
- drives a separate 501-row side-by-side DiffView path;
- keeps the existing horizontal/tree/git/fitting-pane coverage.

Post-rebase driven results:

- wrap off: extent 2 across 172 frames; viewport 20; total 502;
- wrap on: extent 2 across 170 frames; viewport 20; total 502;
- DiffView: extent 2 across 170 frames; viewport 19; total 501;
- `smoke-scrollbars-harness`: ALL-PASS, exit 0.

## Verification

- `bunx tsc --noEmit`: exit 0
- `bun test`: 1300 pass, 0 fail, exit 0
- `bun scripts/check-file-grammar.ts`: 0 violations, exit 0
- invariant checker `--all --refs`: 644 annotations, 0 problems, exit 0
- `bash scripts/conventions-gate.sh`: PASS, exit 0
- `bash scripts/behavioral-contracts.sh`: ALL-PASS, exit 0
- `bash scripts/smoke-scrollbars.sh`: ALL-PASS, exit 0
- post-rebase `bun scripts/harness/smoke-scrollbars-harness.ts`: ALL-PASS, exit 0
- `git diff --check`: exit 0

The tracked worktree is clean. The only untracked files are the orchestrator-provided `TASK.md`
and `TASK2.md` briefs. No gate, push, merge, branch deletion, or tag was performed.
