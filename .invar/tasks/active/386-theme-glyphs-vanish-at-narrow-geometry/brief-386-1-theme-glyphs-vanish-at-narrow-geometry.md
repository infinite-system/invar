# Brief #386 round 1 — every theme glyph vanishes at 120x36; find the geometry gate

codex auto-reads [AGENTS.md](../../../../AGENTS.md). Reason with IBR.

## The task

Read the task file: at 120x36 ALL theme-owned glyphs vanish (cycle,
file-tree, status, task action) while 150x40 paints them — both Unicode
and ASCII tiers, reproduced twice in #375's drive. Counts/projection
stay correct, so layout lives; only glyph cells blank. Likely the deeper
generator of the user's invisible-attach-icon field report (his window
is narrower than 150 cols).

## Method — drive first

1. Reproduce: the #375 completed folder's drive at 120x36 vs 150x40.
   Read the actual glyph cells (blank vs painted) at both.
2. Bisect the geometry: find the threshold width/height where glyphs
   vanish — a single number points straight at the gate (a breakpoint,
   a truncation, a width budget).
3. Find WHERE geometry gates theme glyph resolution (theme glyph ladder?
   a per-column budget? an icon-column collapse?). Fix so glyphs paint
   at every geometry the layout itself supports.
4. Assert glyph cells non-blank at BOTH geometries in the dashboard
   smoke (extend, no new smoke). Positive control: re-plant the gate,
   see red.
5. Check theme.invariants.md's glyph-ladder record — refine it if it
   never states geometry-independence.

## Rules

No merge-gate.sh by hand; no SKIP_GATE; commit through the hook; commit
BEFORE writing READY; real hash + GATE_EXIT in the report header; report
to the main-checkout task folder (absolute path). Known flaky classes:
#214, #359, #362, #364, #371, #385. Name, do not chase. Never push.

## Invariants in scope

theme.invariants.md glyph-ladder record + any dashboard/activity-bar
records naming glyphs. Answer record by record; list missed records.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md) taxonomy; ## Bycatch always, even "None observed."

## Definition of done

READY report in this folder, standard naming (report prefix, number 386,
the task slug, md extension): the threshold number, the gate mechanism,
fix with both-geometry proof, record refinement if owed, gate chain,
invariants answered, bycatch.
