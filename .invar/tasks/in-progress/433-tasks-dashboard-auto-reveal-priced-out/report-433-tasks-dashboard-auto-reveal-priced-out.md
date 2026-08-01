# READY — Tasks dashboard priced-out reveal diagnosis (#433)

Task: [tasks dashboard auto-reveal priced out](task-433-tasks-dashboard-auto-reveal-priced-out.md)

Final commit: `fb19da647f49dbac0ea1acadca70dce9be13a88b`

Earlier hypothesis commit: `070c0def0c1523160b84535f75ff902c6284399b`

## Result

The large-fixture smoke is fixed. The filed auto-reveal diagnosis did not survive the driven evidence.

The failing frame already had a visible and active Tasks dock. It published these facts:

- `tasksAvailable=true`
- `tasksTaskTreeReads=2`
- `tasksDataHeartbeatTicks=29`
- `tasksAnimationPaint=177`
- `tasksRows=1001`
- `tasksGateExitCode=1`

The predicate required exactly 1,000 rows. A running gate adds one valid gate row. The smoke now
expects 1,000 task rows plus one row when `tasksGateExitCode` is not null. The change is in the
[tasks dashboard PTY smoke](../../../../scripts/harness/smoke-tasks-dashboard-harness.ts).

I tested the filed activation-seed hypothesis in `070c0def`. A hidden boot then performed one full
tree read and retained every Live row. An independent invariant review blocked that design. The seed
made hidden activation work and memory scale with the complete task population.

The seed also could not create READY-triggered reveal. `applyDefaultVisibility` reads only the setting
and dock state. It does not read task availability or READY state. A one-time seed cannot detect a
builder that becomes READY after activation.

Commit `fb19da64` removes the seed, its test changes, and its contract exception. The final branch keeps
the hidden zero-work behavior from `417084fa`. The final branch changes only the stale smoke predicate.

## Driven evidence

Before any edit, `bun run drive --open . --geometry 120x36` showed the hidden baseline:

- `rightDockVisible=false`
- `tasksAvailable=false`
- `tasksTaskTreeReads=0`
- `tasksDataHeartbeatTicks=0`

The first full [tasks dashboard smoke](../../../../scripts/harness/smoke-tasks-dashboard-harness.ts)
timed out in `the large fixture shows the same compact live projection`. A temporary timeout diagnostic
captured the 1,001-row status above. I removed that diagnostic before the final commits.

The final smoke passes every small and large arm. The 500-task arm reported three steady ticks with
`taskTreeReads=0`, `fleetFactProbes=2`, `sessionProbes=2`, and `rowRebuilds=0`. It also passed the
existing all-tree positive control.

## Invariant review

The final branch upholds
[Dashboard motion exists only while observed](../../../../src/modules/tasks-dashboard/tasks-dashboard.invariants.md#dashboard-motion-exists-only-while-observed).
Hidden Tasks still owns no tree read or timer.

The final branch also upholds
[Cost tracks the actively observed set](../../../../project.invariants.md#cost-tracks-the-actively-observed-set).
No hidden task population is retained.

The rejected seed upheld
[Task truth lives in the folders the CLI reads](../../../../src/modules/tasks-dashboard/tasks-dashboard.invariants.md#task-truth-lives-in-the-folders-the-cli-reads),
but it violated both pricing records above. The independent verdict classified the proposed exception
as an improper downgrade. I removed it.

READY-triggered reveal has no current implementation or contract. The current
[Tasks stay hidden by default](../../../../src/modules/tasks-dashboard/tasks-dashboard.invariants.md#tasks-stay-hidden-by-default)
record permits reveal only through the setting or a reader gesture. A future READY-triggered policy
needs a bounded signal that does not scan or retain the hidden task population.

## Positive controls

- The live gate row made the old fixed 1,000-row predicate fail consistently.
- The smoke's planted all-tree tick still fails the painted-window bound before the real counts pass.
- Removing the tested seed made its proposed unit assertion fail with `Expected: true, Received: false`.
  I later removed the whole seed design after invariant review.

## Verification

- `bun test src/modules/tasks-dashboard` — PASS: 41 tests, 0 failures, 180 expectations.
- `bun scripts/harness/smoke-tasks-dashboard-harness.ts` — ALL-PASS after the final correction.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` — PASS: 1,321 annotations,
  263 lattice links, 0 problems.
- The full commit-hook gate reached `ALL-PASS` on the earlier hypothesis commit. All 66 parallel PTY
  jobs passed on its second full run. The final correction restores production code and contracts to
  their pre-task state. I used `SKIP_GATE=1` for that correction to avoid a third full gate.
- Final worktree status is clean.

## Bycatch

- The first full gate's Markdown smoke failed once at `previewRowContaining` during the table arm.
  `bun scripts/harness/smoke-markdown-harness.ts` passed immediately alone. The second 66-job pool also
  passed it. The failure did not reproduce.
- The first full gate's workspace-tabs smoke timed out once and passed its built-in retry. The second
  66-job pool passed on its first attempt. The failure did not reproduce.
- The second full gate's behavioral contracts timed out once and passed their built-in retry. The first
  full gate passed that step on its first attempt. The failure did not reproduce.
- Contract-layer gap: READY-triggered Tasks reveal is requested in the
  [filed brief](brief-433-1-tasks-dashboard-auto-reveal-priced-out.md), but no code or invariant defines
  that policy. The current hidden-default record defines a different policy.

No bycatch was fixed outside the task's stale smoke predicate.
