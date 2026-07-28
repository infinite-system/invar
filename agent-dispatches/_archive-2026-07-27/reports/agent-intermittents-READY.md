# Agent intermittents — READY

Branch: `fix-agent-state-intermittents`

Commit: `4eafe18c564f8c55c870902ce2767e4b21eef369`

## Result

Both agent-state intermittents are fixed without widening a timeout.

- Defect A was a publication race, not lingering turn state. Escape entered
  `AgentSession.interrupt()`, canceled the backend timer, completed synchronous
  teardown, and left the model in `canceled`; the status file could nevertheless
  retain the preceding rendered `running` frame. Cancellation now schedules one
  guarded render-revision pulse after the synchronous key/backend stack unwinds.
- Defect B was a wait observing unstable transcript placement. The current
  semantic status named the correct gated prompt while the exact command/header
  had legitimately scrolled outside the one-row transcript viewport. The smoke
  now binds the pending Bash permission to the exact prompt through
  `agentLastAssistantText`, then independently proves all actionable approval
  controls are visible and no completed Bash row exists.

The permission assertion count grew, and the cancellation publication mechanism
has a unit test. No diagnostic instrumentation or debug printing remains.

## Reproduction evidence

All counted loops below acquired `quiet-exclusive`; degraded/unlocked attempts
were excluded.

- Defect A before: 4/20 pass, 16/20 fail.
  Logs: `/tmp/agent-intermittents-defect-a-before/`.
- Defect B before, first captured series: 20/20 pass.
  Logs: `/tmp/agent-intermittents-defect-b-before-captured/`.
- Defect B before, second captured series: 19/20 pass, 1/20 fail at attempt 9.
  Logs: `/tmp/agent-intermittents-defect-b-before-captured-second/`.
- An earlier partial Defect B series was 2/3 pass, 1/3 fail before the complete
  counted captures.

The initially attempted eager synchronous pane pulse still failed at attempt 2
of its probe series and was rejected. It is not part of the committed fix.

## Fixed-tree acceptance

- `smoke-terminal-follow-harness.ts`: 20/20 consecutive passes.
  Logs: `/tmp/agent-intermittents-defect-a-final/`.
- `smoke-agent-permissions-harness.ts`: 20/20 consecutive passes.
  Logs: `/tmp/agent-intermittents-defect-b-final-third/`.

## Checks

Every command exited 0:

- `bunx tsc --noEmit`
- `bash scripts/conventions-gate.sh`
- invariant checker `--all`
- invariant checker `--all --refs` — 0 problems, 853 annotations resolved
- `bun scripts/check-coverage-ratchet.ts`
- `bun scripts/check-reactive-observation.ts`
- `bun scripts/check-harness-wait-observation.ts`
- `bun test` — 1,589 pass, 0 fail
- `bash scripts/behavioral-contracts.sh` — ALL-PASS
- targeted `AgentSession.test.ts` — 34 pass, 0 fail
- `git diff --check`

Coverage declarations were appended with counted grammar:

- permissions smoke: assertions 7 → 8, waits 17 → 17
- AgentSession test: assertions 115 → 119, waits 33 → 34

The final worktree is clean.

COMPACTION: none

Conventions: `project.conventions.md` at
`f17a7b351ef6ccb324133d7160aac452b07202b9`.
