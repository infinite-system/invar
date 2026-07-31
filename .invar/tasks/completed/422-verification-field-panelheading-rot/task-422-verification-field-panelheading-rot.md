# Task 422 — three records still name removed PanelHeading artifacts

Priority: architecture-hygiene
State: COMPLETED — ea808dcb — Repointed the three PanelHeading-rotted records to PanelTabBar-era artifacts; UI geometry record re-derived. Contract-only; checker green. Bycatch converted to #423 (class-closing sweep) before landing.
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high

## Source

#414 bycatch (codex, 2026-07-31). Builder evidence verbatim:

1. "Appearance is data with a capability fallback"
   ([project.invariants.md](../../../../project.invariants.md)) —
   Verification still names the missing
   src/modules/ui/PanelHeading.test.ts (#414's brief allowed only
   Evidence/Mechanism edits, so Verification kept the rot).
2. "Appearance comes only from theme data"
   ([theme.invariants.md](../../../../src/modules/theme/theme.invariants.md))
   still names $interfaceGlyphVocabularies and the same missing test.
   Builder confirmed absence with test -e.
3. "Panel controls share paint and hit geometry"
   ([ui.invariants.md](../../../../src/modules/ui/ui.invariants.md))
   names removed PanelHeading code and tests across Scope, Mechanism,
   Evidence, and Verification. Commit 9ac75e4b removed them when
   PanelTabBar took over the projection.

## Work

Re-resolve every rotted field to the PanelTabBar-era artifacts, per
the invariants skill's deletion guard: the artifacts were superseded,
not the claims — repoint, never demote. Checker --all and --refs
clean after.
