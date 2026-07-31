# READY — PanelHeading verification-field rot

## Outcome

Task #422 (PanelHeading verification-field rot) is ready.

The change repoints three records from removed `PanelHeading` artifacts to the current `PanelTabBar` implementation:

- [Appearance is data with a capability fallback](../../../../project.invariants.md#appearance-is-data-with-a-capability-fallback) now verifies `PanelTabBar.test.ts`.
- [Appearance comes only from theme data](../../../../src/modules/theme/theme.invariants.md#appearance-comes-only-from-theme-data) now names `INTERFACE_GLYPH_VOCABULARIES` and verifies `PanelTabBar.test.ts`.
- [Panel controls share paint and hit geometry](../../../../src/modules/ui/ui.invariants.md#panel-controls-share-paint-and-hit-geometry) now describes the two-row `PanelTabBar` projection and its `RootView` consumers.

The UI record now describes content-container tabs instead of removed pane headings. Its evidence and verification fields name only current files.

## Evidence

[ThemeIcons.ts](../../../../src/modules/theme/ThemeIcons.ts) owns `INTERFACE_GLYPH_VOCABULARIES`. Its public resolvers select semantic glyphs by capability tier.

[ThemeIcons.test.ts](../../../../src/modules/theme/ThemeIcons.test.ts) checks the semantic interface slots at the nerd, Unicode, and ASCII tiers.

[PanelTabBar.ts](../../../../src/modules/ui/PanelTabBar.ts) returns paint text and half-open hit ranges from one projection. [RootView.ts](../../../../src/modules/ui/RootView.ts) paints that projection and uses its `*AtColumn` methods for pointer input.

[PanelTabBar.test.ts](../../../../src/modules/ui/PanelTabBar.test.ts) checks both rows, close hit bounds, narrow clipping, controls, and drag width.

This task changed contracts only. It did not change runtime behavior, so PTY driving and scale probes did not apply.

## Verification

- `bun test src/modules/theme/ThemeIcons.test.ts src/modules/ui/PanelTabBar.test.ts src/modules/ui/PanelAddPopup.test.ts` passed with 31 tests and 381 expectations.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all` exited 0.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --refs` exited 0. It resolved 1,301 annotations and 259 lattice links with 0 problems.
- `git diff --check` passed.

The pre-commit hook started the merge gate automatically during commit. The hook passed and created the commit. I did not invoke `scripts/merge-gate.sh` as a task verification command.

## Commit

`934732fd49389469df5bdb3db267cf40cdec27d2` — `Repoint PanelHeading records to PanelTabBar (#422)`

## Bycatch

- [The glyph ladder degrades icons single-cell and legible](../../../../src/modules/theme/theme.invariants.md#the-glyph-ladder-degrades-icons-single-cell-and-legible) still names `$interfaceGlyphVocabularies` in Mechanism and Evidence. The current symbol is `INTERFACE_GLYPH_VOCABULARIES`. Source inspection reproduced this once. I did not change this out-of-scope record.
- [The panel contents list mirrors open content](../../../../src/modules/ui/ui.invariants.md#the-panel-contents-list-mirrors-open-content) still names `panel-heading close` and `panel headings` in Mechanism and Generates. `PanelHeading` was removed in commit `9ac75e4b16d540425b258888934e13d14c948112`. Source inspection reproduced this once. I did not change this out-of-scope record.
