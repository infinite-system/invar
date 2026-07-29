# Brief — #230: author the ui lattice

Read first: [.invar/tasks/active/230-author-ui-lattice/task-230-author-ui-lattice.md](task-230-author-ui-lattice.md)
— it carries the scope, the model ([scroll.lattice.md](../../../../src/modules/ui/scroll.lattice.md)), and the placement
question (extend [project.lattice.md](../../../../project.lattice.md) vs a new [ui.lattice.md](../../../../src/modules/ui/ui.lattice.md) — read scroll's
header for the criterion and record the decision either way).

The ui record family as of tonight, which is why this is owed NOW: #114's
runtime seam records, #219's *A pane content projects through exactly one
surface* and *The source text editor is a pane content citizen*, #220's *The
editor column's default occupant is a contribution*, #221's composition
*Source text state survives replaceable projection* (already in
[project.lattice.md](../../../../project.lattice.md) — join it, do not duplicate it).

The lattice records DERIVATION (which records generate which) and CONSTRAINT
(which bound which). It is a design reviewer, not a list — the 07-25 lesson:
stating a proposal against the lattice exposed its gap before code existed.
Every link must resolve under the checker.

## Invariants in scope

- Every record in [src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) — the subject matter.
- [project.lattice.md](../../../../project.lattice.md) — the layer this joins.
- [scroll.lattice.md](../../../../src/modules/ui/scroll.lattice.md) — the structural model (read-only).
- [workspace.invariants.md](../../../../src/modules/workspace/workspace.invariants.md) — *One provider creates every workspace buffer
  view* constrains the ui family from outside; the lattice should say how.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy, all seven categories — contract-layer gaps
especially: you will read every ui record; name what else is owed. The READY
report carries `## Bycatch` even if it reads `None observed`.

## Verification

`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` at
zero problems; quote the lattice-link delta. Contract-only — no production
code. Do not run `scripts/merge-gate.sh`. Commit with
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`. Prose
STE-flavored.
