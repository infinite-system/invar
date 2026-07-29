# 221 — the record "The editor owns no view state" has no citing annotation

State: IN-PROGRESS
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default
Priority: verification-integrity

## Outline

Bycatch from #218, verified pre-existing (the builder checked against a stash of
its own changes). The invariant record *The editor owns no view state* has no
citing annotation anywhere, so the checker reports it as a coverage gap. A
record nobody cites is a claim nothing enforces — the same class as an unrun
smoke.

Timing makes it worth doing now: #218 just recorded *Fold state is
document-adjacent persistence, not a view property* in `project.decisions.md`,
which is the same claim from the other side. Either the old record is true and
should be cited from the code that upholds it (the fold-state seam, the
dehydration path), or it no longer says anything the newer records do not, and
should be folded into them with the lattice updated. Read before choosing.
Zero problems from the checker afterward, citations root-relative.

## Sources

- `report-218-workspace-buffer-splits-document-from-view.md` in #218's folder,
  Bycatch.
