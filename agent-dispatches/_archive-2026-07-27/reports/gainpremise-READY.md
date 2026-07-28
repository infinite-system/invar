# READY — #145 smoke asserting the wrong variable

## Outcome

Chose outcome 2: retire the shell smoke as a duplicate.

The deciding evidence:

- Before the change, `bash scripts/smoke-settings-applied.sh` reproduced the
  defect and exited 1:
  `scrollAccelGain 120 scrolls further than 5 (0 not > 1)`.
- The shell smoke sent one notch, before gain has a successive impulse to
  shape.
- `smoke-settings-applied-harness.ts` sends two same-direction impulses for
  the gain case. Its real PTY drive exited 0 and reported
  `scrollAccelGain 120 moves farther than 5 (1 to 2)`.
- `scripts/merge-gate.sh` registered the shell smoke only through
  `quiet_serial_full_tmux_smoke`, so the normal gate skipped it unless
  `INVAR_FULL_TMUX=1`.
- The PTY harness is registered through `parallel_safe_smoke` in the normal
  smoke pool. It also enumerates `Settings.$Class.DEFAULTS` at runtime and
  reported all 36 schema fields covered.

The legacy shell artifact is now parked as
`scripts/smoke-settings-applied.sh.parked`, made non-executable, and removed
from both gate call sites. Active requirements and invariant evidence now
name the normal-gate PTY harness. The retirement reason is recorded in
`project.coverage-deltas.md`.

The coverage ratchet counts TypeScript tests and `scripts/harness/smoke-*.ts`,
not shell smokes. Accordingly, its mechanical result proves the superseding
harness retained its coverage rather than validating a shell assertion count;
the parked shell row is the human-auditable retirement declaration.

## Verification

- `bun scripts/harness/smoke-settings-applied-harness.ts` — exit 0.
- `bunx tsc --noEmit` — exit 0.
- `bun test` — exit 0; 1,651 passed, 0 failed across 249 files.
- `bash scripts/conventions-gate.sh` — exit 0.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`
  — exit 0; 871 annotations and 67 lattice links resolved, 0 problems.
- `bun scripts/check-coverage-ratchet.ts` — exit 0; positive control counted
  2 assertions / 2 waits, then 309 files showed no undeclared decrease.

The retirement path applies, so the task's three-run repaired-smoke
requirement does not apply.

## Commit

`f29f21c6a016e710db4fd7783bbb657f62b8ed43`
(`Retire false single-notch gain smoke`)

The worktree is clean and one commit ahead of `origin/main`. Nothing was
pushed, merged, tagged, or deleted.

## Bycatch

None observed.

COMPACTION: task complete at commit
`f29f21c6a016e710db4fd7783bbb657f62b8ed43`.

conventions @ `5a29312e3e8d614bbcff566841402f08fbfdcc23`
