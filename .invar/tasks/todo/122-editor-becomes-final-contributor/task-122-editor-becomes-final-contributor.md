# 122 — the editor becomes the final contributor

State: TODO — blocked, strictly after #114
Created: 2026-07-28
Engine: claude
Environment: linux
Model: opus-5
Effort: high
Priority: architecture-hygiene
Assignment note: Capstone extraction, strictly after #114.

## Outline

The capstone of the modularity extraction: the source-text view stops being a privileged built-in and
becomes an ordinary contributor that happens to occupy the editor column by default.

### The measurement that defines "done"

Host references per module, from the extraction census:

| module | host references |
| --- | ---: |
| `modules/git/` (extracted by #96) | 0 |
| `modules/lsp/` at the cut | 4 |
| `modules/lsp/` after #114 Wave A | **0** |
| `modules/terminal/` (Wave B, untouched) | 4 |
| `modules/editor/` (this task, untouched) | 4 |

Four host files still know about the editor specifically. Done means zero, by the same standard git and
LSP already meet.

### Sequencing, and why it is strict

**#114 first, then #122, then #35** (structure navigator pane — the proof that a NEW citizen needs no
host change). The order is not preference. #114 establishes the three plugin kinds and the contribution
seam; extracting the editor before that seam exists means inventing a private one for the hardest case
and then rewriting it. #35 after, because a new plugin landing with zero host edits is the only real
evidence that the seam generalises — doing it before the editor is extracted proves it only for easy
cases.

### What unblocked it

An observation-priced wrap index (the flyweight work, #196/#203) is what this was actually waiting on.
While the editor's cost was proportional to document size, it needed privileged treatment the seam
could not express. Once cost is proportional to what is observed, the editor is an ordinary citizen and
the capstone is reachable.

## Sources

None in this folder. Detail above recovered from the session transcript (`faf7e858-…jsonl`),
where the host-reference census and the sequencing decision were both recorded.
