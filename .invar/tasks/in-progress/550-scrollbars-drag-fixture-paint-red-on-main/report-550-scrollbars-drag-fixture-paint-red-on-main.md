## In plain words

The smoke pressed Enter before Quick Open had found the fixture, so the editor stayed on “no open files” and the later paint wait timed out. I made both fixture opens wait for the exact file result and active buffer. The complete scrollbar smoke now passes five times alone and twice with another copy running beside it.

## Result

READY for #550 (repair the deterministic scrollbar drag-fixture smoke).

Commit: `99701dfb5a058288fa3cbca8af9412ebf87b5a11`

The change is in [smoke-scrollbars-harness.ts](../../../../scripts/harness/smoke-scrollbars-harness.ts). Both the TypeScript fixture and Markdown fixture now use the existing `HarnessSmoke.Class.openFileThroughQuickOpen` seam in [HarnessSmoke.ts](../../../../scripts/harness/HarnessSmoke.ts). That seam waits for the exact query, at least one result, the exact active buffer, and editor focus before the next gesture.

This is a smoke repair. Product painting and scrollbar geometry did not change.

## Cause and history

The pre-fix drive reproduced the filed failure after the first six passes. Its final 120 by 40 grid showed both fixture names in Files, `no open files` in the editor, and no `symbol000000`. The file existed. Enter had reached Quick Open before its selected result was ready.

The failing local sequence was:

1. Type `scrollbar-drag-scale.ts` in Quick Open.
2. Wait for any screen change.
3. Press Enter.
4. Wait for `symbol000000`.

The screen-change wait could observe an unrelated completed frame. It did not prove that Quick Open had ranked the requested file.

`git blame` traced that condition to `23c76d2be7c73db95891dc9488794991a35dc97c`, which introduced the drag smoke. Commit `560a168c54c6c6561ae1d0d366e23050e49f79c8` later added two scrollbar-reservation app drives before it. Those drives increased the scheduling pressure that exposed the old condition.

I also ran the unchanged smoke through `git bisect run` from good `c07df3a4a25760725965dc9b8f135d3fa829ccf0` to bad `2ac71f0428c511712bfd24025fa12a9afbf838fe`. A one-run bisect named merge `c0a3a354c5b0a094e90635856e245806c41830ec`, but both parents passed and that merge added no runtime code over its first parent. I rejected that as a product culprit. It is evidence that a frame race makes one-run commit classification unstable. The load-bearing cause is the `awaitScreenChange()` predicate from `23c76d2b`, not a scrollbar paint regression.

## Visual evidence

Before the fix, the final frame showed `no open files`; the fixture never reached the editor.

After the fix, the real PTY drive painted and exercised all of these at both 500 and 100,000 lines:

- TypeScript editor content and structure rows.
- Editor horizontal and vertical bars.
- Right-dock vertical bar.
- Markdown preview horizontal and vertical bars.
- Dark, light, then dark live theme colours.
- Three increasing positions after each pressed-pointer move on every thumb.

The 10-line and 100,000-line reservation drives also kept the last visible line above the horizontal bar. There is no product-visible change.

## Positive control

I temporarily requested `scrollbar-drag-scale-missing.ts` with a one-second diagnostic timeout. The corrected path exited `1` at `Quick Open to rank the requested file` and painted `(no matching files)`. It failed before Enter and before the downstream editor-paint assertion. I removed the plant, then ran the final verification.

## Verification

- `bun scripts/harness/smoke-scrollbars-harness.ts`: five solo runs passed. Durations were 26, 26, 26, 24, and 26 seconds.
- Two concurrent full copies of `bun scripts/harness/smoke-scrollbars-harness.ts`: both exited `0` with `smoke-scrollbars-harness: ALL-PASS`.
- `bunx tsc --noEmit`: exit `0`.
- `bun test`: 2,522 passed, 0 failed, across 389 files.
- `bash scripts/conventions-gate.sh`: PASS.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: 1,442 annotations and 287 lattice links resolved, 0 problems.

The adversarial drive covered small and large scales, TypeScript then Markdown open order, dark-light-dark theme interleaving, three pressed-pointer moves per thumb, every editor/dock/preview axis, focus ownership after the drag set, and a missing-file break attempt. The existing smoke checks state after every pressed-pointer move.

## Invariant verdicts

- **Strengthened — Harness waits observe conditions not frame ordinals.** The two open paths now wait for the requested query, match, active buffer, and focus through the shared helper. They no longer accept an arbitrary frame. See [harness.invariants.md](../../../../scripts/harness/harness.invariants.md).
- **Upheld — Harness input and output use the real PTY.** The helper sends the same Control+P, text, Enter, and Tab bytes through `PtyTestDriver`. It adds no model shortcut.
- **Upheld — The terminal emulator is the harness screen oracle.** Paint, colour, row, and thumb assertions remain on immutable terminal cells.
- **Upheld — One generator owns each scroll position.** No production scroll owner changed. The driven editor, dock, and preview thumb positions increased after every pressed-pointer move at 500 and 100,000 lines. See [scroll.invariants.md](../../../../src/modules/ui/scroll.invariants.md).
- **Upheld — A scrollbar track is derived per frame from its region rect.** Both axes, the vertical-owned corner, live theme colours, lower-half horizontal paint, and small/large geometry all passed. See [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md).
- **Untouched — remaining scroll records.** Wheel impulse preservation, document-length-independent frame cost, live-motion continuation, ceiling accumulation, bounded glide tails, and mechanism-derived driven quantities did not change.

## Coherence

The change removes two local Quick Open protocols and uses the one shared open-file generator. The smoke now states what must be ready instead of repeating weaker timing logic.

## Bycatch

- **Contract-layer gap:** [UI design chapter 5](../../../../.claude/skills/ui-design/SKILL.md) says a scrollbar reserves its own row or column so it never hides content. [A scrollbar track is derived per frame from its region rect](../../../../src/modules/ui/ui.invariants.md#a-scrollbar-track-is-derived-per-frame-from-its-region-rect) governs placement, paint, and pointer geometry, but it does not record the no-hide or reserved-row guarantee. The [task brief](brief-550-1-scrollbars-drag-fixture-paint-red-on-main.md) calls this guarantee recorded. I rechecked the contract by text search. I did not alter the contract because the repository requires contract-layer gaps to be reported outside the task.
- No additional runtime bycatch appeared in the repeated solo or concurrent drives.

## Worktree state

The task commit contains only [smoke-scrollbars-harness.ts](../../../../scripts/harness/smoke-scrollbars-harness.ts). The dispatch-injected [AGENTS.md](../../../../AGENTS.md) modification and untracked builder-fundamentals priming file remain untouched and uncommitted.
