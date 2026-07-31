# Brief 430-1 — Centered layout: bottom panel spans full width

Read the task file; the user's verbatim report is there. This is the
real defect behind their layout-switch complaint — #391 fixed
splitter coherence, not preset composition.

Work order:
1. Reproduce by DRIVING: open terminal in the bottom panel plus left
   and right panes; switch to the Centered panel preset. Observe the
   bottom panel keeping only the editor's width. Record each preset's
   ACTUAL bottom-panel span (Default, Full-height docks, Centered,
   Focus) in a table.
2. Read the preset/layout composition seam (the preset adapter and
   LayoutModel row composition). Determine where each preset decides
   whether side docks are full-height (docks flank the bottom panel)
   or the bottom panel owns the full row.
3. Fix: in Centered panel layout the bottom panel spans the FULL
   viewport width, under both docks. Default's current behavior
   stays as it is unless it shares the same defect — state what
   Default does today and keep it. Full-height docks keeps its
   deliberate flanking. Say in the report which presets changed.
4. Drive again; the table's after-column shows Centered spanning full
   width; switching between presets and back keeps every span correct
   (no stuck widths — the user's original phrasing).
5. Ratchet: extend smoke-layout-harness.ts preset-cycle checks with
   bottom-panel span assertions per preset (count-based, condition
   waits).
6. Verification: tsc, focused tests, layout smoke, checker
   --all/--refs.

Rules: no merge-gate.sh; no push; commit on the branch; READY report
here with the before/after span table.

## Invariants in scope
- Layout records in [layout.invariants.md](../../../../src/modules/layout/layout.invariants.md) — enumerate those governing row composition / preset spans; answer each. The #391-refined record "A reported size never leaves its configured bounds" must stay upheld.
Refute any missed.

## Bycatch expected
Report per [AGENTS.md](../../../../AGENTS.md) taxonomy; include a ## Bycatch section
even when it reads: None observed.
