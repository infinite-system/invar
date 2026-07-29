# 230 — author ui.lattice.md: the ui records need the unification scroll has

State: ACTIVE
Created: 2026-07-29
Engine: claude
Environment: linux
Model: opus-5
Effort: medium
Priority: verification-integrity
Assignment note: User-identified gap 2026-07-29. Best after #220 lands — the pane-seam records are still moving until then.

## Outline

`scroll.lattice.md` records how the scroll domain's records derive from and
constrain each other. The ui domain has no such lattice, and tonight it became
the domain that most needs one: #114 added the runtime seam records, #219
added *A pane content projects through exactly one surface* and *The source
text editor is a pane content citizen*, #221 added the composition *Source
text state survives replaceable projection* to `project.lattice.md`, and the
pane/panel/keybinding/projection records now form a family with real
derivation structure that nothing records.

Model: `scroll.lattice.md`. The lattice is not a list — it records DERIVATION
(which records generate which) and CONSTRAINT (which records bound which),
and it doubles as a design reviewer (the 07-25 lesson: stating a proposal
against the lattice exposed the gap before code existed).

Scope note: whether ui compositions live in `project.lattice.md` or a new
`ui.lattice.md` follows how scroll made the call — read its header for the
criterion, and record the decision either way. Checker at zero problems; all
links resolved; count the lattice-link delta in the report.

## Invariants in scope

- Every record in `src/modules/ui/ui.invariants.md` — the subject matter.
- `project.lattice.md` — the existing composition layer this must join, not
  duplicate.
- `scroll.lattice.md` — the structural model (read-only).

## Bycatch expected

Per AGENTS.md's bycatch taxonomy, all seven categories; contract-layer gaps
especially — this task reads every ui record and will see what else is owed.
The READY report carries `## Bycatch` even if it reads `None observed`.

## Sources

- User instruction 2026-07-29 ("we are missing the ui.lattice.md that will
  unify everything like scroll.lattice.md does — this has to be part of the
  loop").
- #219/#221 reports — the records that formed the family.
