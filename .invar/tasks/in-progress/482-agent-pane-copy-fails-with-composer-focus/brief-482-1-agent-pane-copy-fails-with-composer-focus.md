# Brief #482 round 1 — composer-focus copy

## In plain words

Copy from the agent pane works in our tests but not for the user. The
difference we suspect: their keyboard focus sits in the message box, ours
sat on the transcript. Drive their exact sequence, confirm, fix, and add
the missing test arm.

## Read first

1. [task-482](task-482-agent-pane-copy-fails-with-composer-focus.md) — the
   evidence, the hypothesis, and the exact sequence. Drive it AS WRITTEN
   before diagnosing.
2. [the drive-pty skill](../../../../.claude/skills/drive-pty/SKILL.md).
3. The #477 record: [its report](../../completed/477-copy-from-agent-pane-does-not-work/report-477-copy-from-agent-pane-does-not-work.md) — what already passed and how it selected.

## Invariants in scope

- [Copy reaches the host terminal](../../../../src/modules/system/system.invariants.md)
- [Clipboard emissions flush at frame boundaries](../../../../src/modules/system/system.invariants.md)
- [Harness input and output use the real PTY](../../../../scripts/harness/harness.invariants.md)
- Any record this list MISSED is a finding about the conductor's map.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s taxonomy, even when None observed.

## PTY usability — still tracked

Report the `## PTY usability` section.

## Verification

Per the task file: both focus arms driven with clipboardEmissions() and
child-interrupt observation; extended smoke; full suite; tsc; conventions;
checker. NO merge-gate; SKIP_GATE=1.

## End state

A report file in this folder, number-first, opening with `## In plain words`.
