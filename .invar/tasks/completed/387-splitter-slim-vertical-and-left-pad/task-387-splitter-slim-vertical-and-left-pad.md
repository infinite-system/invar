# #387 — vertical splitter slims to match; horizontal splitter gains a left pad cell

State: COMPLETED — 69ca67ed — slim splitters on both axes everywhere; pad cell before the bottom drag span
Priority: user-directed
Engine: claude
Environment: linux
Model: opus-5
Effort: medium

## The request (user, 2026-07-30 ~09:1x, verbatim intent)

1. The slim centered horizontal splitter (#345's U+2501) is liked. Check
   whether the slim treatment works for the VERTICAL splitter too — the
   vertical one is currently fatter. Candidate: heavy vertical U+2503
   (the axis sibling of U+2501). Drive both; if the slim vertical reads
   well, adopt it — the "equal visual weight between axes" record then
   holds with the slim pair.
2. The bottom horizontal splitter gets ONE blank cell before it starts on
   the LEFT — 1-cell padding, which also creates a 1-cell space between
   the go-to-line icon and the splitter.

## Boundaries

- Drag hit-areas must not shrink: the pad cell and the slim glyph change
  PAINT, not the grab geometry (renderer and hit-tester share one
  geometry — the #344 rule). Assert grab still works at the pad cell/
  edges.
- #345's record refinement covered the horizontal swap; the vertical
  adoption refines the same record — propose wording.
- Check the #373 border-hole task's territory is untouched (different
  defect, same neighborhood — do not chase).

## Scope widening (user, same day)

"if thinner vertical splitter works, apply that splitter everywhere in the
app" — on a positive verdict for the slim vertical, sweep EVERY splitter
surface (panel splits, editor splits, bottom panel, any sidebar) to the slim
pair. Enumerate the splitter paint sites first (census, not memory); one
shared painter is the preferred shape if the sites duplicate.
