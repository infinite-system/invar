# Brief — #221: the record "The editor owns no view state" has no citing annotation

Read first: `.invar/tasks/active/221-editor-owns-no-view-state-uncited/task-221-editor-owns-no-view-state-uncited.md`,
then the record itself in `src/modules/editor/editor.invariants.md`, then
`project.decisions.md` entry *Fold state is document-adjacent persistence, not
a view property* (#218), and `.claude/skills/invariants/SKILL.md` for citation
rules.

## The decision, then the work

A record nobody cites is a claim nothing enforces. Two honest outcomes; read
before choosing:

- If the record still says something the newer records (#218's fold-state
  decision, `text.invariants.md`'s document records) do NOT: cite it from the
  code that upholds it — the fold-state seam on `DocumentHandle`, the
  dehydration path in `OpenBufferSet`, wherever the claim is actually made
  true. Root-relative citations only (bare filenames orphan silently — three
  did during #122's move).
- If it is fully subsumed: fold it into the newer records, update the lattice,
  and leave a pointer note where it stood. A merged record is not a deleted
  rule — show where each clause went.

Either way: `node .claude/skills/invariants/scripts/check_invariants.mjs --all
--refs` at zero problems and at or above the current annotation count minus
what a legitimate fold removes; declare any decrease with its reasoning. While
in the file: `editor.invariants.md` emits `one category is empty — fine while
bootstrapping` (pre-existing, #122) — resolve it if the fold makes it natural,
otherwise leave it and say so.

Contract-only change. No production code. Positive control: plant a bogus
citation (wrong path) and quote the checker naming it before you trust your
green.

Do not run `scripts/merge-gate.sh`. Commit with
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`. Prose
STE-flavored. Report bycatch explicitly.
