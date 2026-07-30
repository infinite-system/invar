# Brief #409 round 1 — layouts must fill available space

Read the task file (user verbatim). Method:

1. Reproduce by DRIVING: enumerate the layout-switch paths (layout
   presets/commands — find them by census), switch away and back to
   default at 2-3 geometries, capture the frame with the blank region
   under the right panel. Identify which slot owns the blank cells
   (nobody = the defect).
2. Fix at LayoutModel.resolve / the switch path: a configuration change
   re-resolves against CURRENT geometry; the tiling must be total.
   Do not touch the panel chrome files task 404 is rebuilding
   (PanelTabBar/PanelHost) — this is slot arithmetic, not chrome.
3. Contract: a TILING assertion — every cell of the terminal belongs to
   exactly one painted slot after every layout switch (count-based:
   sum of slot areas == rows*cols, no overlap), driven across the
   switch paths at both scales. Positive control.
4. Commit BEFORE READY; report into the main checkout's in-progress
   folder; header carries commit hash + GATE_EXIT read from the hook.

## Invariants in scope

- Layout slots derive from one configuration — [src/modules/layout/layout.invariants.md](../../../../src/modules/layout/layout.invariants.md) — the anchor; likely REFINES to state total tiling.
- Each dock stays a bounded minority of the row — [src/modules/layout/layout.invariants.md](../../../../src/modules/layout/layout.invariants.md) — landed today (#390); your fix must not disturb the bounds.
- Expanded panel overrides only the editor center rows; An unexpanded bottom panel leaves one editor row — [src/modules/layout/layout.invariants.md](../../../../src/modules/layout/layout.invariants.md).

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy; carry the section even when it reads None
observed.
