# Smoke-port campaign WAVE 2 — READY

Tip SHA: `4e3aef92ae23e78c9cef4522be8fc194e109824c`

## PTY harness solo runs

| Smoke | Consecutive solo result |
| --- | --- |
| git-blame | 5/5 ALL-PASS |
| git-log | 5/5 ALL-PASS |
| git-watch | 5/5 ALL-PASS |
| gutter-diff | 5/5 ALL-PASS |
| diff-overview | 5/5 ALL-PASS |
| tree-scroll | 5/5 ALL-PASS |
| quickopen | 5/5 ALL-PASS |
| navigation-history | 5/5 ALL-PASS |
| openproject | 5/5 ALL-PASS |
| activitybar | SKIP — not a pass |
| panel-split | 5/5 ALL-PASS |

## Skip and blocker

`activitybar` is skipped under the task's genuine-parity-blocker rule. The untouched authoritative
`scripts/smoke-activitybar.sh` fails on baseline `17ec69f`: it asserts that the Git change-count badge
is at activity-bar column 0, while both FrameProbe/tmux and the PTY emulator show the actual row as
`" 1  │ Changes"` (the count is at column 1). The byte port reproduces the same column-0 failure when
run with `INVAR_RUN_BLOCKED_ACTIVITYBAR_PORT=1`; by default it reports `SKIP` and never reports
`ALL-PASS`. No product behavior or tmux original was changed to manufacture parity.

## Untouched tmux originals

10/11 ran ALL-PASS once: git-blame, git-log, git-watch, gutter-diff, diff-overview, tree-scroll,
quickopen, navigation-history, openproject, and panel-split.

`smoke-activitybar.sh` ran once and failed only the pre-existing column-0 badge assertion described
above. It remains untouched and is now explicitly registered in `scripts/merge-gate.sh` alongside the
other originals.

## Mechanical verification

- `bunx tsc --noEmit`: PASS
- `bun test`: 819 pass, 0 fail
- `scripts/conventions-gate.sh`: PASS
- invariant checker `--all`: 0 problems
- invariant checker `--refs`: 459 annotations resolved, 39 lattice links resolved, 0 problems
- Full merge gate: intentionally not run per TASK.md

## Files changed

- `scripts/harness/HarnessInput.ts`
- `scripts/harness/HarnessSmoke.ts`
- `scripts/harness/PtyTestDriver.test.ts`
- `scripts/harness/PtyTestDriver.ts`
- `scripts/harness/smoke-activitybar-harness.ts`
- `scripts/harness/smoke-diff-overview-harness.ts`
- `scripts/harness/smoke-git-blame-harness.ts`
- `scripts/harness/smoke-git-log-harness.ts`
- `scripts/harness/smoke-git-watch-harness.ts`
- `scripts/harness/smoke-gutter-diff-harness.ts`
- `scripts/harness/smoke-navigation-history-harness.ts`
- `scripts/harness/smoke-openproject-harness.ts`
- `scripts/harness/smoke-panel-split-harness.ts`
- `scripts/harness/smoke-quickopen-harness.ts`
- `scripts/harness/smoke-tree-scroll-harness.ts`
- `scripts/merge-gate.sh`

## Task 2

### Verdict and evidence

Verdict: **(a) accent in column 0 with the badge in column 1 is the designed layout; the
column-0 badge assertion was stale.**

- Commit `1a2f315` moved the badge to row-above-icon column 0. Commit `588413f` then restored the
  active accent to column 0 on the icon row. The later integration commit `140ea02` explicitly moved
  the badge from column 0 to column 1 so it sits closer to the icon centred at column 2; this is the
  final layout decision in the lineage.
- `src/modules/ui/ActivityBar.ts` implements that final decision as
  `[space][badge][space][space]` on the badge row and
  `[accent-or-space][space][icon][space]` on the icon row.
- Before the smoke correction, the driven tmux/FrameProbe run observed the Source Control badge row
  as `" 1  │ ..."` and passed the icon-row accent-at-column-0 assertion, failing only the stale
  badge-at-column-0 assertion. The PTY emulator independently reproduced the same single failure.
- After correction, both oracles explicitly observed a blank badge-row column 0, badge `1` at column
  1, and active accent `|` at column 0 on the Source Control icon row.

There is no renderer drift and no renderer change.

### What changed

- `scripts/smoke-activitybar.sh` now asserts the designed geometry precisely: badge-row column 0 is
  blank, badge-row column 1 contains the change count, and the existing icon-row column-0 accent
  assertion remains.
- `scripts/harness/smoke-activitybar-harness.ts` now makes the same exact cell assertions and removes
  the `INVAR_RUN_BLOCKED_ACTIVITYBAR_PORT` skip scaffold. Its existing `scripts/merge-gate.sh`
  registration is therefore a normal gate-blocking smoke.

New tip SHA: `05c6ffed3f2abcd9c25d44669c9ba93a20193664`

### Run results

- `bash scripts/smoke-activitybar.sh`: **ALL-PASS** once.
- `bun scripts/harness/smoke-activitybar-harness.ts`: **ALL-PASS 5/5 consecutive**.
- `bunx tsc --noEmit`: **PASS**.
- `bun test`: **819 pass, 0 fail**.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all`: **0 problems**.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --refs`: **459 annotations
  resolved, 39 lattice links resolved, 0 problems**.
- `bash scripts/conventions-gate.sh`: **PASS**.
- Commit used `SKIP_GATE=1`; no merge-gate run, push, deletion, or renderer change.
