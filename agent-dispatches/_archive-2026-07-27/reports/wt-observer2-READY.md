# TerminalObserver wave 2 repair — READY

## Delivery

- Branch: `feat-terminal-observer-wave2`
- Exact tip: `c4fec7c6b33708500cb026b18080a54fc8ef530b`
- Repair commit: `c4fec7c fix(harness): repair observer wave 2 gate coverage`
- Feature commit: `4f1032c feat: add terminal follow modes and scrollback tool`
- Rebased onto: `2936b2b3b7041a281631c4e00e2ead0b355d4054` (`origin/main`)
- Ahead/behind: ahead 2, behind 0
- Working tree: no tracked changes; only the conductor-provided `TASK2.md` is untracked
- Merge gate: not run, as required

## Four gate repairs

1. `scripts/smoke-settings-applied.sh --meta` now includes
   `agentTerminalFollowMode`, so `scripts/conventions-gate.sh` no longer reports the missing
   applied-effect drive.
2. `smoke-settings-applied-harness.ts` now drives the real user path:
   `Ctrl+,` → discover `Agent terminal follow mode` by its live settings label → `Right`.
   It asserts both the projected `terminalFollowMode` status changing from `off` to `follow-all`
   and the painted row showing `follow-all`. The schema coverage set includes the field.
3. `smoke-agent-pane-ux-harness.ts` now discovers the footer row from the new `follow: off`
   segment and asserts that the same row contains the engine and permission segments. It no longer
   requires the old trailing `shift+tab` hint to fit at 110 columns. The tmux audit smoke's stale
   text assertion was updated to the new footer segment as well.
4. `smoke-layout-harness.ts` no longer hard-codes settings descriptor indices 25–28 or requires
   all four layout rows to fit simultaneously. It resets from the live selected index, discovers
   each target by `settingsSelectedLabel`, and uses no-frame-expectation input for off-screen
   settings navigation/editing. The real geometry remains asserted after the settings overlay
   closes.

## Schema census correction

`TASK2.md` says the schema is “36 now.” The authoritative shapes disagree:

- `origin/main` `SettingsValues`: 34 fields
- this branch `SettingsValues` / `Settings.defaults`: 35 fields

The new field is the 35th. The final harness truthfully reports:
`PASS all 35 schema fields have an applied-effect drive`.

## Final verification after rebase

All driven runs below were solo 1/1 on a machine with no other harness or merge-gate process active.

| Instrument | Result |
| --- | --- |
| `bunx tsc --noEmit` | PASS |
| `bun test` | PASS — 1,207 tests, 0 failures, 15,434 expectations across 141 files |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` | PASS — 606 annotations, 39 lattice links, 0 problems |
| `bun scripts/check-file-grammar.ts` | PASS — 314 TypeScript files; enforced modules clean |
| `bash scripts/conventions-gate.sh` | PASS |
| `bun scripts/harness/smoke-settings-applied-harness.ts` | ALL-PASS — real Ctrl+, drive plus all 35 schema fields covered |
| `bun scripts/harness/smoke-agent-pane-ux-harness.ts` | ALL-PASS |
| `bun scripts/harness/smoke-layout-harness.ts` | ALL-PASS |
| `bun scripts/harness/smoke-terminal-follow-harness.ts` | ALL-PASS |
| `git diff --check origin/main...HEAD` | PASS |
| `git merge-base --is-ancestor origin/main HEAD` | PASS |

Invariant review: the repair strengthens `Every setting is a reactive cell read through its value
ref` and `Terminal follow obeys the live user mode`; it upholds the real-PTY, terminal-emulator
oracle, condition-based wait, and layout single-configuration contracts. No contract downgrade or
new unstated assumption is required.
