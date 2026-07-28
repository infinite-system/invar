# Wave 3 smoke-port readiness

Tip SHA: `f3900849fd729007244f9a60f3db25da2c3088b3`

## Harness ports

| Smoke | Consecutive solo result |
| --- | --- |
| agent | 5/5 ALL-PASS |
| agent-pane-ux | 5/5 ALL-PASS |
| agent-engine-switch | 5/5 ALL-PASS |
| agent-permissions | 5/5 ALL-PASS |
| agent-search | 5/5 ALL-PASS |
| audio-narration | 5/5 ALL-PASS |
| voice-picker | 5/5 ALL-PASS |
| diagnostics | 5/5 ALL-PASS |
| goto-definition | 5/5 ALL-PASS |
| hover | 5/5 ALL-PASS |

## Independent tmux originals

Each untouched original ran once and reported ALL-PASS:

- agent
- agent-pane-ux
- agent-engine-switch
- agent-permissions
- agent-search
- audio-narration
- voice-picker
- diagnostics
- goto-definition
- hover

## Skips

None. Both diagnostics providers and the typescript-language-server definition/hover cases ran.

## Repository verification

- `bunx tsc --noEmit`: PASS
- `bun test`: PASS — 819 tests, 0 failures
- `scripts/conventions-gate.sh`: PASS
- invariant checker `--all`: 0 problems
- invariant checker `--refs`: 0 problems
- merge gate: not run, as required by TASK.md

## Files changed

- `scripts/harness/smoke-agent-harness.ts`
- `scripts/harness/smoke-agent-pane-ux-harness.ts`
- `scripts/harness/smoke-agent-engine-switch-harness.ts`
- `scripts/harness/smoke-agent-permissions-harness.ts`
- `scripts/harness/smoke-agent-search-harness.ts`
- `scripts/harness/smoke-audio-narration-harness.ts`
- `scripts/harness/smoke-voice-picker-harness.ts`
- `scripts/harness/smoke-diagnostics-harness.ts`
- `scripts/harness/smoke-goto-definition-harness.ts`
- `scripts/harness/smoke-hover-harness.ts`
- `scripts/merge-gate.sh`

## Task 2 — Frame-ordinal wait defect

New tip SHA: `32a843d02db97629922f021c8270f16802ec4838`

### Root cause

The shared driver treated a completed-frame ordinal as the state contract. Repaint coalescing can
legally merge invalidations, and an already-rendered target can emit no new frame, so
`minimumCompletedFrameCount` could advance beyond the last frame the application needed to paint.
The goto-definition F12 wait then timed out on frame 7 even though frame 6 was the final valid
render.

The replacement is condition/event based. `awaitGridCondition` checks the current emulator grid
first and then checks after each future synchronized-frame completion; `awaitQuiescence` waits for
a completion event associated with pending input. Status-file conditions are polled independently
because status publication and frame completion are separate authorities.

### Files converted in this worktree

- `scripts/harness/PtyTestDriver.ts`
- `scripts/harness/PtyTestDriver.test.ts`
- `scripts/harness/SynchronizedOutputQuiescence.ts`
- `scripts/harness/SynchronizedOutputQuiescence.test.ts`
- `scripts/harness/HarnessSmoke.ts`
- `scripts/harness/HarnessSmokeSupport.ts`
- `scripts/harness/smoke-goto-definition-harness.ts`
- `scripts/harness/harness.invariants.md`

All 35 ports present on this branch and all 7 wave-4-only ports were audited. No port contains a
local frame-ordinal wait; the defect was centralized in the shared driver/quiescence seam.

### Wave 4 findings — report only

The seven files introduced at wave-4 tip `ac8dbaa` contain no frame-ordinal waits:

- `scripts/harness/smoke-image-preview-harness.ts`
- `scripts/harness/smoke-markdown-harness.ts`
- `scripts/harness/smoke-pixel-preview-harness.ts`
- `scripts/harness/smoke-search-mouse-harness.ts`
- `scripts/harness/smoke-settings-applied-harness.ts`
- `scripts/harness/smoke-shortcut-help-harness.ts`
- `scripts/harness/smoke-terminal-harness.ts`

The wave-4 worktree still inherits the old shared ordinal implementation and must receive this
commit during rebase:

- `scripts/harness/PtyTestDriver.ts` — `minimumCompletedFrameCount`, target-count waits, and
  per-input `expectNextFrame`
- `scripts/harness/SynchronizedOutputQuiescence.ts` — `awaitCompletedFrame(targetFrameCount)`
- `scripts/harness/SynchronizedOutputQuiescence.test.ts` — recorded-stream waits expressed as
  target frame ordinals

No files under `/tmp/wt-port4` were modified.

### Run table

| Verification | Result |
| --- | --- |
| `bunx tsc --noEmit` | PASS |
| `bun test` | PASS — 823 tests, 0 failures |
| waiter recorded-stream tests | PASS — 12 tests, 0 failures |
| `smoke-goto-definition-harness.ts` | 10/10 ALL-PASS |
| `smoke-diagnostics-harness.ts` | 5/5 ALL-PASS |
| `smoke-hover-harness.ts` | 5/5 ALL-PASS |
| invariant checker `--all` | PASS — 0 problems |
| invariant checker `--refs` | PASS — 0 problems |
| `scripts/conventions-gate.sh` | PASS |
| `git diff --check` | PASS |
| merge gate | Not run, as required by TASK2.md |

## Task 3 — Shared waiter consumer repair

New tip SHA: `ef75dedd7617872d410d074ce1da7c2d3476f033`

