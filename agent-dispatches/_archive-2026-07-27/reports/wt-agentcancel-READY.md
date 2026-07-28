# READY — Agent cancel, turn liveness, and message queueing

Branch: `fix-agent-cancel-queue`

Tip: `f442e1c85bad1ef709a2d0801870d94745ad9af9`

Rebased onto: `7f87d7fb33dbb7dd1628a69e9e58bb411ede1ad9` (`origin/main`)

## Two-hour hang root cause

`CliStreamBackend` and `CodexStreamBackend` pumped the stdout async iterator to completion
before awaiting `child.exited`. Process exit and pipe closure are independent: a child could
exit while stdout never delivered a close (for example, because a descendant retained the
pipe), so the exit result was never observed and `AgentSession` remained busy indefinitely.

The backends now attach the exit promise immediately and complete the turn from process exit
regardless of stdout/stderr closure. Stream pumps have child-identity guards so late output
cannot affect a successor. Cancellation terminates the detached process group, while SDK
streams detach and emit their interrupted terminal event immediately.

## Delivered behavior

- Escape cancels an in-flight focused agent turn; overlays retain Escape priority.
- Cancellation records `canceled`, denies unresolved permission prompts, releases busy state
  synchronously, and leaves the composer usable.
- Running turns show `esc to cancel`.
- A 120-second event-inactivity watchdog marks a turn
  `stalled — esc to cancel` without terminating it; backend activity restores `running`.
- Messages entered during a turn are visible as `[queued]` and drain in FIFO order.
- Cancellation holds queued messages until empty Enter or a queued-message click releases the
  head.
- Status projection exposes `agentTurnState` and `queuedMessageCount`.
- The registered PTY smoke proves cancellation, descendant process absence, non-destructive
  stall detection, ordered queue drain, and cancellation queue hold/release.

## Files

- `src/modules/agent/agent.invariants.md`
- `src/modules/agent/AgentEvents.interface.ts`
- `src/modules/agent/AgentSession.ts`
- `src/modules/agent/AgentSession.test.ts`
- `src/modules/agent/AgentPaneContent.ts`
- `src/modules/agent/AgentPaneContent.test.ts`
- `src/modules/agent/AgentTranscriptProjection.ts`
- `src/modules/agent/CliStreamBackend.ts`
- `src/modules/agent/CliStreamBackend.test.ts`
- `src/modules/agent/CodexStreamBackend.ts`
- `src/modules/agent/CodexStreamBackend.test.ts`
- `src/modules/agent/CodexAppServerBackend.ts`
- `src/modules/agent/SdkStreamBackend.ts`
- `src/modules/app/AppStatusProjection.ts`
- `src/modules/app/Bootstrap.ts`
- `src/modules/keybindings/KeybindingDefaults.ts`
- `scripts/harness/smoke-agent-cancel-harness.ts`
- `scripts/merge-gate.sh`

## Verification

| Check | Result |
| --- | --- |
| First command: `bun install --silent && git checkout bun.lock` | PASS |
| Quiet-machine check | PASS — load `0.23, 0.41, 0.52`; no live `/tmp/tui-` app |
| `bun run tsc --noEmit` | PASS |
| `bun test` | PASS — 1,273 tests, 0 failures, 15,543 assertions |
| Invariant checker `--all --refs` | PASS — 626 annotations, 39 links, 0 problems |
| `bun scripts/check-file-grammar.ts` | PASS — 22 enforced modules |
| `bash scripts/conventions-gate.sh` | PASS |
| `bun scripts/harness/smoke-agent-cancel-harness.ts` | ALL-PASS |
| `git diff --check origin/main...HEAD` | PASS |
| Rebase and ancestry audit | PASS |

Recorded hashes `9d6fe14`, `8aa0eff11a09cffb866b534727ddeb354b506b4c`,
`7f87d7fb33dbb7dd1628a69e9e58bb411ede1ad9`, and
`f442e1c85bad1ef709a2d0801870d94745ad9af9` are all ancestors of the final tip.

The repository worktree is clean apart from the supplied, untracked `TASK.md`.
