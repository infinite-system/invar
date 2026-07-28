# 203 — #196's O(1) keystroke may hold ONLY when nothing is folded

State: DONE — e479b98
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default

## Outline

The suspicion: one collapsed region looks like it forces a **full O(n) wrap rebuild per keystroke**, so
#196's scale-invariance would hold only for unfolded documents. The user confirmed it by driving:

> *"when i fold the level 0 it's slow to load and then slow to edit, in both nested and the
> nested-1m"*

### The fixtures this needed, and why the old ones could not find it

The 500k/1M flat files **do not stress folding at all.** The user named the gap:

> *"the current test with 500k, 1M doesn't test like a huge nested package json with nested folding …
> folding should be in sections bigger than viewport or bigger than a single block stored in this new
> architecture so it stresses the design"*

`scripts/make-nested-fold-fixture.ts` generates JSON whose fold regions straddle **both** the viewport
boundary and the 4096-line block boundary — `nested.json` at 554,490 lines and `nested-1m.json` at
970,356, with level 0 spanning **138,622 lines = 33.8 blocks.** A fold smaller than a block cannot
exercise the block tier; that is the design constraint the fixture encodes.

### The result

- **Fold toggle: 138,621 / 34 / 138,621 rows, identical at both sizes, zero allocations.** Toggles
  PATCH the index instead of rebuilding it.
- **Collapse at 970k: 132 ms → 24 ms.**
- Per-keystroke: 1 row write, zero allocations — **folded as well as unfolded.**

### The regression the user caught, and the rule it produced

> *"the huge.ts without any folds for editing is now also slower … this is important for files like
> logs, they won't have any folding but now will suffer the tax"*

Fixed: **flat first paint 2,417 ms → 645 ms; RSS 1,300 MB → 665 MB.**

> **When work extends a subsystem for a NEW case, re-measure the OLD case.** The flat file paid a tax
> for a capability it never uses, and only driving found it.

### The governing criterion the user set for the whole line of work

> *"the question is complexity — if it complexifies everything downstream or keeps it simple."*

Applied throughout: the block tier was chosen over a Fenwick tree partly because its correctness is
visible by inspection.

### A refuted hypothesis, recorded

The summary for this task has to record that **my stale-coordinate hypothesis was refuted by
measurement** — that is the part a future reader needs and the part an agent's own report has no reason
to emphasise.

## Sources

- `brief-203-1-folded-editing-scale-invariance.md`
- Detail above additionally recovered from the session transcript (`faf7e858-…jsonl`).
