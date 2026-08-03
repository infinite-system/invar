# Brief #475 round 1 — Quick Open focus

## In plain words

Once, opening a file from Quick Open left the keyboard attached to the Git
pane instead of the editor, so typing did nothing. Reproduce it by driving
before you diagnose anything; if it is real, fix it and lock it with a smoke.

## Read first

1. [task-475](task-475-quick-open-leaves-focus-behind.md) — the single
   driven reproduction and the honest caveat that it happened ONCE.
2. [the drive-pty skill](../../../../.claude/skills/drive-pty/SKILL.md). The
   graph path `workspaceSet.active.focus` is live.

## The work

1. REPRODUCE FIRST: from a focused Git pane, Control+p, type a name, Enter,
   then read `workspaceSet.active.focus` at a settled frame. Loop the recipe
   (reload between attempts); vary timing with and without humanPace. If it
   does not reproduce in, say, 30 attempts, SAY SO — a no-repro report with
   the recipe is a valid outcome; do not fabricate a fix.
2. If reproduced: diagnose via the graph (focus at each step), fix so a
   Quick Open open always focuses the editor, and land a permanent smoke
   asserting focus lands on the editor after the open.

## Invariants in scope

- [Harness waits observe conditions not frame ordinals](../../../../scripts/harness/harness.invariants.md)
- Workspace focus records in [workspace.invariants.md](../../../../src/modules/workspace/workspace.invariants.md) — check which govern focus, report the miss if none do.
- Any record this list MISSED is a finding about the conductor's map.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s taxonomy, even when None observed.

## PTY usability — still tracked

Report the `## PTY usability` section.

## Verification

The reproduction loop's numbers (attempts, hits); if fixed: the smoke green,
`bun test` FULL, `bunx tsc --noEmit`, conventions gate, checker `--all`/`--refs`.
NO merge-gate; SKIP_GATE=1.

## End state

A report file in this folder, number-first, opening with `## In plain words`.
