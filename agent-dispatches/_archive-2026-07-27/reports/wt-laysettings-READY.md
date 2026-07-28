# READY — fix-layout-settings-inert

## Defect mechanism

- **(a) confirmed for panel alignment.** `LayoutModel` first selected the requested left/center/right/justify edges, then clipped those edges around full-height docks. In the default configuration this collapsed multiple alignment values to identical geometry, so valid settings writes produced no meaningful visible change.
- **(b) ruled out.** `RootView` late-reads the live settings references when synchronizing layout geometry; the values were not constructor-cached.
- **(c) ruled out.** The render/update path already reran layout synchronization after settings changes.
- **Right-dock span:** the live setting worked when both the right dock and bottom panel were visible, but a hidden right dock retained a nonzero-height invisible slot and the Settings UI did not disclose when span edges necessarily coincide. Hidden right docks now resolve to zero area, visible spans move immediately, and the labels state the visibility prerequisites.

## Files

- `src/modules/layout/LayoutModel.ts` — made panel alignment own its exact horizontal edges independently of dock spans; made hidden right-dock geometry zero-area.
- `src/modules/layout/LayoutModel.test.ts` — added the full sidebar-side × dock-visibility × left-span × right-span × alignment geometry matrix.
- `src/modules/layout/layout.invariants.md` — specified exact alignment generation, independent visible dock spans, and zero-area hidden dock behavior.
- `src/modules/settings/SettingsPanel.ts` — disclosed coincident alignment edges and dock/panel visibility prerequisites.
- `scripts/harness/smoke-layout-harness.ts` — drives every combination through the real Settings UI and checks byte-level slot edges plus painted emulator-frame boundaries while preserving the existing splitter/dock checks.

## Verification

| Check | Result |
|---|---|
| `bunx tsc --noEmit` | PASS |
| `bun test` | PASS — 1,100 tests, 15,042 expectations |
| `bun .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` | PASS — 586 annotations, 39 lattice links, 0 problems |
| `bun scripts/check-file-grammar.ts` | PASS — 303 TypeScript files; no module added to `CONVERTED_MODULES` |
| `git diff --check` | PASS |
| `bun scripts/harness/smoke-layout-harness.ts` | ALL-PASS on a quiet machine — 64 live Settings combinations, exact semantic edges, painted-frame edges, and existing layout/splitter/dock checks |
| `bun scripts/harness/smoke-settings-applied-harness.ts` | ALL-PASS — all 34 schema fields retain an applied-effect drive |
| `bun scripts/harness/smoke-voice-picker-harness.ts` | ALL-PASS — keyboard and mouse Settings editing |
| Rebase/fetch audit | PASS — rebased onto current `origin/main`; branch is ahead 1, behind 0 |
| Full merge gate | Not run, as required by the task protocol; conductor owns the gate |

## Tip

`e0641537b42d4ccd509d35801ffa78061d6ca9d0`
