# READY — Layout distillation round 2 (#58)

## Outcome

The right dock's full-height mode now visibly owns its rows through the command/status boundary.
The bottom panel cannot paint over those rows. The 32 encoded layout permutations have been
replaced by the four requested named presets:

- Default
- Full-height docks
- Centered panel
- Focus

The individual layout settings remain available for fine-tuning, and the menu still uses
`BoundedListPopup`. The requested names fit the resulting behavior; no naming change is recommended.

## Root cause

`LayoutModel.resolve()` correctly gave a full-height right dock the full viewport height, but it
selected the bottom panel's horizontal right edge independently of the dock span. For a panel
alignment reaching the terminal edge, the panel rectangle therefore included the right-dock
columns. `RootView` mounts/paints the bottom panel after the dock, so the panel overwrote the dock's
lower rows and made the full-height setting appear inert.

The previous smoke asserted only that the dock's expected bottom cell was nonblank. The panel border
also satisfied that assertion, so the regression escaped. The driven smoke now checks the exact dock
border byte/cell and exact model edges.

The generator fix keeps every slot in `LayoutModel`: a visible full-height right dock owns its
columns, so the panel ends at the right-dock splitter. An ends-at-panel dock yields those columns to
the panel below its own bottom edge. Hidden docks resolve zero-area slots for either span value.

## Alignment distillation and migration

The real-frame census showed that both legacy `justify` and legacy `left` were phantom choices:
their ranges collapsed onto another alignment in the configurations where they were meant to
differ. Both were removed, leaving `center` and `right`.

Persisted `justify` migrates to `center`, its nearest surviving meaning (panel under the editor).
Persisted `left` also migrates to `center`, so older settings boot without error. The live default
preset configuration proves the surviving values produce pairwise-distinct emulator frames.

## Files

- `src/modules/layout/LayoutModel.ts`
- `src/modules/layout/LayoutModel.test.ts`
- `src/modules/layout/SplitterModel.ts`
- `src/modules/layout/layout.invariants.md`
- `src/modules/settings/Settings.ts`
- `src/modules/settings/Settings.test.ts`
- `src/modules/settings/SettingsPanel.ts`
- `src/modules/ui/CommandBar.ts`
- `src/modules/ui/RootView.ts`
- `src/modules/ui/ui.invariants.md`
- `src/modules/app/AppStatusProjection.ts`
- `src/modules/app/AppStatusProjection.test.ts`
- `src/modules/app/Bootstrap.ts`
- `scripts/harness/smoke-layout-harness.ts`
- `scripts/check-file-grammar.ts`
- `scripts/check-file-grammar.test.ts`

## Verification

All results below are from the final committed tree after rebasing onto the current `origin/main`.

| Check | Result |
|---|---|
| `bun install --silent` and restore `bun.lock` first | PASS |
| `bunx tsc --noEmit` | PASS |
| `bun test` | PASS — 1,278 tests, 0 failures, 15,396 expectations |
| Invariant checker `--all --refs` | PASS — 626 annotations, 39 lattice links, 0 problems |
| `bun scripts/check-file-grammar.ts` | PASS — 0 violations; 23 modules enforced, including layout/ui/settings |
| `bash scripts/conventions-gate.sh` | PASS |
| `bash scripts/smoke-settings-applied.sh --meta` | PASS — every schema field has an applied-effect drive |
| `bun scripts/harness/smoke-layout-harness.ts` | ALL-PASS |
| Right-dock span matrix | PASS — exact full-height/ends-at-panel edges with dock visible and zero-area edges with dock hidden |
| Alignment frame census | PASS — every surviving value pairwise distinct in the Default preset configuration |
| Preset drive | PASS — exact live slot edges for Default, Full-height docks, Centered panel, and Focus |
| Persisted legacy alignment boot | PASS — `justify` migrates to `center` without throwing |
| Rebase/commit verification | PASS — `origin/main` is the direct parent; tracked worktree and index are clean |

## Hashes

- Final tip: `ba11d3a06b67949f6a4d3eb0dfd2f8cc79ee9925`
- Rebased parent (`origin/main`): `f442e1c85bad1ef709a2d0801870d94745ad9af9`
- Ahead/behind at verification: `0 behind / 1 ahead`

