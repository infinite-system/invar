# 242 — DECISION: promote the shared paint-and-hit rule to a project record?

State: ACTIVE
Created: 2026-07-29
Engine: user
Environment: any
Model: n/a
Effort: n/a
Priority: architecture-hygiene

## Outline

Raised by #230. Seven ui records state one rule from different generators:
the walk that PLACES a control returns its hit segments (bounded popups,
panel controls, splitter, tab bars, command bar, settings widgets, scrollbar
thumb). Candidate project record: *A control's paint walk returns its hit
segments*, after which the seven become instances with their own geometry.

#230 deliberately did not unify — the seven generators genuinely differ, and
convention 2 rejects over-unification as firmly as duplication. The lattice
records the recurring SHAPE as the honest halfway point. The decision: is the
shape a project-level record (the seven cite it), or is the shared prose the
tell of a false unification? Decide reading [ui.lattice.md](../../../../src/modules/ui/ui.lattice.md)'s "recurring
shapes" section; if promoted, the edit is small and contract-only.

## Invariants in scope

The seven named ui records; [project.invariants.md](../../../../project.invariants.md) (the candidate's home).

## Bycatch expected

n/a — decision task.

## Sources

- `report-230-...md`, distillation-possibility item.
