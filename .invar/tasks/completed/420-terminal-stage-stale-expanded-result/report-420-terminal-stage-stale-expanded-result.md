# READY — terminal-stage stale expanded result

## Outcome

READY at commit `357ac92bf1fb870197fd80cf16d3db9006983cdb`.

The agent transcript did not contain stale terminal data. The drive clicked an
older collapsed tool-result row. [`HarnessSnapshot.findText`](../../../../scripts/harness/HarnessSnapshot.ts)
returns the first visible match from the top. The terminal-stage smoke searched
for the generic text `lines`, so it selected the earlier emoji-read result.

The fix adds a bottommost text locator inside
[`smoke-terminal-stage-harness.ts`](../../../../scripts/harness/smoke-terminal-stage-harness.ts).
The drive switches to the terminal and back before the click. This creates a
real repaint boundary. It then clicks the bottommost tool result, which is the
latest result.

The coverage declaration now records `assertions 24 → 24, waits 37 → 36` in
[`project.coverage-deltas.md`](../../../../project.coverage-deltas.md). The
restored wait distinguishes the latest result from an earlier visible result.

## Bisect finding

The requested range from `79b325ea` to task HEAD contained 47 commits. The
standalone drive produced bad results at several midpoints and one good result
at `5c729fd3`. Git then named `d4ead77d` as the first bad commit. That commit
only adds a completed-task summary, so it cannot change the runtime or harness
path. I rejected that verdict.

No commit in the requested range changes the terminal, agent, panel, or
terminal-stage smoke path. The runtime tree is unchanged across that range.

The guilty commit is
`3000e75594c29e52293a7614e1056df60fb48ee0`, “feat: add two-row grouped panel
windows (#404 two-row grouped panel windows).” It added an earlier
`readTerminalInput` call before the emoji edit. That made two collapsed
`lines` results visible while the later click still selected the first match.

Commit `53ab6a158f12dd82cd967eebf06c68794189c55f` originally added the
first-match click. It was unambiguous at that time because the transcript had
only one read result. Commit `3000e755` introduced the conflicting earlier
result and created the failure.

This differs from [#411 (gate load starvation family)](../../active/411-gate-load-starvation-family/task-411-gate-load-starvation-family.md).
Load affected which result row stayed visible, so retries could appear green.
The selector itself was structurally wrong. With both rows visible, the wrong
click fails deterministically.

## Invariants in scope

- [Harness waits observe conditions not frame ordinals](../../../../scripts/harness/harness.invariants.md#harness-waits-observe-conditions-not-frame-ordinals)
  is strengthened. The repaint condition is false on the terminal surface and
  becomes true only after the agent surface repaints.
- [Async-published state is always awaited](../../../../scripts/harness/harness.invariants.md#async-published-state-is-always-awaited)
  is upheld. The drive awaits the current tool result through status before it
  observes the repainted grid.
- [The transcript is the single source of agent session truth](../../../../src/modules/agent/agent.invariants.md#the-transcript-is-the-single-source-of-agent-session-truth)
  is upheld. The latest transcript result was correct. No production agent
  state changed.
- [Terminal tools have explicit permission tiers](../../../../src/modules/agent/agent.invariants.md#terminal-tools-have-explicit-permission-tiers)
  is upheld. The same `readTerminalInput` observation path remains in use.
- [Agent terminal reads are redacted](../../../../src/modules/terminal/terminal.invariants.md#agent-terminal-reads-are-redacted)
  is upheld. The fix changes only result-row targeting after the redacted read.
- [The agent pane is a PaneContent citizen not a special case](../../../../src/modules/agent/agent.invariants.md#the-agent-pane-is-a-panecontent-citizen-not-a-special-case)
  is upheld. The repaint boundary uses the normal panel-content switch.

Scale parity does not apply. The change only scans one bounded terminal grid
inside a harness. It changes no production row, item, or frame path.

## Verification

- Baseline standalone drive: exit `1` at
  `driveAnimatedTerminalTools`, line 388. The expanded result showed the
  earlier emoji command.
- Corrected standalone drive: exit `0`,
  `smoke-terminal-stage-harness: ALL-PASS`, in 9.459 seconds.
- Positive control: I restored the first-match click after the green run. The
  standalone drive returned exit `1` at the same current-input assertion after
  30 seconds. I then restored the bottommost selection.
- Invariant checker: 1,286 annotations and 231 lattice links resolved with
  zero problems.
- First full gate: `GATE_EXIT=1` only because the existing coverage declaration
  still said `waits 37 → 35`; the actual count was `37 → 36`.
- Final full gate: `GATE_EXIT=0`, `merge-gate: ALL-PASS`, total 4 minutes
  9 seconds. The retry tally reported no retry-only pass.
- Final branch state: clean.

## Bycatch

- The invariant checker reports pre-existing canonical-character notes for
  “An agent session is a structured event stream, not a screen” and “The agent
  pane is a PaneContent citizen, not a special case” in
  [`agent.invariants.md`](../../../../src/modules/agent/agent.invariants.md).
  Both names contain punctuation outside the canonical record-name charset.
  The standalone checker and both full-gate runs reproduced the notes. Not
  fixed in this task.