### Per-failure diagnosis

| Previously failing port | Classification | Diagnosis and repair |
| --- | --- | --- |
| workspace-tabs | consumer assumed old accident | Status-backed `awaitSnapshot` calls treated status publication as proof that the reoriented strip had painted. The smoke now waits on the actual top/left grid geometry and settled detail colors, while workspace-cycle status is polled independently. |
| paste | driver wrong | Synchronous `PtyTestDriver.dispose()` returned after signaling the child but before child exit, so fixture removal raced the live process and intermittently raised `EFAULT`. Disposal is now an idempotent promise that resolves only after child exit; every driver consumer awaits it. |
| git-blame | consumer assumed old accident | The blame status field could publish before the status-bar frame. The smoke now polls semantic blame status and separately waits for `Blame Tester` in the status-bar grid. |
| quickopen | consumer assumed old accident | `activeBuffer` could publish before the opened document painted. The smoke now separately waits for the opened file content in the grid. |
| navigation-history | consumer assumed old accident | Status-only waits were used to sequence Escape, tree movement, history navigation, and breadcrumb clicks before the corresponding frames/focus transitions settled. The smoke now waits for file content after opens/history moves and for `focus === files` after Escape. |
| open-project | consumer assumed old accident | The old waiter delayed an ambiguous already-satisfied `proj` grid predicate, and status was read immediately after visual transitions. The smoke now polls selection indices 0/20/40 independently and waits for each matching selected row in the grid. |
| agent-pane-ux | consumer assumed old accident | `agentBusy === false` and tail-anchor status could publish before the waiting note disappeared or the newest transcript row repainted. Both visual outcomes now have named grid conditions. |

The same full-consumer sweep exposed three wave-3 ports with the identical consumer assumption
(`agent-permissions`, `agent-search`, and `voice-picker`) plus an editor mouse-release path that
expected a zero-change release event to repaint. Those consumers were repaired at their actual
semantic/grid boundaries as well.

### Files changed

- `scripts/harness/PtyTestDriver.ts`
- `scripts/harness/PtyTestDriver.test.ts`
- `scripts/harness/harness.invariants.md`
- `scripts/merge-gate.sh`
- Behavior-specific consumer repairs:
  `smoke-workspace-tabs-harness.ts`, `smoke-git-blame-harness.ts`,
  `smoke-quickopen-harness.ts`, `smoke-navigation-history-harness.ts`,
  `smoke-openproject-harness.ts`, `smoke-agent-pane-ux-harness.ts`,
  `smoke-agent-permissions-harness.ts`, `smoke-agent-search-harness.ts`,
  `smoke-voice-picker-harness.ts`, `smoke-editor-harness.ts`, and
  `smoke-paste-harness.ts`
- Mechanical lifecycle update: every registered `scripts/harness/smoke-*-harness.ts` consumer and
  `scripts/harness/measure-input-byte-flush.ts` now awaits `PtyTestDriver.dispose()`.

### Full harness-suite run table

| Harness port | Full suite | Required consecutive run |
| --- | --- | --- |
| editor | 1/1 PASS | — |
| move-line | 1/1 PASS | — |
| indent-guides | 1/1 PASS | — |
| bracket-match | 1/1 PASS | — |
| tabs | 1/1 PASS | — |
| workspace-tabs | 1/1 PASS | 5/5 PASS |
| selection | 1/1 PASS | — |
| scrollbars | 1/1 PASS | — |
| wrap | 1/1 PASS | — |
| comment-styling | 1/1 PASS | — |
| find | 1/1 PASS | — |
| mode-coherence | 1/1 PASS | — |
| word-delete | 1/1 PASS | — |
| paste | 1/1 PASS | 5/5 PASS |
| git-blame | 1/1 PASS | 5/5 PASS |
| git-log | 1/1 PASS | — |
| git-watch | 1/1 PASS | — |
| gutter-diff | 1/1 PASS | — |
| diff-overview | 1/1 PASS | — |
| tree-scroll | 1/1 PASS | — |
| quickopen | 1/1 PASS | 5/5 PASS |
| navigation-history | 1/1 PASS | 5/5 PASS |
| openproject | 1/1 PASS | 5/5 PASS |
| activitybar | 1/1 PASS | — |
| panel-split | 1/1 PASS | — |
| agent | 1/1 PASS | — |
| agent-pane-ux | 1/1 PASS | 5/5 PASS |
| agent-engine-switch | 1/1 PASS | — |
| agent-permissions | 1/1 PASS | — |
| agent-search | 1/1 PASS | — |
| audio-narration | 1/1 PASS | — |
| voice-picker | 1/1 PASS | — |
| diagnostics | 1/1 PASS | — |
| goto-definition | 1/1 PASS | 5/5 PASS |
| hover | 1/1 PASS | — |

Result: all 35 registered harness ports passed once; all eight required targets passed 5/5
consecutive runs.

### Repository verification

| Verification | Result |
| --- | --- |
| `bunx tsc --noEmit` | PASS |
| `bun test` | PASS — 824 tests, 0 failures |
| waiter/disposal recorded-stream tests | PASS — 13 tests, 0 failures |
| invariant checker `--all` | PASS — 0 problems |
| invariant checker `--refs` | PASS — 511 annotations resolved, 0 problems |
| `scripts/conventions-gate.sh` | PASS |
| `git diff --check` | PASS |
| merge gate | Not run, as required by TASK3.md |

`harness.invariants.md` now records that a shared harness seam change must verify every registered
consumer, with `scripts/merge-gate.sh` as the authoritative registry.
