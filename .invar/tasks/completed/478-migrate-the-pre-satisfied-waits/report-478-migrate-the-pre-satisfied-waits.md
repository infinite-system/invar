## In plain words

Several tests waited for facts that were already true before a click, wheel, copy, or hover arrived. Those tests could pass without seeing the action.

Five files now wait for a changed row, offset, copy result, or current splitter frame. Each planted no-op failed, and every restored smoke passed.

## Result

READY at commit `7de01f58cd6428b99112389b2d44e92fa5d47782`.

This round stops at a clean file boundary, as the [brief](brief-478-2-migrate-the-pre-satisfied-waits.md) permits. It completes the five named positive controls and the panel-chrome contention wait.

| State | Files |
| --- | --- |
| Done | [smoke-tabs-harness.ts](../../../../scripts/harness/smoke-tabs-harness.ts), [smoke-selection-harness.ts](../../../../scripts/harness/smoke-selection-harness.ts), [smoke-text-input-harness.ts](../../../../scripts/harness/smoke-text-input-harness.ts), [smoke-search-mouse-harness.ts](../../../../scripts/harness/smoke-search-mouse-harness.ts), [smoke-panel-chrome-harness.ts](../../../../scripts/harness/smoke-panel-chrome-harness.ts) |
| Remaining contention tier | [smoke-plugin-manifest-harness.ts](../../../../scripts/harness/smoke-plugin-manifest-harness.ts) and [smoke-scrollbars-harness.ts](../../../../scripts/harness/smoke-scrollbars-harness.ts) |
| Remaining shared and class-1 sites | Every open site in the [wait-defect census](../../completed/470-harness-wait-defect-census/census-470-harness-wait-defect-census.md), after subtracting the five done files above |
| Remaining class-2, class-3, and class-6 sites | The later rows in the same [wait-defect census](../../completed/470-harness-wait-defect-census/census-470-harness-wait-defect-census.md). Class-3 sleeps remain limited to sites with an obvious condition. |

The census remains the exact per-site work list. The [graph reach report](../../completed/471-graph-reaches-the-whole-app/report-471-graph-reaches-the-whole-app.md) remains the path map.

## Changes

- The tab smoke now waits for `bufferTabStrip.scrollOffset` to increase. It then checks that `bufferTabStrip.activeIndex` stayed fixed.
- The selection smoke now requires hover or wheel paint to change. It checks the selected row in that changed frame.
- The text-input smoke first copies a real selection. The unselected copy must then change `lastCopyChars` from `2` to `0`.
- The search-mouse smoke waits for hover paint. It then reads `quickOpen.selectedIndex` at a graph settle boundary.
- The panel-chrome smoke carries the current splitter frame between drags. It scans only the published drag span, not the whole row.

The tab smoke also waits for the Open Buffers title before Escape. It waits for `boundedListPopup.open=false` before it checks the closed frame.

## Positive controls

Each temporary plant failed. I restored every plant before the green runs.

| Control | Planted defect | Red result |
| --- | --- | --- |
| Tab pan | Made `TabStrip.pan` a no-op | Exit 1. The graph wanted offset `1` and reported the settled value `0`. |
| Tree wheel | Sent an upward wheel event at the top | Exit 1. The selected tree row never moved. |
| Commit wheel | Removed the commit-log wheel event | Exit 1. The selected commit row never moved. |
| Unselected copy | Made no-selection copy return the full input | Exit 1. `lastCopyChars` never returned to `0`. |
| Quick Open hover | Made hover also change `selectedIndex` | Exit 1. The unchanged-selection assertion failed. |
| Splitter edge drag | Removed the second edge drag | Exit 1. The last-edge resize condition timed out. |

## Invariants

- [Harness waits observe conditions not frame ordinals](../../../../scripts/harness/harness.invariants.md): strengthened. Every changed wait now observes a false-before condition or checks state after a proven screen change.
- [Every wait names itself](../../../../scripts/harness/harness.invariants.md): upheld. New waits name the exact row, popup, offset, or relayout condition.
- [Async-published state is always awaited](../../../../scripts/harness/harness.invariants.md): upheld. Status waits poll, and graph reads use a settle boundary.
- [The composition graph reaches every installed contributor](../../../../src/modules/system/system.invariants.md): upheld. The tab-strip and Quick Open paths resolved through the existing composition root.
- [Coverage may fall but never silently](../../../../project.invariants.md): upheld. The conventions gate passed, and no coverage declaration was needed.

No contract changed. The final invariant check found 0 problems.

## Verification

- Five touched smokes: ALL-PASS.
- `bun run drive --size 10`: PASS.
- `bun run drive --size 100000`: PASS.
- `bun test`: PASS. 2,352 tests across 353 files, 72,105 expectations, 0 failures.
- `bunx tsc --noEmit`: PASS.
- `bash scripts/conventions-gate.sh`: PASS. It reported 20 existing legacy grammar violations.
- Invariant checker `--all`: PASS for every record.
- Invariant checker `--refs`: PASS. 1,363 annotations, 266 lattice links, 0 problems.
- `bun scripts/check-harness-wait-observation.ts`: PASS with 70 report-only candidates.

I did not run `scripts/merge-gate.sh` or `scripts/behavioral-contracts.sh`.

## PTY usability

- Easy: graph paths made the tab and Quick Open checks direct. The real PTY smokes completed quickly.
- Confusing: a timed-out graph await says the path did not resolve, then reports its last settled value. Those two claims conflict.
- Missing: graph waits accept equality only. A relative condition still needs a known next value or a changed screen region.

## Bycatch

- Not fixed: `GraphClient.awaitValue` reports a resolved timeout as a path miss. The no-op tab-pan control showed `walk died at: <unknown>` beside `last settled value was 0`. This reproduced once.

No other bycatch was observed.
