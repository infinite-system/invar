# READY — gutter HEAD identity and switch latency

Date: 2026-07-24  
Branch: `fix-gutter-diff-stale-head`  
Tip: `deb170105642f9b65dfbc2b35e2e690cd914939c`  
Base after rebase: `origin/main` at `fdcf56daaa0efe7b104a4ea57a15ca629ddc38aa`

## Result

The stale cross-file HEAD projection is fixed. `Workspace` now records the document path to which
`activeHeadText` belongs and returns an empty gutter projection unless that identity exactly matches
the active document. Starting every refresh clears the identity immediately, including the
previously risky A → B → A case. Only the newest request for the still-active path may publish both
the HEAD text and its identity.

The implementation is commit:

`deb1701 fix(diff): gate gutter projection by active head identity`

Changed files:

- `src/modules/workspace/Workspace.ts`
- `src/modules/workspace/Workspace.gitRaces.test.ts`
- `scripts/harness/smoke-gutter-diff-harness.ts`

The change preserves these contracts:

- **The editor gutter reflects HEAD changes:** a marker is projected after the active document's
  HEAD refresh, never from a different document's HEAD text.
- **Async results are revision-stamped and stale results discarded:** the established request token
  and active-path check still guard publication; the document identity is published only inside
  that same newest-request guard.
- **Git completions can arrive out of order:** older completions cannot restore stale text or
  identity.

## Real tracked TypeScript switch latency

Boundary: `input-write → DEC-2026-end-marker-byte-arrival`  
Protocol: 5 fresh sessions × 20 switches = 100 samples, real tracked
`RootView.ts ↔ Bootstrap.ts`, one completed frame to the condition.

| Measurement | Before | Final after rebase | Change |
|---|---:|---:|---:|
| Aggregate p50 | 108.276 ms | 11.067 ms | **-89.8%** |
| Aggregate p95 | 155.524 ms | 23.514 ms | **-84.9%** |
| Open `RootView.ts` p50 | 108.081 ms | 11.447 ms | -89.4% |
| Open `RootView.ts` p95 | 149.383 ms | 25.666 ms | -82.8% |
| Open `Bootstrap.ts` p50 | 108.449 ms | 10.786 ms | -90.1% |
| Open `Bootstrap.ts` p95 | 258.777 ms | 13.780 ms | -94.7% |

The final result is in the requested ~11 ms class.

Quiet-machine observations:

| Run | Load average | Other fleet builder |
|---|---|---|
| Before | 0.57, 0.54, 1.03 | `/tmp/wt-inputfix` between bursts, about 0.9–1.1% CPU |
| First post-fix confirmation | 0.38, 0.71, 0.97 | between bursts, about 0.8% CPU |
| Final post-rebase | 0.42, 0.68, 0.86 | two idle Codex processes at 0.9% and 0.8% CPU |

No merge gate ran during any measurement.

## Frame-size report

| Measurement | Before | Final after rebase | Change |
|---|---:|---:|---:|
| Frame bytes p50 | 14,292 | 12,390 | -13.3% |
| Frame bytes p95 | 17,033 | 16,149 | -5.2% |
| SGR bytes p50 | 9,860 | 8,644 | -12.3% |
| SGR sequences p50 | 769 | 673 | -12.5% |
| Reset SGR p50 | 257 | 225 | -12.5% |
| Printable bytes p50 | 1,686 | 1,682 | -0.2% |
| Parsed cell changes p50 | 1,674 | 1,674 | unchanged |

Removing the stale diff work reduced absolute output as a consequence, but SGR remains about 69.8%
of the p50 frame. The residual SGR issue is not app-side.

## Marker-correctness proof

The race regression test drives first file → second file → first file and proves at each switch that:

1. the old identity is cleared synchronously;
2. the interim gutter map is empty;
3. the refreshed active file receives its correct modified marker;
4. a cached old HEAD for the first file cannot reappear on the return switch.

The harness smoke now creates and commits two tracked files, modifies the second in the worktree,
opens the clean first file, clicks the modified second file, waits for the active-buffer status,
then requires the exact modified-color `▎` beside `after switch`. It reports:

`PASS post-switch marker appears after the active document HEAD refresh`

It then returns to the original clean tracked file and requires a marker-free grid. The independent
tmux gutter smoke also remains green.

## SGR audit — STOP at the OpenTUI boundary

