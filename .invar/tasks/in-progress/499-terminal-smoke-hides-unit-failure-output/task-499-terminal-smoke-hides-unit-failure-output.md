# Task 499 — the terminal smoke hides its unit-test failure output

Priority: verification-integrity
Engine: claude
Environment: linux
Model: fable-5
Effort: low
State: IN-PROGRESS

## In plain words

smoke-terminal-harness.ts runs the terminal and PanelHost unit tests
in a child process with stdout and stderr piped and never printed. On
failure the log says only "FAIL terminal core and PanelHost unit
tests" — the actual failing test is invisible. Print the child's
output on nonzero exit. Sweep the other smokes for the same pattern.

## Evidence

gate-493 (2026-08-03): the spawn failed under load; the preserved log
carries zero detail (merge-gate-failures.8d57b0ed3c97135a.601338).
Solo unpiped rerun on the same tip: exit 0, 0 fail — the flake's
identity is lost because the instrument discarded it.

## Companion ask from #356 round 4 (2026-08-03) — same self-description class

The keyboard smoke should print its resolved harness home and the
starting panelContentOrder at the top: profile-dependent failures
become self-describing (the round-3 false green came from exactly
this invisibility). Fold into the same smoke-output-hygiene sweep.
