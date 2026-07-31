# Task 426 — TabBarRenderer hard-codes the dirty glyph, breaching theme-only appearance

Priority: architecture-hygiene
State: COMPLETED — 5b761903 — Theme contract's one known breach closed; vocabulary slot at three tiers, driven at each; no visual change at the default tier. Bycatch: none actionable (single unreproduced keystroke drop; known checker notes).
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high

## Source

#423 bycatch (codex, 2026-07-31), reproduced once by source
inspection: [TabBarRenderer.ts](../../../../src/modules/ui/TabBarRenderer.ts)
hard-codes a dirty-dot glyph at lines 97, 218, and 416. The record
"Appearance comes only from theme data"
([theme.invariants.md](../../../../src/modules/theme/theme.invariants.md))
already acknowledges this as its one known breach.

## Work

Move the glyph into ThemeIcons vocabulary (all three tiers), consume
it in TabBarRenderer, delete the breach note from the record, drive
the tab bar at nerd/unicode/ascii tiers, checker clean.