No app-side SGR patch was made because the redundant emission is in OpenTUI's native renderer.
Installed version: `@opentui/core@0.4.5`.

Mechanism:

- The app's truecolor theme returns the stable `DARK` palette object; theme object churn is absent.
- OpenTUI's native cell comparison checks character, attributes, foreground RGBA, and background
  RGBA **by value**, so newly constructed JavaScript style/chunk objects do not manufacture cell
  changes.
- The renderer groups contiguous changed cells with the same style into a run.
- An unchanged cell ends that run by emitting a full ANSI reset.
- The next changed run moves the cursor and re-emits foreground, background, and attributes from
  scratch. Cursor moves do not require resetting SGR state, so this repeatedly reasserts the same
  background and often the exact same style.
- Replacing Invar's explicit `#1a1b26` background with terminal-default color would change the
  rendered appearance and therefore is not an acceptable app-side optimization.

Source inspected:

`https://github.com/anomalyco/opentui/blob/v0.4.5/packages/core/src/zig/renderer.zig`

Representative raw-frame audit:

| Frame | Bytes | Runs | Unique styles | Same-background transitions | Exact-style repeats | Actual SGR | State-preserving estimate | Estimated saving |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Before, `RootView.ts` | 13,238 | 239 | 18 | 235/238 | — | 9,215 | 3,891 | 5,324 (40.2% frame) |
| Before, `Bootstrap.ts` | 17,033 | 321 | 17 | 317/320 | — | 12,437 | 5,492 | 6,945 (40.8% frame) |
| After, `RootView.ts` | 12,390 | 224 | 15 | 220/223 | 35 | 8,644 | 3,603 | 5,041 (40.7% frame) |
| After, `Bootstrap.ts` | 16,149 | 306 | 14 | 302/305 | 37 | 11,868 | 5,147 | 6,721 (41.6% frame) |

The estimate models retaining SGR state across cursor moves and unchanged gaps, then emitting only
changed color channels/attributes. It indicates about 5.0–6.7 KB per measured switch frame, or
roughly 40–42% of total bytes, is recoverable renderer-side. The small number of unique styles and
the 220–302 consecutive transitions retaining the same background rule out app-created per-cell
style variety as the main mechanism.

Because the task explicitly prohibits forking the renderer, this portion stops at the OpenTUI
boundary. A byte-identical-grid before/after corpus comparison is not applicable without an
authorized renderer change; the captured parsed-grid cell counts remained unchanged by the app
fix, and both visual gutter smokes verify the intended grid.

Raw representative captures were preserved outside the worktree:

- `/tmp/gutterlag-switch-latency-results-before`
- `/tmp/gutterlag-switch-latency-results-after`

## Verification runs

All correctness verification below was run after rebasing onto `origin/main`.

| Command | Result |
|---|---|
| `$HOME/.bun/bin/bunx tsc --noEmit` | PASS |
| `$HOME/.bun/bin/bun test` | PASS — 1,038 tests, 0 failures, 14,521 assertions, 120 files |
| `bash scripts/conventions-gate.sh` | PASS |
| `$HOME/.bun/bin/bun .claude/skills/invariants/scripts/check_invariants.mjs --all` | PASS — 0 problems |
| `$HOME/.bun/bin/bun .claude/skills/invariants/scripts/check_invariants.mjs --refs` | PASS — 546 annotations, 39 lattice links, 0 problems |
| `$HOME/.bun/bin/bun scripts/harness/smoke-gutter-diff-harness.ts` | ALL-PASS, including post-switch marker proof |
| `bash scripts/smoke-gutter-diff.sh` | ALL-PASS |
| `SWITCH_LATENCY_SCENARIO=real-large-typescript $HOME/.bun/bin/bun scripts/harness/measure-file-switch-latency.ts` | PASS — 5 sessions, 100 samples, 11.067 ms p50 |
| `git diff --check` | PASS |

The conventions gate's reported 1,427 legacy grammar findings are its existing allowed inventory;
there was no enforced failure. The invariant checker emitted existing informational coverage/name
notes only and reported zero problems.

## Repository state

`git rebase origin/main` reported the branch already up to date. The worktree has no uncommitted
implementation changes. The task-provided `TASK.md` remains untracked and was intentionally not
committed. No push, branch deletion, tag, or merge-gate run was performed.
