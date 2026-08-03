# Task 486 — the runtime boot counter must count Invar starts, not driver constructions

Priority: verification-integrity
Engine: claude
Environment: linux
Model: fable-5
Effort: medium
State: ACTIVE

## In plain words

Our boot-counting instrument counts every PTY driver it sees, even when the
driver runs a small helper tool instead of the Invar app. So one smoke file
reads one boot too high. The counter must look at the command it drives and
report Invar starts separately.

## Evidence (from report-485, verbatim class)

- The preload `484-runtime-boot-counter-preload.ts` (completed task 484 folder)
  counts every `PtyTestDriver` construction under the label
  `HARNESS_RUNTIME_BOOT_COUNT`.
- `scripts/harness/smoke-terminal-harness.ts` constructs one driver for
  `scripts/tasks/tasks-status.ts watch` — not an Invar start. The instrument
  overcounts Invar by one there.
- MISSING (builder ask): inspect the driver's command; report Invar starts
  separately from other PTY subjects; add a planned-count mode for a smoke
  that fails before later constructor calls.

## Invariants in scope

none — measurement tooling only; the builder may refute this.

## Bycatch expected

Report per AGENTS.md's bycatch taxonomy even when none observed.
