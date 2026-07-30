# Brief #404 round 1 — panel chrome v2

Read the task file in this folder FIRST: it carries the user's verbatim
request and the conductor's decomposed spec. The verbatim wins over the
decomposition — refute the reading where the words disagree.

## Method

1. Drive the CURRENT panel first (the #346+#387 landed state) so the
   delta is concrete: tabs+actions+pad+drag+controls on one row.
2. Build the two-row structure at the existing generators: PanelTabBar
   owns both rows' projection (one projection, two row outputs) or a
   sibling projection — census first, keep ONE source for paint+hit per
   row (the tab-bar record's rule). LayoutModel gains one panel chrome
   row (the panel body loses one row — check minimum-height interplay
   with "An unexpanded bottom panel leaves one editor row").
3. Iterate by driving, one surface at a time: splitter-row icons (wrap,
   go-to-line, NEW go-to-bottom — wire through the command registry;
   check a go-to-bottom command exists, add if not), then the tab row
   (close buttons, the blank cell before each close, ellipsis
   truncation), then the pane-level + (space picker limited to
   Terminal / AI Agent (Claude) / Invar Agent — the agent content must
   be addable inside a terminal space), then the sticky resizable pane
   list with persistence.
4. Contracts AFTER each surface reads right: exact-cell assertions
   (close glyph presence + the blank cell, ellipsis on narrow, two-row
   order), grab assertions unchanged for the drag span, pane-list pin
   persists across a workspace switch and a relaunch, lower-level +
   creates a pane in the SAME space (space count unchanged, pane count
   +1). Positive controls for the new assertion families.

## Boundaries

- Do not regress: slim marks (#387), pad cell (#387), workspace scoping
  and auto-cycle (#346), bracketless affordances (#384), idle
  quiescence (#380/#393 — a second chrome row must not add timers).
- Ellipsis truncation must keep tab hit geometry == painted cells.
- Commit BEFORE READY; report into the main checkout's in-progress
  folder for this task; header carries commit hash + GATE_EXIT read
  from the hook. Full gate; expect merge-forward rounds if main moves.

## Invariants in scope

- Tab bars share paint and hit geometry — [src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md)
- Splitter paint and hit testing share one geometry — [src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md)
- An unexpanded bottom panel leaves one editor row — [src/modules/layout/layout.invariants.md](../../../../src/modules/layout/layout.invariants.md)
- Layout slots derive from one configuration — [src/modules/layout/layout.invariants.md](../../../../src/modules/layout/layout.invariants.md)
- Each workspace owns one panel world; workspace persistence records — [src/modules/workspace/workspace.invariants.md](../../../../src/modules/workspace/workspace.invariants.md)
- The #346-refined panel records (management list mirror, persisted space+pane sequences, pane regions) — [src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) — several will REFINE again (two rows, sticky list); propose wordings.
- Plugin panes use the shared pane and popup hosts — [src/modules/plugins/plugins.invariants.md](../../../../src/modules/plugins/plugins.invariants.md) — the agent-inside-terminal-space composition must ride the host, not a special case.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy; carry the section even when it reads None
observed.
