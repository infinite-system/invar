# Spinner guarantee — READY

Task: #64, observation turns cannot strand the thinking indicator

Branch: `fix-spinner-guarantee`

Commit: `21393cd` (`Guarantee injected turns cannot strand spinner`)

## Reproduction result

I could not strand the indicator before changing product behavior.

I drove the existing application through the PTY harness with a delayed real
echo-agent turn and exercised:

- normal injected completion;
- an injected turn followed by a user turn;
- a user turn followed by an injected turn;
- two injected observations while the first turn was busy;
- Escape during an injected turn;
- an injected turn whose CLI backend exited with an error;
- an injected turn whose CLI backend exited without structured output; and
- an integrated terminal that printed output and immediately exited.

The arrival-order finding is that turns are not superseded in either direction.
The later user or observation message queues, then starts after the active turn
settles. A second observation while busy also queues; it does not drop or
double-start.

The pre-change PTY transcript included these terminal conditions:

```text
PASS  the positive control sees the indicator during the normal injected turn
PASS  normal injected completion leaves no turn and no indicator
PASS  injected then user ordering leaves no turn and no indicator
PASS  user then injected ordering leaves no turn and no indicator
PASS  two injected turns while busy leave no turn and no indicator
PASS  Escape cancellation leaves no turn and no indicator
PASS  backend error leaves no turn and no indicator
PASS  backend completed leaves no turn and no indicator
```

For `printf 'INJECTED_TERMINAL_EXIT\n'; exec /bin/false`, Bash emitted no
complete command boundary, so there was no observation turn to inject. The
initial reproduction could therefore show no spinner strand but could not
authoritatively assert process death from the existing status probe. The
finished harness now waits for `terminalExited === true` with a nonzero exit
code, asserts that the observation count did not change, and then asserts
`agentBusy === false`, `agentTurnState === "idle"`, and no rendered thinking
glyph:

```text
PASS  the terminal session reports the immediate process exit
PASS  an exited terminal without a complete command boundary injects no turn
PASS  terminal exit leaves no injected turn and no indicator in session state
PASS  terminal exit leaves no injected turn and no indicator
```

No red was manufactured. Part 2 makes the guarantee structural and enforced.

## Derived indicator guarantee

`AgentSession.turnInFlight` is a plain getter derived only from the session's
`running` and `stalled` turn states. `AgentPaneContent` uses that predicate for
the title and thinking-indicator projection.

`AgentSpinner.running` is now a plain getter over
`session.turnInFlight && paneVisible`. The spinner owns a synchronous watcher
only to arm or disarm its animation timer as a derived resource. Its public
imperative `start()` and `stop()` operations no longer exist, so send,
completion, error, cancellation, replacement, and injection handlers cannot
forget teardown. Hidden panes still do not animate.

The full `Thinking indicator follows turn state` invariant record was added to
`src/modules/agent/agent.invariants.md`, including Scope and the required
Impossible-if-true statement:

> No sequence of injected, user, cancelled, superseded, or failed turns can
> leave the indicator running with no turn in flight.

## Dead-terminal decision

Implemented policy: **do not send**.

`AgentTerminalFollow` late-reads the terminal's authoritative `terminalExited`
state at observation delivery. If the process has exited before buffered output
is delivered as an observation, it starts no agent turn. An incomplete command
boundary from an immediately exiting shell likewise produces no observation.
This is preferable to sending command-only context that omits the terminal's
death and invites the user to read silence as “nothing happened.”

An observation delivered while the terminal is still alive remains truthful at
that command boundary even if the terminal exits later.

The app-status addition is limited to the terminal exit boolean and exit code
needed for authoritative PTY assertions. No shared UI module was changed.

## Verification

Required commands:

| Command | Exit |
| --- | ---: |
| `bunx tsc --noEmit` | 0 |
| `bun test` | 0 |
| `bun scripts/check-file-grammar.ts` | 0 |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all` | 0 |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` | 0 |
| `bash scripts/conventions-gate.sh` | 0 |
| `bun scripts/check-coverage-ratchet.ts` | 0 |
| `bash scripts/behavioral-contracts.sh` | 0 |

The full test result was 1,362 passing, 0 failing. The invariant reference pass
resolved 710 annotations with 0 problems. `idle-quiescence` passed with an
untouched frame count of 2 → 2.

Agent PTY smokes, each run three times:

| Smoke | Run 1 | Run 2 | Run 3 |
| --- | ---: | ---: | ---: |
| `smoke-agent-harness.ts` | 0 | 0 | 0 |
| `smoke-agent-pane-ux-harness.ts` | 0 | 0 | 0 |
| `smoke-agent-permissions-harness.ts` | 0 | 0 | 0 |
| `smoke-agent-engine-switch-harness.ts` | 0 | 0 | 0 |
| `smoke-terminal-follow-harness.ts` | 0 | 0 | 0 |

Additional checks:

| Command | Exit |
| --- | ---: |
| focused agent/app tests (71 passing, 0 failing) | 0 |
| touched-file `bunx prettier --check ...` | 0 |
| `git diff --check` | 0 |
| `git ls-files \| grep '^TASK'` | 1 (expected: no matches) |

Every new PTY wait observes the condition used by its assertion. The positive
control requires both an in-flight session turn and a rendered thinking glyph;
all terminal checks require both no in-flight turn and no glyph.

Post-commit `git status --short` produced no output; the worktree is clean.
