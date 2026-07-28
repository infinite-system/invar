# Wave 4 PTY smoke port — READY

Tip: `ac8dbaaa6e7f3e13c7e57e6e63cee29ffd17e246`

## Per-smoke verification

| Smoke | PTY harness solo runs | Original tmux smoke |
| --- | --- | --- |
| terminal | 5/5 PASS | ALL-PASS |
| image-preview | 5/5 PASS | ALL-PASS |
| pixel-preview | 5/5 PASS | ALL-PASS |
| markdown | 5/5 PASS | ALL-PASS |
| settings-applied | 5/5 PASS | ALL-PASS |
| shortcut-help | 5/5 PASS | ALL-PASS |
| search-mouse | 5/5 PASS | ALL-PASS |

## Additional verification

- `bun test`: PASS — 819 tests, 0 failures
- `bunx tsc --noEmit`: PASS
- `scripts/conventions-gate.sh`: PASS
- `scripts/merge-gate.sh` shell syntax: PASS
- invariant checker `--all`: PASS
- invariant checker `--refs`: PASS — 0 problems

## Skips and reasons

- Full `scripts/merge-gate.sh`: skipped because TASK.md explicitly prohibits running it.
- Pre-commit merge gate: skipped with the TASK.md-required `SKIP_GATE=1`; all requested constituent checks and smoke runs were executed directly.
- Test cases: none skipped.

## Files changed

- `scripts/harness/smoke-terminal-harness.ts`
- `scripts/harness/smoke-image-preview-harness.ts`
- `scripts/harness/smoke-pixel-preview-harness.ts`
- `scripts/harness/smoke-markdown-harness.ts`
- `scripts/harness/smoke-settings-applied-harness.ts`
- `scripts/harness/smoke-shortcut-help-harness.ts`
- `scripts/harness/smoke-search-mouse-harness.ts`
- `scripts/merge-gate.sh`

The original tmux smoke scripts were not modified. The supplied untracked `TASK.md` was not included in the commit.

## Task 2

Tip: `d2264d6dc94b6fa3f74a9142c040fe8f1bfc9a14`

### Per-port diagnosis

- `smoke-markdown-harness.ts`: semantic status publication was treated as proof that the editor and Markdown preview controls had painted. The consumer now waits for named grid conditions before reading or clicking those cells, and it awaits driver disposal.
- `smoke-settings-applied-harness.ts`: seven `PtyTestDriver.dispose()` promises were ignored, allowing fixture and HOME cleanup to race child exit, PTY closure, and emulator disposal. Every teardown is now awaited.
- `smoke-shortcut-help-harness.ts`: the transition waiter searched only for `Go to File`, text already visible in the shortcut sheet. The repaired waiter's correct already-satisfied fast path therefore returned the old overlay. The consumer now polls overlay status independently and waits for a compound grid condition proving Quick Open replaced the shortcut sheet; disposal is awaited.

No shared driver code changed, and reproduction exposed no driver defect.

### Files changed

- `scripts/harness/smoke-markdown-harness.ts`
- `scripts/harness/smoke-settings-applied-harness.ts`
- `scripts/harness/smoke-shortcut-help-harness.ts`

### Run table

| Verification | Result |
| --- | --- |
| terminal harness | 1/1 PASS |
| image-preview harness | 1/1 PASS |
| pixel-preview harness | 1/1 PASS |
| markdown harness | 1/1 PASS; focused 5/5 consecutive PASS |
| settings-applied harness | 1/1 PASS; focused 5/5 consecutive PASS |
| shortcut-help harness | 1/1 PASS; focused 5/5 consecutive PASS |
| search-mouse harness | 1/1 PASS on solo retry; the serial sweep first attempt hit its pre-existing status-before-paint race |
| `bunx tsc --noEmit` | PASS |
| `bun test` | PASS — 824 tests, 0 failures |
| invariant checker `--all` | PASS |
| invariant checker `--refs` | PASS — 0 problems |

The merge gate was not run, as required. The Task 2 commit used `SKIP_GATE=1`.

## Task 3

Tip: `545f63e9fa851da0334878d3ae2443eaa5e34f3e`

### Diagnosis

The defect reproduced on the first pre-fix run: the status channel reported an un-openable
workspace path with two matches, but the immediately sampled emulator grid had not yet painted the
warning color (`foreground=null`). The same consumer also treated status publication as proof that
the Find counter had painted, read navigator status without polling, and did not await driver
disposal. The driver and app delivered their independent status and frame signals correctly; the
race was confined to `smoke-search-mouse-harness.ts`.

### Fix

The consumer now polls semantic status independently, waits on named grid conditions for the Find
counter and warning-color outcomes, and awaits `PtyTestDriver.dispose()` before removing its
fixtures. No shared driver or app code changed.

### Search-mouse 10/10 table

| Consecutive run | Result |
| --- | --- |
| 1 | PASS |
| 2 | PASS |
| 3 | PASS |
| 4 | PASS |
| 5 | PASS |
| 6 | PASS |
| 7 | PASS |
| 8 | PASS |
| 9 | PASS |
| 10 | PASS |

### Additional verification

| Verification | Result |
| --- | --- |
| terminal harness | 1/1 PASS |
| image-preview harness | 1/1 PASS |
| pixel-preview harness | 1/1 PASS |
| markdown harness | 1/1 PASS |
| settings-applied harness | 1/1 PASS |
| shortcut-help harness | 1/1 PASS |
| `bunx tsc --noEmit` | PASS |
| invariant checker `--all` | PASS |
| invariant checker `--refs` | PASS — 532 annotations resolved, 0 problems |

The merge gate was not run, as required. The Task 3 commit used `SKIP_GATE=1`.
