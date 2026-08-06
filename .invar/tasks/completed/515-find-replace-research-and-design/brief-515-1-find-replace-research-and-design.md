# Brief 515-1 — RESEARCH: workspace Find/Replace with flyweight undo

## In plain words

Design the Find/Replace module before anyone builds it: flyweight
reverse-patch undo across many files, drift verification at every
stage, consent with counts in both directions, and a VS Code parity
study (toggles, include/exclude globs, inline replace preview — read
their docs online, they carry screenshots; they also drive ripgrep).
[The task file](task-515-find-replace-research-and-design.md) is the full spec including the
conductor's design priors to verify or refute.

## Deliverables

The design doc at repo root (project-find-replace-design named
file); the integration census (activity-bar contribution slot after
File Tree, pane registration, buffers/undo seams, Processes for
ripgrep — cite the exact records and classes each integration rides);
proposed invariant records (flyweight undo, stage verification,
mass-operation consent) as PROPOSALS ONLY; a milestone split for the
implementation wave. Throwaway probes allowed (a ripgrep-through-
Processes spike; a reverse-patch round-trip on a scratch file);
nothing lands in src/.

## Reproduce by DRIVING first

Drive the current app once: where the activity bar items live today
(the slot after File Tree), what QuickOpen/FindBar already own —
the doc's reuse claims must come from driven sightings + code, not
memory.

## Invariants in scope

Cited, not edited: Undo records deltas not whole-document snapshots
([src/modules/editor/editor.invariants.md](../../../../src/modules/editor/editor.invariants.md)); External tools share one
launch policy; File access is confined to a single root
([src/modules/system/system.invariants.md](../../../../src/modules/system/system.invariants.md)); activity-bar/contribution
records ([src/modules/app/app.invariants.md](../../../../src/modules/app/app.invariants.md)).

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy even when None observed.

## Instrument feedback

EASY / CONFUSING / MISSING; asks get converted.

## Rules

Never run scripts/merge-gate.sh; worktree commits skip the gate via
the planted policy; the conductor gates and lands.
