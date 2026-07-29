# 196 — 500k editing and loading are both slow in the real app

State: COMPLETED
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default

## Outline

**USER-DIRECTED, TOP PRIORITY.** #169's decline of the editor flyweight is reversed:

> *"editing huge.ts is super slow even not on the widest line, also loading it is slow, so flyweight
> for it is a must, small.ts works fine"*

### Why #169's decline was wrong — a category error

#169 compared **one subsystem's 9 ms against the whole 16 ms frame** and concluded the edit path was
not the problem. **A component budget is not the frame budget.** The user's driving overturned it, which
is the general lesson: a measurement that says "this fits" against the wrong denominator says nothing.

### The invariant it was built against

The **ivue flyweight invariant**: *"Everything costs proportional to what is observed; nothing costs
proportional to what exists."* Measured in ivue: **20,000,000 cells at 4.69 bytes each, +0.3 MB after
30 viewports.**

Its **impossibility boundary** forbids *"an interaction whose cost is O(total cells)"* and *"a full-
document recalculation, ever"* — which the editor was violating on every keystroke.

The user's own reduction, and it is the design:

> *"we don't need fenwick trees, we need to replicate the 20m cell flyweight but without cell
> dependence — which is actually even simpler"*

### The structure

**A block tier instead of a Fenwick tree**: a flat 500,001-entry prefix array becomes **4096-line block
sums plus an exact running total** — 122 blocks at 500k. Document-size-independent cost, with
correctness that is visible by inspection rather than by trusting a tree.

### The contract

**Count-based, not millisecond-based** — a faster machine beats a threshold; nothing beats a count.
Rendered as an **identical per-keystroke array-write count at 2k and at 1M**. Builds on #133's existing
"scale-invariance asserted on load-invariant counts."

Result: **1 row write per keystroke, zero index allocations, size-independent** — verified at 554k and
970k lines, folded and unfolded.

### Bycatch

**#199** — Find reveal paints the target line blank at the bottom of the viewport at 500k (gutter and
cursor correct); pre-existing at merge base.

### A caveat recorded about its own green

The final gate ran at **two workers** after a six-worker run hit pre-existing markdown/fold-density
contention — **so that green is a slightly weaker signal than a full-width run**, and it was reported
that way rather than as an unqualified pass.

## Sources

- `brief-196-1-editor-flyweight-edit-path.md`
- `report-196-editor-flyweight-edit-path.md`
- Detail above additionally recovered from the session transcript (`faf7e858-…jsonl`).
