# READY — #187 (wheel-at-clamp wait)

## Result

The wheel-at-clamp blocker is repaired and committed on `fleet/187-clamp`.
The implementation makes the claimed scroll coordinate the wait condition, so
an already-satisfied clamp is a successful no-op rather than a request for a
frame that cannot exist.

- Commit:
  `5936f81a4ed8f8996370558ec9d871cec7f4cc9b`
  (`fix(harness): make clamped wheel waits position-aware`)
- Parent / task starting tree:
  `5ad9bdc0c718cb6f0daed8d93205add7ec61ba4f`
- Worktree: clean.
- No push, merge, tag, branch deletion, or worktree deletion was performed.
- Full merge gate: exit `0`, `merge-gate: ALL-PASS`.

The shared generator is
`HarnessSmoke.Class.awaitScrollPosition(...)`. It polls one exact published
scroll coordinate and returns immediately when that coordinate is already the
target. This is the common behavior shared by the editor smoke and Drive.
Wheel emission remains at each consumer because their input sequences and
terminal claims differ.

The app status projection now publishes authoritative derived maximum
coordinates:

- `editorMaximumScrollTop`
- `editorMaximumScrollLeft`

Drive uses current plus maximum coordinates to recognize all four directional
clamps. At a clamp it still sends the real wheel input, but it awaits the
already-satisfied exact coordinate without requiring a repaint. Away from a
clamp it retains its existing observed-screen-change path. The projection is
read-only and introduces no second scroll owner.

The editor smoke still sends all six rightward and all eight leftward
Option-wheel SGR events. It then awaits `editorScrollLeft === 0` and explicitly
repeats the already-satisfied wait to prove the no-op behavior.

## Reproduction and driven evidence

All driving used the real PTY path and default settings first.

Before the repair:

- Small scale, 10-line shared fixture, 100 `x` inputs and 40 right wheels:
  reached `editorScrollLeft=62`; the next clamped wheel failed with
  `Timed out waiting for grid condition: the driven input produces an observed
  screen or native caret change`. Exit `1`.
  Log: `/tmp/187-drive-small-clamp-before.log`.
- Large scale, 100,000-line shared fixture, 100 `x` inputs and 50 right
  wheels: reached `editorScrollLeft=70`; the next clamped wheel failed with the
  same timeout. Exit `1`.
  Log: `/tmp/187-drive-large-clamp-before.log`.
- The supplied editor-smoke failures ended at the README line head, matching
  the zero-clamp diagnosis:
  `/tmp/merge-gate-failures.400064/`.

After the repair:

- Small scale completed all 140 actions with
  `editorScrollLeft=editorMaximumScrollLeft=62`. Exit `0`.
  Log: `/tmp/187-drive-small-clamp-after.log`.
- Large scale completed all 150 actions with
  `editorScrollLeft=editorMaximumScrollLeft=70`. Exit `0`.
  Log: `/tmp/187-drive-large-clamp-after.log`.
- Vertical clamp parity also passed:
  - 10 lines: repeated up at top and down at the zero-height bottom clamp,
    exit `0`;
  - 100,000 lines: repeated up at top, then repeated down at
    `editorScrollTop=editorMaximumScrollTop=99985`, exit `0`.
  Logs: `/tmp/187-drive-vertical-10-after.log` and
  `/tmp/187-drive-vertical-100000-after.log`.
- The repaired editor smoke completed `smoke-editor-harness: ALL-PASS`.
  Exit `0`.

## Wheel caller enumeration

The census used the repository's structural-search route: the AST query tool
for `sendMouse` identifiers, a TypeScript AST walk over every
`kind: 'wheel'` object, and a raw SGR-wheel literal check. The sole dynamic
`sendMouse` argument is the generic parameter inside `PtyTestDriver`, so the
object-literal census covers the concrete callers.

| Caller | Clamp exposure | Wait claim |
|---|---|---|
| `Drive.ts` | Can over-scroll all editor directions | Exact position at a clamp; repaint away from it |
| `smoke-editor-harness.ts` | Eight-event left burst over-scrolls zero | Exact published position |
| `measure-completion-list-latency.ts` | One event in a 5,000-item popup, starts away from clamp | Visible-content repaint |
| `measure-scroll-smoothness.ts` | Repeated input can reach document clamps | Published position/rest and event/frame counts |
| `smoke-agent-pane-ux-harness.ts` | Four up events from a populated transcript bottom | Changed content region |
| `smoke-bounded-list-popup-harness.ts` | Can reach the tail | Tail precheck, then tail marker or viewport repaint |
| `smoke-clipboard-frame-boundary-harness.ts` | Repeated transcript wheels can reach anchors | Published semantic/position predicates |
| `smoke-completion-harness.ts` | One down event from the interior | `firstVisible` position advances |
| `smoke-horizontal-extent-harness.ts` | Horizontal burst can over-scroll | Published position/rest; vertical route uses target content |
| `smoke-overlay-dialog-harness.ts` | One event from top of a scrollable dialog | Changed content region |
| `smoke-scrollbars-harness.ts` | Intentionally drives to and across clamps | Target precheck or published position/rest; one deep-line route waits for target repaint |
| `smoke-selection-harness.ts` | Single list wheels; current fixtures start off clamp | Selected-item repaint predicate, already true before input; latent vacuous-wait finding below |
| `smoke-settings-applied-harness.ts` | Bursts may approach clamps | Published position/progress/rest plus changed-region liveness |
| `smoke-terminal-harness.ts` | Bursts/reversals may reach scrollback clamps | Published terminal position/frame, or actual child PTY bytes |
| `smoke-tree-scroll-harness.ts` | 80-event burst intentionally over-scrolls tail | Final tail marker, false at baseline; no per-event frame wait |

