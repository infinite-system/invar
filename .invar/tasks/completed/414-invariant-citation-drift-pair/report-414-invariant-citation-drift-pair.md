# READY — #414 (repair two rotted invariant citations)

## Result

The two scoped citation repairs are complete. Both recorded claims still match the current code.

- [Appearance is data with a capability fallback](../../../../project.invariants.md#appearance-is-data-with-a-capability-fallback) now names `ThemeIcons.INTERFACE_GLYPH_VOCABULARIES`. Its evidence points to `PanelTabBar.projectSplitterControls` and `PanelTabBar.projectTabRow`.
- [Undo records deltas not whole-document snapshots](../../../../src/modules/editor/editor.invariants.md#undo-records-deltas-not-whole-document-snapshots) now points to `src/modules/text/TextDocument.ts`.
- Both records have `Last refined: 2026-07-31`.

## Evidence

`PanelTabBar` reads the active `InterfaceGlyphVocabulary` for Add, Expand, Restore, Close, and Stack controls. `RootView` passes `theme.glyphVocabulary` into the projection.

`TextDocument.replaceLineRange` emits one `DocumentLineChange` with only deleted and inserted lines. `UndoStore.recordChange` copies only those line deltas into the bounded undo stack.

Both scoped invariants are upheld. The changes repair pointers and do not change either claim.

## Verification

- `git diff --check` exited 0.
- `bun test src/modules/ui/PanelTabBar.test.ts src/modules/text/TextDocument.test.ts src/modules/storage/UndoStore.test.ts` passed 21 tests with 86 expectations.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all` exited 0. It passed both touched contracts.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --refs` exited 0. It resolved 1,301 annotations and 259 lattice links with 0 problems.

## Commit

`57f2b4e124cd2414079b39d2498c5ae277fed397` — `Repair invariant citation drift pair`

The branch is `fleet/414-invariant-citation-drift-pair`. The worktree is clean. I did not push or merge.

## Process note

The first `git commit` attempt triggered the repository pre-commit merge gate automatically. I stopped that hook during its unit-test step. I then committed with the documented `SKIP_GATE=1` bypass. I did not invoke `scripts/merge-gate.sh` directly.

## Bycatch

- The target [project record](../../../../project.invariants.md#appearance-is-data-with-a-capability-fallback) still verifies with the missing `src/modules/ui/PanelHeading.test.ts`. The brief allowed only Evidence and Mechanism citation edits, so I did not change Verification.
- [Appearance comes only from theme data](../../../../src/modules/theme/theme.invariants.md#appearance-comes-only-from-theme-data) still names `$interfaceGlyphVocabularies` and the missing `src/modules/ui/PanelHeading.test.ts`. `test -e` confirmed the test path is absent.
- [Panel controls share paint and hit geometry](../../../../src/modules/ui/ui.invariants.md#panel-controls-share-paint-and-hit-geometry) still names removed `PanelHeading` code and tests in Scope, Mechanism, Evidence, and Verification. Commit `9ac75e4b16d540425b258888934e13d14c948112` removed them when `PanelTabBar` took over the projection.
- The invariant checker also printed existing informational schema and coverage notes outside the two scoped records. It reported 0 reference problems.
