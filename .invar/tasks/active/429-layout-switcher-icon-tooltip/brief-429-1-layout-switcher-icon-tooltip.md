# Brief 429-1 — layout switcher becomes icon + tooltip

Read the task file; the user's request is verbatim there.

Work order:
1. Drive first: find the "layouts" switcher in the real app; note
   where it renders and its current hit geometry.
2. Add a layout-switcher slot to the ThemeIcons vocabulary at all
   three tiers (single-cell, ladder-legible). No hard-coded glyph
   literals anywhere ("Appearance comes only from theme data").
3. Replace the text with the icon; the name (and chord, if the
   switcher has a binding) moves to the tooltip via the effective
   binding registry ("Go to Line (Alt+G)" pattern).
4. Hit geometry stays correct after the width change (paint and hit
   from one projection — the PanelTabBar-era rule).
5. Drive at nerd/unicode/ascii tiers; extend the relevant chrome
   smoke with condition waits; planted-defect red proven.
6. Verification: tsc, focused tests, smoke, checker --all/--refs.

Rules: no merge-gate.sh; no push; commit on the branch; READY report
here. NOTE: #391 (splitter bounds) is live in another worktree
touching src/modules/layout — stay out of layout model files; the
switcher UI + theme vocabulary is your surface. If the seam forces a
layout-model edit, STOP and report instead.

## Invariants in scope
- "Appearance comes only from theme data" and "The glyph ladder degrades icons single-cell and legible" ([theme.invariants.md](../../../../src/modules/theme/theme.invariants.md)).
- "Panel controls share paint and hit geometry" ([ui.invariants.md](../../../../src/modules/ui/ui.invariants.md)).
Answer each; refute any missed.

## Bycatch expected
Report per [AGENTS.md](../../../../AGENTS.md) taxonomy; include a ## Bycatch section
even when it reads: None observed.
