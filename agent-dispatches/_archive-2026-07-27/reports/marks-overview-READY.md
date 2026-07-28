# Marks and overview — READY

Feature commit: `44887e8` (`Separate diff marks and add editor overview ruler`)

Required plugin-canvas prerequisite present on this branch:
`5d4617d` (`Invert Git into the plugin canvas`).

## Final mark vocabulary

| Mark | Meaning | Owner | Column | Tier resolutions |
| --- | --- | --- | --- | --- |
| `▎` in added color | Line added against HEAD | Source-control plugin | Diff gutter | `▎` at nerd, Unicode, and ASCII tiers |
| `▎` in modified color | Real line modified against HEAD | Source-control plugin | Diff gutter | `▎` at nerd, Unicode, and ASCII tiers |
| `▎` in deleted color | Deleted block anchored to the following real line, or the final real line at end of file | Source-control plugin | Diff gutter | `▎` at nerd, Unicode, and ASCII tiers |
| Severity-colored underline | Diagnostic range and severity | Language diagnostics | Code body | Cell underline; no glyph fallback. Hint shares the info color. |
| Severity/change-colored `•` | Whole-document location of a diff or diagnostic mark | Shared `GutterDecorations` snapshot | Editor vertical scrollbar track | `•` at nerd and Unicode tiers; `.` at ASCII tier |

Diagnostics have no gutter representation in the type vocabulary. A red gutter
bar therefore means deletion; a red diagnostic exists only as an in-body
underline and an overview pip.

## Placement, precedence, and recovery

A deleted run is placed on the first real line below it. At end of file it is
placed on the final real line. Hover text names the placement, for example
`3 lines deleted above` or `2 lines deleted at end of file`.

When a real line carries both a modification and a nearby deletion, modified
color wins in the one gutter cell. The deletion is not discarded: the gutter
hover retains both labels, such as `modified · 3 lines deleted above`.
The complete diff-line order is modified > added > deleted.

When many logical lines map to one overview track cell, the color order is:

`error > warning > info > hint > modified > added > deleted`

All contributing hover labels remain on the aggregated cell in that order, so
the losing meanings remain recoverable.

## Shared generator and interaction

`GutterDecorations.snapshotFor` is the single cached generator. The normal
gutter, diagnostic underlines, and `OverviewRuler` all project the same snapshot.
The snapshot changes only with a document, contribution, or registration
revision. The overview projection is additionally cached by snapshot identity,
document line count, and track length.

No mark-specific click-to-jump handler was added. The pip is painted inside the
existing track and preserves the scrollbar's native track-click and drag
contract.

## Large-file measurement

Command: `bun scripts/marks-overview-benchmark.ts`

Fixture: 20,000 document lines, 10,000 diagnostics, 60-cell track, 25
measurement iterations per run. Three process runs all exited 0.

| Measurement | Run 1 | Run 2 | Run 3 |
| --- | ---: | ---: | ---: |
| Document load median | 5.181 ms | 5.248 ms | 5.437 ms |
| Load + empty overview median | 4.966 ms | 5.281 ms | 5.146 ms |
| Empty-overview opening increment | -0.215 ms | 0.033 ms | -0.291 ms |
| 10k-decoration snapshot + overview recompute median | 1.262 ms | 1.258 ms | 1.466 ms |
| Cached overview read | 0.0280 µs | 0.0299 µs | 0.0269 µs |

The opening increment stayed inside measurement noise (-0.291 to +0.033 ms).
The 100,000 cached reads in each run did not increment the recomputation
counter; it remained 25 after the 25 forced revision changes.

## Thumb geometry and quiescence proof

`SolidThumbScrollBar.test.ts` compares `getThumbRect`, width, and height before
and after three overview marks and finds them byte-identical.

The full scrollbar PTY smoke passed three fresh runs. In both wrap-off and
wrap-on modes, adding an overview mark left the bar column, track length, and
thumb length unchanged. Each run then observed roughly 165–170 synchronized
scroll frames with constant 20-row viewport input, constant 502-row content
input, and a constant two-cell thumb.

`bash scripts/behavioral-contracts.sh` exited 0. Its idle-quiescence contract
observed frame 2 -> 2 over three untouched seconds. Momentum, wrap-scroll,
open-then-scroll, focus-recovery, and pane-independence also passed.

## Driven acceptance

- Diagnostics harness: three direct runs and three wrapper runs exited 0 for
  both tsgo and typescript-language-server. It proved a deleted-colored `▎`,
  no `▁`, a red diagnostic body underline, a red overview pip, named deletion
  hover, no diagnostic-only gutter glyph, and a proportional off-screen line
  999 error.
- Gutter-diff harness: three fresh runs exited 0. It proved clean, modified,
  added, deletion placement, bar-only deletion shape, and deletion-count hover.
- Scrollbar harness: three fresh full runs exited 0. It proved overview marks do
  not change geometry, thumb stability through the full document, and the
  remaining scrollbar contracts.
- Overview unit aggregation places a warning and error in one track cell and
  asserts that error wins while both hover labels remain.

## Required gate exit codes

| Command | Exit |
| --- | ---: |
| `bunx tsc --noEmit` | 0 |
| `bun test` | 0 — 1,371 pass, 0 fail |
| `bun scripts/check-file-grammar.ts` | 0 |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all` | 0 |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --refs` | 0 |
| `bash scripts/conventions-gate.sh` | 0 |
| `bun scripts/check-coverage-ratchet.ts` | 0 |
| `bash scripts/behavioral-contracts.sh` | 0 |

`git ls-files | grep '^TASK'` exited 1 with no output, as expected because no
TASK file is tracked. The worktree was clean after commit.

## Could not prove

Nothing in the requested acceptance set remains unproved. Mark-specific
click-to-jump was intentionally not implemented because it would replace the
existing native track-click/drag interaction.
