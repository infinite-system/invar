# READY — gate smoke intermittents: scrollbars thumb and tasks watch motion

State: READY

Commit: `d0c8deae95c6ea55028695872321b86d18402877`

## Result

Both reds were instrument defects. I found no product paint defect and no
child-process starvation.

The scrollbar failure did not contain a frame without a thumb. The preserved
[scrollbar failure log](smoke-scrollbars-harness-.log) shows the thumb in the
failing completed frame. Column 118 has track background `16161e` on rows
6–23 and thumb background `787c99` on rows 24–25.

That frame was a live wheel-produced frame, not a settled frame. The contract
intentionally observes every completed scroll frame after a settled baseline.
The rediscovery helper returned `null` even though its screen oracle contained
the thumb.

The repaired arm discovers the bar once after the settled wait. It then checks
that exact column, track, and thumb background in every driven frame. It no
longer reclassifies the subject from changing editor content.

The tasks-watch wait depended on the repository's live task population. Its
predicate required two distinct rows containing `building` or `exploring`.
The preserved quiet retry had no live builders, so no such row could exist.
The watcher correctly stops its motion timer when it has no animated row.

The terminal child reached the initial tasks-watch frame in both preserved
failures. The later predicate was unreachable, rather than starved. The smoke
now gives the real CLI process a private task tree with one non-READY row.
`INVAR_TASKS_ROOT` selects that tree without changing the normal CLI default.

## Changed files

- [smoke-scrollbars-harness.ts](../../../../scripts/harness/smoke-scrollbars-harness.ts)
  now checks the known bar geometry during the scroll drive.
- [smoke-terminal-harness.ts](../../../../scripts/harness/smoke-terminal-harness.ts)
  creates a private task ledger with one guaranteed motion row.
- [tasks-status.ts](../../../../scripts/tasks/tasks-status.ts) accepts an
  optional task-root environment override for isolated real-process drives.

No product source or invariant record changed.

## Drive evidence

Before the fix, the solo scrollbar smoke passed with 68 wrap-off frames and
69 wrap-on frames. The solo terminal smoke passed with four outer tasks-watch
frames. These greens were baseline data, not clearance of the preserved reds.

A deliberate seven-process pool ran both targets beside five other harness
smokes. Every process exited 0. Scrollbars observed 67 wrap-off frames and 69
wrap-on frames. Tasks-watch observed four safe outer frames.

After the fix, the focused scrollbar drive exercised 500 and 100,000 lines.
It then observed 68 wrap-off frames and 69 wrap-on frames. Every editor thumb
had extent 2.

The focused terminal drive used the isolated ledger. It observed four outer
frames and more than one motion fingerprint without a ledger stamp change.

## Positive controls

I changed the known thumb background by one. The scrollbar smoke exited 1
with `FAIL wrap-off vertical thumb remains present in every scroll frame`.
I removed the plant.

I replaced the motion timer schedule with a stop. The terminal smoke exited 1
at `real tasks:watch advances a live motion row without a ledger change`.
I removed the plant.

## Final verification

- `bun scripts/harness/smoke-scrollbars-harness.ts` — exit 0. It observed
  68 wrap-off, 69 wrap-on, and 73 diff frames with extent 2.
- `bun scripts/harness/smoke-terminal-harness.ts` — exit 0. It observed four
  safe tasks-watch outer frames.
- `bunx tsc --noEmit` — `TSC=0`.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`
  — exit 0, 1,210 annotations resolved, 223 lattice links resolved, 0 problems.

The mandatory commit hook also ran its 65-job pool with six workers. Both
target smokes passed on their first pool attempt. The full hook ended
`merge-gate: ALL-PASS`.

The worktree is clean at commit
`d0c8deae95c6ea55028695872321b86d18402877`.

## Invariant review

| Record | Verdict | Evidence |
|---|---|---|
| [One generator owns each scroll position](../../../../src/modules/ui/scroll.invariants.md#one-generator-owns-each-scroll-position) | upheld | Product scroll ownership did not change. Small and large drives retained continuous movement and fixed thumb extent. |
| [Harness waits observe conditions not frame ordinals](../../../../scripts/harness/harness.invariants.md#harness-waits-observe-conditions-not-frame-ordinals) | violated before, upheld now | The old tasks-watch setup did not make its named motion condition reachable. The private ledger now guarantees one animated row. |
| [The terminal emulator is the harness screen oracle](../../../../scripts/harness/harness.invariants.md#the-terminal-emulator-is-the-harness-screen-oracle) | upheld | The preserved cell grid showed the thumb. The repair trusts those exact cells at the already-proven geometry. |
| [Harness input and output use the real PTY](../../../../scripts/harness/harness.invariants.md#harness-input-and-output-use-the-real-pty) | upheld | The terminal arm still launches the real CLI inside the nested shell. |
| [Synchronized end markers bound complete frames](../../../../scripts/harness/harness.invariants.md#synchronized-end-markers-bound-complete-frames) | upheld | Both arms judged immutable snapshots from completed DEC 2026 frames. |
| [Task truth lives in the folders the CLI reads](../../../../src/modules/tasks-dashboard/tasks-dashboard.invariants.md#task-truth-lives-in-the-folders-the-cli-reads) | upheld and missed by the brief | The old smoke read mutable repository task truth. The isolated task root makes the required state explicit. |
| [Dashboard motion exists only while observed](../../../../src/modules/tasks-dashboard/tasks-dashboard.invariants.md#dashboard-motion-exists-only-while-observed) | upheld and missed by the brief | No live row means no motion timer. The old smoke assumed the opposite. |

The dashboard motion record does not govern the CLI watch clock. The known
[tasks-watch clock invariant record task #330](../../active/330-tasks-watch-clock-invariant-record/task-330-tasks-watch-clock-invariant-record.md)
still tracks that contract-layer gap. I did not author that record here.

## Bycatch

- The mandatory hook's first behavioral-contracts attempt timed out at
  [smoke-plugin-manifest-harness.ts](../../../../scripts/harness/smoke-plugin-manifest-harness.ts)
  on `the structure scrollbar publishes its settled dock-height geometry`.
  The final 150×40 grid visibly showed the structure thumb. The hook's quiet
  retry passed, so this did not reproduce a second time. I did not change it.
- The CLI watcher clock still has no local invariant record. The existing
  [tasks-watch clock invariant record task #330](../../active/330-tasks-watch-clock-invariant-record/task-330-tasks-watch-clock-invariant-record.md)
  already names this gap.
