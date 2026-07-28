# TASK — An observation turn must never strand the spinner (#64)

You are a builder on the Invar terminal IDE. Work ONLY in this worktree. Do NOT run
`scripts/merge-gate.sh`, do NOT push, merge, tag, or delete branches — the conductor does that.
Commit to this branch when done and report.

## The defect, as recorded

Task #64: *"Follow-injected turns can strand the spinner: terminal-state guarantee for observation
turns"* — a correctness follow-up to the terminal-follow setting (#53, landed).

Background you need: the agent pane has a terminal-follow setting (follow all / on-error / on-request /
off). When it fires, the app INJECTS a turn into the agent session — the user did not type it; the app
did, to make the agent observe terminal output. A previous defect in this family stranded the spinner for
TWO HOURS (#55, fixed for user-initiated turns). The concern here is the injected path: a turn nobody
typed can complete, fail, or be superseded in ways the user-typed path never exercises, and if the
spinner's stop condition is tied to the user-visible send, an injected turn can leave the indicator
running forever with nothing behind it.

## Part 1 — REPRODUCE FIRST, and say plainly if you cannot

Do not fix anything before you can show the stranding. Read `src/modules/agent/AgentSession.ts` (the
injected-threshold logic is around line 495), `AgentSpinner.ts`, and `AgentThinkingIndicator.ts`, then
drive the real app through the PTY harness and try to strand the indicator on an INJECTED turn. Cases
worth driving, at minimum:

- an injected observation turn whose backend answers normally;
- an injected turn that ERRORS or whose backend dies mid-turn;
- an injected turn SUPERSEDED by a user-typed turn arriving while it is in flight (and the reverse
  order);
- an injected turn while the session is already busy — does it queue, drop, or double-start;
- Escape/cancel arriving during an injected turn (cancel was wired for user turns in #55);
- an injected turn triggered by a terminal that exits immediately, so its output arrives after the
  process is gone.

If NONE of these strands the spinner, that is a real and valuable finding — say so explicitly with the
transcript, and then Part 2 becomes "make the guarantee explicit and enforced" rather than "fix a bug".
Do not manufacture a red to justify the task.

## Part 2 — the guarantee, stated as an invariant and enforced

The end state, regardless of what Part 1 finds:

> The thinking indicator is a FUNCTION of session state, not a thing switched on at send and off at
> reply. If no turn is in flight, the indicator is not running — no matter how the turn started, ended,
> or was replaced.

Make that structurally true rather than defended by handlers: the indicator should derive from whether a
turn is in flight, so there is no code path that can forget to stop it. If the current design switches it
on and off imperatively, that is the defect class — the two-hour hang and this task are the same shape,
and patching one more path leaves the class alive.

The invariant record needs every field including **Scope**, and its Impossible-if-true should name this
directly: *no sequence of injected, user, cancelled, superseded, or failed turns can leave the indicator
running with no turn in flight.*

## Part 3 — the terminal-state guarantee the task title names

An observation turn exists to report terminal state. So it must not lie about it: if the terminal has
exited, or its output arrived after the process died, the injected turn must either carry that state
honestly or not be sent. State which you implement and why. A turn that says nothing about a dead
terminal is worse than no turn, because the user reads silence as "nothing happened".

## Verify by driving

- Every case from Part 1, asserted at the PTY: after each one settles, the indicator is NOT running and
  the session reports no turn in flight. Assert the CONDITION, never a duration.
- The positive control matters here: also assert the indicator IS running while a turn is genuinely in
  flight, or the test passes trivially on an indicator that never runs at all.
- `bash scripts/behavioral-contracts.sh` green including `idle-quiescence` — a spinner that keeps
  requesting frames after its turn ends is exactly what that contract catches.
- Every agent smoke you touch, three times: `smoke-agent-harness.ts`, `smoke-agent-pane-ux-harness.ts`,
  `smoke-agent-permissions-harness.ts`, `smoke-agent-engine-switch-harness.ts`, and the terminal-follow
  smoke if one exists.

## Rules

- Full descriptive identifier names, no abbreviations. `.prettierrc`, 80 columns.
- `Static()`/`Reactive()` ivue conventions, `protected` floor, late-read discipline,
  file-name-follows-class, `X.interface.ts` for contracts.
- STAY INSIDE `src/modules/agent` and its smokes as far as possible. Three other builders are working
  tonight in `src/modules/workspace`, `src/modules/git`, `src/modules/ui`, and `src/modules/theme` —
  edits there will conflict. If the fix genuinely requires touching shared UI, keep that diff minimal and
  say so in the report.
- Read `src/modules/agent/agent.invariants.md` (and the terminal one if the follow path crosses it)
  BEFORE editing, including Rejected-alternatives.
- Every wait observes the condition its assertion reads. No bare sleeps, no vacuous predicates, no
  clock-based silence assertions.
- Run and report exact exit codes: `bunx tsc --noEmit`, `bun test`, `bun scripts/check-file-grammar.ts`,
  both invariant checker passes, `bash scripts/conventions-gate.sh`,
  `bun scripts/check-coverage-ratchet.ts`, `bash scripts/behavioral-contracts.sh`.
- Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <message-file>`. Leave the worktree
  clean; `git ls-files | grep '^TASK'` must return nothing.

## Report to /tmp/spinner-guarantee-READY.md

Whether you could strand the indicator and the exact sequence that did it (or the transcript proving you
could not); what makes the indicator derived rather than switched; the terminal-state decision for a dead
terminal; and the exact exit codes.
