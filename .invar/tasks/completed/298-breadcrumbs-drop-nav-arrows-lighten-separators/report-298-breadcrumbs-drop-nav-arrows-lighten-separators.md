# READY — breadcrumbs: drop navigation arrows and lighten separators

## Result

Commit `e81a0ed47059f71a38d6461aa3d6a4a5f30a153d` completes #298
(breadcrumbs: drop navigation arrows and lighten separators).

- [TabBarRenderer.ts](../../../../src/modules/ui/TabBarRenderer.ts) no longer paints or reserves
  columns for breadcrumb Back and Forward controls.
- [TabBar.ts](../../../../src/modules/ui/TabBar.ts) no longer routes breadcrumb pointer input to
  navigation history. Breadcrumb segment clicks still open the breadcrumb picker.
- Breadcrumb separators now read `palette.dim` from the active theme instead of `palette.border`.
  No color literal was added.
- [smoke-breadcrumb-harness.ts](../../../../scripts/harness/smoke-breadcrumb-harness.ts) drives
  10-line and 100,000-line shared scale fixtures in truecolor. It checks control absence,
  separator foreground, background contrast, improvement over the old token, and a live dark-to-light
  theme switch.
- [behavioral-contracts.sh](../../../../scripts/behavioral-contracts.sh) now gates the new breadcrumb
  contract.

## Driven evidence

Before, the 154-line default drive painted:

`‹ › invar-drive-file-7oSq4Z › Breadcrumb.ts`

After, the same drive painted:

`invar-drive-file-em4H7B › Breadcrumb.ts`

The 100,000-line drive painted:

`invar-drive-fixture-100000-b4sjIA › scale-100000.txt`

The workspace command bar retained `‹ ›` in its own row. The navigation smoke drove both directions
through workspace-bar clicks and through `Alt+[` and `Alt+]`.

## Verification

- `bun test`: 1,940 passed, 0 failed, across 297 files.
- Focused breadcrumb, renderer, navigation, and workspace tests: 26 passed, 0 failed.
- [smoke-tabs-harness.ts](../../../../scripts/harness/smoke-tabs-harness.ts): ALL-PASS.
- [smoke-navigation-history-harness.ts](../../../../scripts/harness/smoke-navigation-history-harness.ts):
  ALL-PASS. Both workspace-bar click directions and both keyboard directions passed.
- [smoke-breadcrumb-harness.ts](../../../../scripts/harness/smoke-breadcrumb-harness.ts): ALL-PASS
  at 10 and 100,000 lines, in dark and live-switched light themes.
- Positive control: restoring `palette.border` made the new smoke fail at
  `10-line dark theme paints the separator with the active theme dim token`, with exit code 1.
  Restoring `palette.dim` returned it to green.
- `bun run typecheck`: passed.
- `bun scripts/check-coverage-ratchet.ts`: passed after
  [project.coverage-deltas.md](../../../../project.coverage-deltas.md) recorded the intentional
  removal of obsolete breadcrumb-button geometry assertions.
- Invariant checker: 1,143 annotations and 220 lattice links resolved, with 0 problems.
- `git commit --amend --no-edit` ran the enforcing pre-commit merge gate on the fixed tree without
  `SKIP_GATE`. The gate ended with `merge-gate: ALL-PASS` and `GATE_EXIT=0`.
- Retry tally: two steps passed only on retry. The scrollbar smoke and panel-split smoke each had a
  first-attempt starvation-class timeout, then passed cleanly on retry. The gate classifies both as
  flakes, not clean first-attempt passes.
- Input-byte ordering passed. Its p50 was 6.532 ms against the report-only 6.406 ms warning line, so
  the gate recorded a non-blocking performance warning.
- `git diff --check`: passed.
- Worktree is clean.

## Invariants

- *Programmatic history navigation does not record new history* remains upheld. The workspace owner
  and keyboard routes still drive both directions.
- *Appearance comes only from theme data* is strengthened. The separator reads the live semantic
  theme token and repaints after a theme change.
- The 10-line and 100,000-line frames have the same breadcrumb behavior.

## Bycatch

None observed.
