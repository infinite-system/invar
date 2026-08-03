# Task 482 — agent-pane copy fails when focus is in the composer

Priority: user-directed
State: IN-PROGRESS
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high

## Evidence (user, live, 2026-08-03 morning)

Raw OSC 52 printf PASTES on their host (transport innocent; #477 proved the
app emits with selection + chord in-harness). But in their real flow, copy
still fails, and on Ctrl+C with a selected reply "claude does flinch a bit"
— the chord reaches the CHILD as interrupt instead of being consumed as
selection-copy.

## The hypothesis to drive (exact sequence)

The user's focus is in the COMPOSER (they just typed to Claude). Sequence:
click the composer (focus=composer) -> Claude replies -> drag-select the
reply text in the transcript -> press Ctrl+C. Suspects: (a) the drag on the
transcript does not move focus, and the selection-active carve-out checks
the FOCUSED surface's selection (composer: none) so 0x03 falls through to
the child; or (b) the pointer-down that starts the drag CLEARS/never-creates
the transcript selection in this focus state. The #477 smoke passed because
its focus sat on the transcript.

## The work

1. Drive the exact sequence headless (echo backend): focus composer, reply
   present, drag-select reply, Ctrl+C. Observe driver.clipboardEmissions()
   AND whether the child received the interrupt. Both focus states (composer
   vs transcript) as the two arms.
2. If confirmed: fix so an ACTIVE TRANSCRIPT SELECTION wins the chord
   regardless of composer focus (consistency with the terminal pane's rule),
   without breaking Ctrl+C-as-interrupt when NO selection exists.
3. Extend the #477 smoke with the composer-focus arm.

## Verification

Both arms driven; the extended smoke green; full suite; tsc; conventions;
checker --all/--refs. NO merge-gate; SKIP_GATE=1.
