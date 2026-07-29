# 241 — DECISION: split ui.invariants.md along the five lattice families?

State: ACTIVE
Created: 2026-07-29
Engine: user
Environment: any
Model: n/a
Effort: n/a
Priority: architecture-hygiene

## Outline

Raised by #230. `ui.invariants.md` holds 61 records — the largest contract in
the repo (project: 32; next module: 20). The new `ui.lattice.md` names five
clean families: the pane seam, bounded-popup geometry, the modal slot,
scrollbars and marks, editor-body projection. `scroll` was split out of this
same file already — the precedent exists.

This is a design call, not a build: splitting moves records, citations, and
lattice stems, and touches every ui annotation. The lattice makes the seams
reviewable first, which was #230's deliberate stopping point. Decide with the
lattice open; if yes, the split becomes a codex task with the lattice as its
map.

## Invariants in scope

All of `ui.invariants.md` and `ui.lattice.md` (read-only until decided).

## Bycatch expected

n/a — decision task.

## Sources

- `report-230-...md`, "ui.invariants.md is due a split".
