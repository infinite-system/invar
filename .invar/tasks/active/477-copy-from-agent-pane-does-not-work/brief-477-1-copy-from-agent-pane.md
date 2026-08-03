# Brief #477 round 1 — copy from the agent pane

## In plain words

The user selected the agent's answer in the agent pane and pressed the copy
keys, and nothing reached their clipboard. Find why by driving, fix what is
ours, and say exactly what needs the user's real terminal to confirm.

## Read first

1. [task-477](task-477-copy-from-agent-pane-does-not-work.md) — the evidence
   and the three hypotheses. SEPARATE them by driving; do not assume.
2. [the drive-pty skill](../../../../.claude/skills/drive-pty/SKILL.md).
3. The copy seam: the clipboard record in
   [system.invariants.md](../../../../src/modules/system/system.invariants.md)
   and the selection/copy unification (search git log for #299).

## The work

1. Reproduce in-harness: warm server, open the agent pane (echo backend),
   produce output, select it (drag), try the app's copy paths. Check whether
   the agent pane participates in the selection-copy seam at all.
2. Fix the in-harness arms that are ours (seam participation; a
   selection-active copy chord that does not collide with SIGINT semantics —
   follow whatever the plain terminal pane already does; consistency wins).
3. The Cmd+C-over-ssh arm: diagnose from code (kitty protocol path), state
   plainly what the user must confirm in cmux, do NOT fabricate a fix for
   what you cannot reproduce.
4. Ratchet: a permanent smoke asserting agent-pane selection copy emits
   through the audited OSC 52 seam.

## Invariants in scope

- [Clipboard emissions flush at frame boundaries](../../../../src/modules/system/system.invariants.md)
- [Copy reaches the host terminal](../../../../src/modules/system/system.invariants.md)
- [Harness input and output use the real PTY](../../../../scripts/harness/harness.invariants.md)
- Any record this list MISSED is a finding about the conductor's map.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s taxonomy, even when None observed.

## PTY usability — still tracked

Report the `## PTY usability` section.

## Verification

Both arms driven; the new smoke green; `bun test` FULL; `bunx tsc --noEmit`;
conventions gate; checker `--all`/`--refs`. NO merge-gate; SKIP_GATE=1.

## End state

A report file in this folder, number-first, opening with `## In plain words`.
