# 174 — markdown preview omitted a ragged table visible in source

State: TODO
Created: 2026-07-28

## Outline

The markdown preview dropped a ragged table that was present and visible in the source text. Detected as
a missing `| Ragged` preview row.

### Why this one matters more than its sighting count

**It is a HARD failure, not timeout-class, so it does not retry.** Two sightings.

And it holds a unique position in the failure census:

> Of every merge-gate red on 2026-07-27/28 whose cause was CONFIRMED, **all of them were defects in the
> HARNESS, not in Invar.** Five separate harnesses regressed from #168's wait conversion; terminal-stage
> failed eight attempts running on a compound predicate whose subject was visibly on the grid;
> shortcut-help and panel-chrome each timed out on generic waits.
>
> **The single open candidate for a real PRODUCT cause is #174's markdown row.**

That makes it the most valuable open red in the set — not because it is the most frequent, but because
every other confirmed red turned out to be the instrument rather than the app.

### The caveat that keeps it honest

**It passed three merge-base gates.** So "product defect" is the standing candidate, not the finding. It
could still be a presentation-coupling failure in the predicate — which would make it #173's class — and
that has to be separated by measurement rather than assumed either way.

### Do not fold it in

It was explicitly excluded from the timeout-class flake population: *"markdown hard-failed once on a
missing `| Ragged` preview row (not timeout-class, so no retry) — that is #174 and it is a DIFFERENT
class; do not fold it in."*

## Sources

None in this folder. Detail above recovered from the session transcript (`faf7e858-…jsonl`).
