# Brief 426-1 — move the hard-coded dirty glyph into the theme vocabulary

Read the task file in this folder. [TabBarRenderer.ts](../../../../src/modules/ui/TabBarRenderer.ts)
hard-codes the dirty-dot glyph at three sites (about lines 97, 218,
416) — the one breach the record "Appearance comes only from theme
data" ([theme.invariants.md](../../../../src/modules/theme/theme.invariants.md))
acknowledges about itself.

Work:
1. Reproduce by DRIVING first: run the app in the PTY harness, dirty
   a buffer, see the dot in the tab bar. Note the glyph at nerd,
   unicode, and ascii tiers as it renders TODAY.
2. Add the dirty-marker slot to the ThemeIcons interface vocabulary
   with all three tiers (pick tier-appropriate glyphs; keep the
   current look at the current default tier so no visual change at
   default). Consume it at all three TabBarRenderer sites.
3. Delete the breach note from the record; update its Evidence.
4. Drive again at all three tiers (the glyph-tier env/setting the
   ThemeIcons tests use); the dot renders per-tier, single-cell.
5. Verification: existing ThemeIcons + TabBar tests extended for the
   new slot; checker --all/--refs clean; tsc clean.

Rules: no merge-gate.sh; no push; commit on the branch; READY report
here.

End state: report exists; zero hard-coded glyph literals in
TabBarRenderer (grep proof); record breach note gone; drives at three
tiers described.

## Invariants in scope
- "Appearance comes only from theme data" ([theme.invariants.md](../../../../src/modules/theme/theme.invariants.md)) — the breach being closed.
- "The glyph ladder degrades icons single-cell and legible" (same file) — the new slot must obey it.
- "Appearance is data with a capability fallback" ([project.invariants.md](../../../../project.invariants.md)) — tier fallback semantics.
Answer each; refute any missed.

## Bycatch expected
Report per [AGENTS.md](../../../../AGENTS.md) taxonomy; include a ## Bycatch section
even when it reads: None observed.
