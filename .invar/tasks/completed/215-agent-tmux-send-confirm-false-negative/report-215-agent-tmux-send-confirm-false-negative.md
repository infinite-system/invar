# READY — #215 (agent-tmux send-confirm false negative)

Status: READY

Commit: `1d0c0e463e1b61793a91174c821a1cecd4ac8295`

## Result

Claude sends now confirm from Claude's bottom composer frame. The check accepts
the bare prompt and the dim placeholder as empty. It rejects ordinary pending
input.

The frame sits in the last three pane rows. Agent output always stays above
that frame. Printed words cannot impersonate this signal.

Codex keeps its prior `›` composer-line signature.

Dispatch now waits up to 15 seconds for Claude's cwd-derived session file.
The warning now means the file stayed absent for the full window.

The existing test file referenced a missing `test-lib.sh`. I made the test
self-contained so the new contract runs and reports a real exit code.

## Reproduction

I launched Claude 2.1.220 in an isolated empty directory. I sent a multiline
turn through `agent-tmux.sh send`.

Before the fix:

```text
send: NOT CONFIRMED — composer never returned to its pre-send state and no new queued marker
CLAUDE_SEND_EXIT=1
```

The pane showed the accepted turn and reply:

```text
❯ Read both lines.
  Reply with exactly CLAUDE_215_SUBMITTED after briefly explaining that you received a multiline message.

● I received a multiline message with two lines of instructions.

  CLAUDE_215_SUBMITTED
```

At 2 seconds and 5 seconds, `status` returned `busy`. Both frames had an empty
bottom composer and an `esc to interrupt` footer. The old code still failed
because `_composer_line` searched only for Codex's `›`.

The Codex comparison returned:

```text
submitted
CODEX_SEND_EXIT=0
```

## Both send polarities

The final fresh launch and multiline send results were:

```text
CLAUDE_LAUNCH_EXIT=0 CLAUDE_SEND_OUTPUT=submitted CLAUDE_SEND_EXIT=0
CODEX_LAUNCH_EXIT=0 CODEX_SEND_OUTPUT=submitted CODEX_SEND_EXIT=0
```

I then suppressed only `Enter` and `Tab` for a fresh Claude send. Literal
input still reached the real scratch pane.

```text
send: NOT CONFIRMED — composer never returned to its pre-send state and no new queued marker
CLAUDE_UNSUBMITTED_EXIT=1
NEGATIVE_COMMAND_EXIT=1
```

The pane still showed:

```text
❯ UNSUBMITTED_CLAUDE_215
```

## Dispatch session-link timing

I ran both arms with the same 15-second condition loop used by
`scripts/fleet/dispatch.sh`.

```text
DELAYED_RESULT=found ELAPSED=2s WARNING=no FILE=/tmp/agent-tmux-215-delayed-project-qP7YeG/session.jsonl
ABSENT_RESULT=missing ELAPSED=15s WARNING=yes
```

## Positive control

I planted the old false-positive shape. It classified all Claude prompt text
as empty. The contract went red:

```text
FAIL  ordinary claude composer text is pending
      expected:
      actual:   claude-empty
agent-tmux: 20 passed, 1 failed
PLANTED_AGENT_TMUX_TEST_EXIT=1
```

I removed the plant before the final pass.

## Verification

```text
BASH_SYNTAX_EXIT=0
agent-tmux: 21 passed, 0 failed
AGENT_TMUX_TEST_EXIT=0
973 annotation(s) resolved, 67 lattice link(s) resolved, 0 problem(s)
INVARIANTS_EXIT=0
STE_LINT_EXIT=0
DIFF_CHECK_EXIT=0
```

I did not run `scripts/merge-gate.sh`, as required by the brief. Scale parity
does not apply because this change touches no production app or scale path.

The worktree is clean.

## Bycatch

- `agent-tmux.sh list` fails when `AGENT_TMUX_PREFIX=invar/`. `sed` treats the
  slash as its delimiter. The command returned exit 1 twice. An isolated
  `att215_` prefix returned exit 0. I did not fix this.
- A fresh Claude 2.1.220 trust dialog says `Is this a project you created or
  one you trust?`. `_dismiss` matches `Do you trust`, so launch stayed at the
  dialog. This reproduced on two launches in the same untrusted scratch
  directory. I did not fix this.
- A fresh Codex trust dialog has a selected line that starts with `›`.
  `READY_RE='^›'` matched that option, so launch returned `ready` before trust
  was accepted. I saw this once. The trusted relaunch did not show the dialog.
  I did not fix this.