`smoke-search-mouse-harness.ts`, called out in the task, contains zero wheel
callers now.

The removed primitive censuses remain zero under `scripts/harness`:

- `awaitNextCompletedFrame`: `0` identifiers.
- `awaitQuiescence`: `0` identifiers.

## Positive controls

Every plant was restored before commit verification.

### Shared exact-position generator

I inverted the generator's coordinate equality.

- Red: `bun test scripts/harness/HarnessSmoke.test.ts`, exit `1`:
  `Expected promise that resolves / Received promise that rejected` at the
  satisfied-clamp test. Two passed, one failed.
  Log: `/tmp/187-helper-positive-control-red.log`.
- Green after restore: exit `0`; three passed, zero failed, four expectations.
  The zero-timeout satisfied target resolves while a zero-timeout unsatisfied
  target rejects.
  Log: `/tmp/187-helper-positive-control-green.log`.

### Drive clamp routing

I made the directional-clamp comparison require
`currentPosition === targetPosition + 1`.

- Red: small-scale right-clamp drive, exit `1`, reproduced the original
  `Timed out waiting for grid condition: the driven input produces an observed
  screen or native caret change`.
  Log: `/tmp/187-drive-positive-control-red.log`.
- Green after restore: all 140 actions completed at
  `editorScrollLeft=editorMaximumScrollLeft=62`, exit `0`.
  Log: `/tmp/187-drive-positive-control-green.log`.

### Editor-smoke wiring

I changed the smoke's attainable zero target to the impossible coordinate
`-1`.

- Red: exit `1` with
  `Timed out waiting for leftward Option-wheel reaches the zero horizontal
  scroll clamp at .../status.json`.
  Log: `/tmp/187-editor-smoke-positive-control-red.log`.
- Green after restoring target `0`: exit `0`,
  `smoke-editor-harness: ALL-PASS`, including
  `an already-satisfied horizontal clamp completes without a repaint`.
  Log: `/tmp/187-editor-smoke-positive-control-green.log`.

## Verification

| Command | Result |
|---|---|
| `bunx tsc --noEmit` | exit `0` |
| `bun test` | exit `0`; 1,697 pass, 0 fail, 67,611 expectations, 258 files |
| `bash scripts/conventions-gate.sh` | exit `0`; 488 files, 0 grammar violations |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` | exit `0`; 928 annotations, 67 lattice links, 0 problems |
| `bun scripts/check-coverage-ratchet.ts` | exit `0`; 319 files inspected, no undeclared decrease |
| `bash scripts/behavioral-contracts.sh` | exit `0`; `ALL-PASS` |
| `bun run drive` | exit `0`; ready and render-quiescent |
| `bun run drive --size 100000` | exit `0`; ready and render-quiescent, maximum top 99,985 |
| `bash scripts/merge-gate.sh` | exit `0`; `merge-gate: ALL-PASS`, 4m15s |
| `git diff --check` | exit `0` |

Behavioral-contract log:
`/tmp/187-behavioral-contracts.log`.
Full gate log:
`/tmp/187-merge-gate.log`.

The gate exercised every registered harness consumer. Its input-byte timing
step passed with p50 `3.864 ms` and p95 `7.628 ms`.

No standalone timing run was needed. The current behavioral and merge-gate
contracts were run directly as blocking gates. The quiet-lock journal contains
no `degraded` entry from this task's run; the only matching entries are older
editor-edit-path measurements.

The relevant harness invariant was updated in
[scripts/harness/harness.invariants.md](../../../../scripts/harness/harness.invariants.md). The change preserves the rules that
waits observe named conditions, async state is awaited, shared behavior has one
generator, and rendering remains a coarse frame effect.

## Bycatch

### Scrollbar deep-widest-line retry

NOT FIXED.

- Exact reproduction: during the full merge gate,
  `smoke-scrollbars-harness` passed the full-document right-extent check, then
  timed out waiting for
  `the deep widest line is visible during the wheel drive`. The final grid
  showed lines 382–400 with line 400 visible but the horizontal marker absent.
- Repetition count: one of two gate attempts. The automatic retry passed.
- Log:
  `/tmp/merge-gate-failures.452143/smoke-scrollbars-harness-.attempt1.log`.
- Merge-base verification: **No**, it was not separately driven at the merge
  base. Provenance against task-start commit
  `5ad9bdc0c718cb6f0daed8d93205add7ec61ba4f` shows no diff in
  `smoke-scrollbars-harness.ts` or `PtyTestDriver.ts`; the shared helper change
  is additive and the scrollbar smoke does not call it.

### Selection smoke has pre-satisfied wheel predicates

NOT FIXED.

- Exact structural reproduction: after `directory-15` is selected, the smoke
  sends one down wheel and waits only for `directory-15` to retain the same
  background, a predicate established before the wheel. It repeats the same
  pattern for selected `commit-14`. Thus those waits can complete without
  observing the wheel's claimed viewport movement.
- Repetition count: two sites in one structural census. The full gate's one
  selection-smoke run passed, but that green does not prove either wheel.
- Merge-base verification: **No**, it was not separately driven at the merge
  base. `smoke-selection-harness.ts` and `PtyTestDriver.ts` have no diff
  between task-start commit `5ad9bdc0c718cb6f0daed8d93205add7ec61ba4f`
  and this commit.

The specifically watched bycatch did not reproduce:

- `reserved chord` (#194): passed in the full gate.
- 995-row 100k fold-dense contract (#193): passed.
- markdown ragged preview row (#174): not observed.

No other visual bycatch was observed.

## Handoff

The requested repair is committed, the complete verification set is green,
the original event counts are preserved, the two forbidden primitive censuses
remain zero, and the worktree is clean and ready for conductor review.
