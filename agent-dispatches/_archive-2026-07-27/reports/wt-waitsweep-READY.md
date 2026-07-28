# READY — Harness wait-discipline sweep

Branch: `fix-harness-wait-sweep`

Latest integration base: `c4fec7c6b33708500cb026b18080a54fc8ef530b` (`origin/main`)

Tip: `e4d7bd00b1666b9c3b172cd7c923b2cef49bb1a8`

## Outcome

- Async status verdicts now poll independently; smoke grid predicates do not read status.
- `HarnessSmoke` and `HarnessSmokeSupport` status waits require descriptions and time out as
  `Timed out waiting for <description> at <path>`.
- Every harness status wait is named, including the Terminal-follow consumer added on the latest
  integration base.
- `harness.invariants.md` now contracts both rules with mechanisms, rejected alternatives, and
  impossible states.
- Timeout-format tests cover both shared status-wait implementations.
- The full suite exposed and drove repairs for stale returned snapshots, no-op frame expectations,
  post-release splitter ordering, an absent pre-copy field, and transient recursive-cleanup
  `EFAULT`. Cleanup retry policy is now one shared `HarnessSmoke` seam used by all registered smokes.

## Census

| Census | Found | Converted/labeled | Left as-is |
|---|---:|---:|---:|
| Sampled async status reads | 100 | 100 | 0 |
| Status-wait calls in the final harness tree | 388 | 388 | 0 |
| Status-wait calls in `smoke-*.ts` | 383 | 383 | 0 |
| Status reads outside status-wait predicates | 0 final | — | 0 |
| Status reads inside grid/`awaitSnapshot` predicates | 0 final | — | 0 |

The sampled-read total is the 86-site entry census plus 14 sites introduced by the required
latest-`origin/main` rebase. No boot/static exception was retained: every smoke status read that
feeds a verdict or control decision now comes from a completed status wait.

## Files

53 files differ from `origin/main`:

- `scripts/harness/HarnessSmoke.ts`
- `scripts/harness/HarnessSmokeSupport.ts`
- `scripts/harness/HarnessSmoke.test.ts`
- `scripts/harness/harness.invariants.md`
- `scripts/harness/record-terminal-emulator-fixtures.ts`
- All 48 registered `scripts/harness/smoke-*-harness.ts` consumers

`scripts/check-file-grammar.ts` and `CONVERTED_MODULES` are unchanged.

## Verification

| Check | Result |
|---|---|
| Rebase/freshness | PASS — merge-base equals latest fetched `origin/main` |
| `bunx tsc --noEmit` | PASS |
| Final TypeScript AST census | PASS — `383` smoke waits, `388` total waits, `0` direct smoke status reads, `0` unlabeled waits |
| `bun test` | PASS — 1,209 tests, 0 failures |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` | PASS — 610 annotations resolved, 0 problems |
| `bun scripts/check-file-grammar.ts` | PASS — 314 files; converted-module registry unchanged |
| `git diff --check` | PASS |
| Quiet-machine preflight | PASS — no competing gate/smoke/test app before acceptance run |
| Full registered PTY harness suite, solo | PASS — 48/48, one process at a time |

All commits used `SKIP_GATE=1`. No gate, push, merge, tag, or branch deletion was performed.
`TASK.md` and the separately present `TASK2.md` remain untracked and uncommitted.
