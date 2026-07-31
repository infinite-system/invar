# Task 429 — the layout switcher is an icon with a tooltip

Priority: user-directed
State: COMPLETED — 441ee8d9 — Switcher is a theme icon + tooltip. Semantic merge conflict with #391's smoke wait caught by the combined gate, repaired, layout smoke green in-gate. Gate red was #428's known zero-margin fold-dense floor (995 vs 1000, FPS healthy) — pre-existing, filed.
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high

## User request (2026-07-31, verbatim)

> also layouts switcher should be an icon instead of layouts, icon +
> tooltip

The switcher currently shows the text "layouts". Replace with an
icon; the name moves to the tooltip (the "Go to Line (Alt+G)" pattern
from #388 — include the chord if one exists).

## Boundaries

- Glyph comes from the ThemeIcons vocabulary at all three tiers
  (nerd/unicode/ascii) — never a hard-coded literal (#426's rule;
  "Appearance comes only from theme data").
- Tooltip reads from the effective binding registry if a chord
  exists (#388's pattern).
- Drive at all three tiers; single-cell per the glyph ladder record.
- Extend the relevant chrome/status smoke.
