# Brief #474 round 1 — dispose-order warnings

## In plain words

When the app quits, it prints one warning per popup and editor part saying
the part was already removed from its parent. Make teardown clean so quit
prints nothing.

## Read first

1. [task-474](task-474-dispose-order-renderable-warnings.md) — the exact
   warning list from the user's mirror session.
2. [the drive-pty skill](../../../../.claude/skills/drive-pty/SKILL.md) —
   the mirror tap makes dispose output capturable.

## The work

1. Reproduce: boot via PtyTestDriver, quit, capture the teardown output
   (the driver retains it). Count the warnings — that is your baseline.
2. Find the double-remove or wrong-parent bookkeeping (the popup trio —
   popup, backdrop, close — is the densest cluster; ModalOverlayDismissal).
3. Fix the ownership so teardown removes each renderable exactly once from
   its actual parent.
4. Ratchet: a smoke asserting quit produces ZERO removal warnings. Both
   arms: plant a double-remove, prove the smoke goes red.

## Invariants in scope

- [Modal outside presses dismiss and consume](../../../../src/modules/ui/ui.invariants.md) — the dismissal family owns the densest cluster.
- [The render loop never wedges](../../../../project.invariants.md) — teardown must not trade warnings for a hang.
- Any record this list MISSED is a finding about the conductor's map.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s taxonomy, even when None observed.

## PTY usability — still tracked

Report the `## PTY usability` section.

## Verification

Baseline count -> zero; the planted-defect red; `bun test` FULL;
`bunx tsc --noEmit`; conventions gate; checker `--all`/`--refs`.
NO merge-gate; SKIP_GATE=1.

## End state

A report file in this folder, number-first, opening with `## In plain words`.
