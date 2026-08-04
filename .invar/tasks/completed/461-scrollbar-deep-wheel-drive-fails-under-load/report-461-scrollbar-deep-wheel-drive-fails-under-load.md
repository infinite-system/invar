## In plain words

The scrollbar check found the editor's right edge by looking for a vertical bar. The cursor can also look like a vertical bar, so the check sometimes watched the wrong place and waited forever after the editor had already resized. The check now reads the rounded pane border and waits for the exact width change; it passes alone and in five runs under CPU load.

## Result

READY for conductor verification.

I changed the driven contract in [smoke-scrollbars-harness.ts](../../../../scripts/harness/smoke-scrollbars-harness.ts). The helper now finds the pane edge from the matching `╭` and `╮` border corners. It cannot mistake a pipe-shaped native cursor for pane chrome.

The dock-conceal path now measures the live pane and settled graph before the gesture. It derives the reclaimable column count from the visible dock, drives `Ctrl+Alt+B` through the shared user gesture, waits for the exact `workspaceSet.activeEditor.viewport.width` result, and then checks the final painted pane edge. I did not add a sleep or widen a timeout.

I updated [project.coverage-deltas.md](../../../../project.coverage-deltas.md) to record the resulting `62` assertions and `68` waits in the scrollbar smoke.

## Cause and evidence

The unchanged smoke failed both alone and with one bounded CPU burner. Both failures stopped at `the wrap-off editor reclaims the concealed dock's columns`.

At the timeout, the graph said `rightDockVisible=false`. The live default probe moved `workspaceSet.active.editor.viewport.width` from `44` to `73`, and the painted pane reached column `119` in a 120-column frame. The dock action and relayout had completed. The old helper had selected the native cursor's `│` glyph as the right border, so its screen condition stayed false.

This is a harness observation defect, not a scroll continuation defect. The product scroll generator did not change.

## Driven verification

- The repaired smoke passed once by itself with `smoke-scrollbars-harness: ALL-PASS`.

- Five consecutive full smoke runs passed while one bounded CPU burner remained active. Each log ended with `smoke-scrollbars-harness: ALL-PASS`.

- Every loaded run covered the shared 500-line and 100,000-line fixtures. Both scales completed editor and preview scrollbar drags. The wrap-off and wrap-on wheel drives reached the document bottom. The deep widest line remained reachable at the stable extent.

- Loaded run 5 observed `62` wrap-off frames and `65` wrap-on frames. `viewportRows` stayed `20`; `totalRows` stayed `502` and `504`; the vertical thumb extent stayed `2`. The sequence varied naturally between runs while the end state and geometry stayed exact.

- The live dock measurement reported `29` reclaimable columns in each affected arm.

### Positive control

After the fix passed, I temporarily made the pane helper return a cursor-like edge seven columns after the left border. The smoke went red. It measured `83` false reclaimable columns, waited for viewport width `136`, and reported the settled actual width `82`. I removed the planted defect before the final runs.

## Final checks

- `bunx tsc --noEmit`: PASS.

- `bun test`: PASS, `2376` tests across `358` files, `72168` expectations, `0` failures.

- `bun scripts/check-harness-wait-observation.ts`: PASS as a report-only census, `116` TypeScript files, `1593` assertion calls, and `2200` condition waits. Its `65` candidates are existing semantic-review items; none identifies the new dock-reclaim wait.

- `bun scripts/check-coverage-ratchet.ts`: PASS, `392` files inspected and no undeclared decrease against `a9700d9`.

- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: PASS, `1378` annotations and `266` lattice links resolved, `0` problems.

- `bash scripts/conventions-gate.sh`: PASS.

I did not run the merge gate, as required by the [task brief](brief-461-1-scrollbar-deep-wheel-drive-fails-under-load.md). The conductor still owns the final contention arm.

## Invariant verdicts

- [Harness waits observe conditions not frame ordinals](../../../../scripts/harness/harness.invariants.md): PASS. The new wait observes the exact settled viewport width and the final pane edge. It does not use a delay or frame number.

- [Every wait names itself](../../../../scripts/harness/harness.invariants.md): PASS. The added status and grid waits state the condition they observe. The graph wait reports its exact graph path and expected value.

- [One generator owns each scroll position](../../../../src/modules/ui/scroll.invariants.md): PASS and unchanged. No product scroll writer or motion generator changed. The driven 500-line and 100,000-line arms still use the shared scroll path.

- [Scroll lattice](../../../../src/modules/ui/scroll.lattice.md): PASS. The change only strengthens the harness observation boundary; it does not introduce a second input, motion, or position generator.

## Bycatch

- FIXED in `922a21bc`. Quick Open already focused the editor after opening `horizontal-thumb-stability.ts`, but the smoke always sent `Tab`. That inserted two leading spaces, so `End` reached column `31` while the fixture marker ended at column `29`. I reproduced the added spaces in the failed status, then made the smoke send `Tab` only when the settled graph focus is not `editor`. This is a small local correction in the same file and has its own commit.

I saw no other runtime or contract-layer bycatch in the driven scope.

## Instrument feedback

CONFUSING. Graph path discovery and settled value queries were clear, and missing paths gave useful errors. However, `DriveSession.showScreen(rows)` under attach mode printed only `drive: show screen`; it did not emit the requested rows. Please make that call print the selected rows in attach output, or state where the screen dump is delivered.

## Commits

- `b7ae2e25` — `Make dock reclaim wait read the real pane edge`

- `922a21bc` — `Keep Quick Open focus from indenting the scrollbar fixture`

- `41750906` — `Declare restored scrollbar drive coverage`

The worktree is clean except for the pre-existing untracked [builder fundamentals handoff](/home/parallels/dev/invar/.invar/worktrees/461-scrollbar-deep-wheel-drive-fails-under-load/BUILDER-FUNDAMENTALS.md). I did not modify or stage that file.
