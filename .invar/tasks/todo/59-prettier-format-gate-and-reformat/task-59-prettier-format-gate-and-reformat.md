# 59 — prettier on commit, format gate, one-shot reformat

State: TODO — deliberately LAST
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default
Priority: architecture-hygiene

## Outline

80-char width, uniform indent, a `--check` gate step, and a one-shot whole-repo reformat.

### The honest division of labour

Prettier does NOT own all of this, and the split was corrected once already:

- **Prettier owns** width, indent, quotes, trailing commas. This part landed and runs on every commit.
- **The grammar checker owns file SHAPE**, including the blank-line-between-top-level-declarations
  rule. Prettier cannot do that one: it *preserves* existing blank lines (collapsing 2+ into 1) but
  never *inserts* them. The grammar checker already enforces the sequence
  `imports → class → namespace → interface`, so "one blank line between top-level declarations" is a
  natural rule beside it — with a failure fixture, so the shape is enforced rather than conventional.
- **The mechanical inserter** runs inside the same one-shot reformat commit that turns on gate
  enforcement for both.

One landing, blame-ignored (`.git-blame-ignore-revs`).

### Why it is last

It touches every file. Sequenced after the feature tracks so nobody rebases through a whole-repo diff,
and it would collide with everything above it. This is a deliberate ordering, not neglect — it has been
re-confirmed as "last by design" more than once.

### Gate context

The `--check` step joins the existing gate alongside `tsc`, the settings-meta applied-effect check, and
the invariant-contract structure/refs checks. Prettier's formatting already arrives via the commit
hook; the gate step is what makes it non-bypassable.

## Sources

None in this folder. Detail above recovered from the session transcript (`faf7e858-…jsonl`).
