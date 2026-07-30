# #346 — bottom panel gets a workspace-scoped tab bar of content spaces

State: ACTIVE
Priority: user-directed
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high

## The request (user, 2026-07-30, verbatim intent)

1. Terminal panes in the bottom panel LOSE their per-pane title line (the
   "> title" row at the top of each pane). No titles at all.
2. The line above the terminals (before the top separator) becomes a TAB
   BAR: tabs for different terminal SPACES within the current workspace.
   Workspace-scoped: each workspace has its own tab set, separate from
   other workspaces.
3. The user cycles tabs manually, OR tabs auto-cycle on an interval. The
   settings panel gets interval + play toggle ON THE SAME LINE.
4. Tabs are GENERIC content slots, not terminal-only: another plugin can
   occupy a tab. Concretely: the Database plugin appears as a tab — the bar
   reads "Terminal  Database". The user can add more spaces: "Terminal 2",
   "Database 2", or something else entirely.

## Conductor notes (existing seams to build on, not re-implement)

- The panel already cycles contents: panel.contentsPrevious / panel.contentsNext
  keybindings (context 'panel') and panelContentOrder in settings. The tab
  bar is the VISIBLE face of that existing content-slot model — extend it,
  do not build a parallel one (seam rule).
- PanelHost owns cells/headings (panelHeadingGeometry in status). Removing
  per-pane titles interacts with #214's panel-chrome close-control census and
  the heading close glyphs — where do close controls live once titles go?
  Propose: on the tabs themselves.
- tasksDashboardCycleSeconds already models an auto-cycle interval setting —
  mirror its shape for the tab-cycle setting pair.
- Workspace scoping: WorkspaceSet entries each preserve cold state; the tab
  set rides the workspace, like editor/tree state does.
- The dashboard-motion rule generalizes: auto-cycle timer runs ONLY while
  the panel is visible and play is on (idle quiescence contract).

## Open design points for the builder to propose (not decide silently)

- Where "add a space" lives (a + tab? context menu? command palette?).
- What happens to the panel split (Ctrl+Shift+S agent|terminal split) when
  tabs exist — a tab shows one space; does split live inside a space?
- Migration of existing panelContentOrder ids into per-workspace tab sets.

## Addendum (user, same session): right-side pane list collapses

5. The pane list on the right side of the panel becomes HIDDEN by default.
   On the tab row's right end, show only a count chip (e.g. "3") — and only
   when MORE than 2 panes exist (for terminals). Clicking the chip expands
   the list from the right side to what it is today; clicking away (or the
   chip again) collapses it back.
6. The DEFAULT view is exactly two panes side by side. The workspace's
   .invar/tasks.json folderOpen tasks fill them: "Claude" in the LEFT pane,
   "Terminal" in the RIGHT pane (declaration order = left-to-right). This
   depends on #342 (tasks.json panes must load at all) — sequence #342
   before or into this task's verification.

7. The count chip carries an ICON plus the number, not a bare digit — a
   panes/stack glyph (e.g. ▦ or ☰ family; pick what reads at one cell and
   has an ASCII-tier fallback). Make it look deliberate: icon + count as one
   chip, hover highlight consistent with the tab hover treatment.

8. Close buttons SURVIVE the title removal (user, same session): each
   terminal pane keeps its close control for ease of use even though the
   title line goes. Builder proposes where it sits without the title row —
   likely on the pane's tab, or a corner glyph on the pane itself. This
   resolves the open question from the conductor notes ("where do close
   controls live once titles go") in favor of keeping them visible.
