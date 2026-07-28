# AppStatusProjection extraction — READY

## Tip

`31be08a39a8c837eb5a05db12755a1e766c44ac1`

Commit: `31be08a refactor(app): extract status projection`

## Files changed

- `src/modules/app/AppStatusProjection.ts` — adds the Static-manifest status projection. It
  assembles and publishes the complete 114-field `StatusChannel` patch.
- `src/modules/app/AppStatusProjection.test.ts` — verifies that optional mouse, narration, and
  agent sources remain live after port wiring and that the active `agentTitle` reaches the
  published snapshot.
- `src/modules/app/Bootstrap.ts` — removes status-snapshot assembly and retains composition,
  hook registration, frame-effect wiring, input wiring, and teardown.
- `src/modules/app/app.invariants.md` — moves the documented read-only status responsibility to
  `AppStatusProjection` and cites its focused test.

## Projection ports

The projection receives narrow read surfaces for:

- `workspaceSet`: active workspace, tabs, active index, count, watcher count, and entries.
- `settings`: workspace-tab position, activity-bar visibility, split ratios, sidebar width,
  narration enablement, voice, and rate.
- `commands`, `findBar`, `quickOpen`, `settingsPanel`, `contextMenu`, `shortcutHelp`, and
  `tooltip`: only the observable overlay/query/selection members used by the snapshot.
- `panelHost`: visibility, focus, active/order/layout cells, focused index, and cell-span
  projection.
- `view`: active Diff/Markdown projections and panel viewport dimensions.
- Live getter ports for `mouse`, `narration`, and `agentPaneContent`, so lazily created or
  subsequently changed state is read at publication time. The agent port includes the live
  `title` used by the identity probe.

## Verification transcript

- `bunx tsc --noEmit` — PASS, no diagnostics.
- `bun test` — PASS: 796 tests, 0 failures, 12,742 expectations across 103 files.
- `bash scripts/smoke-editor.sh` — `RESULT: ALL-PASS`.
- `bash scripts/smoke-agent-engine-switch.sh` — `RESULT: ALL-PASS`; verified `agentTitle` as
  Claude at boot, Codex after switching, Claude after clicking the engine segment, and Codex on a
  Codex-first boot.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` — PASS:
  401 annotations resolved, 38 lattice links resolved, 0 problems.
  `TASK.md` names `scripts/check_invariants.mjs`, but that path does not exist in this checkout;
  the repository-mandated checker under `.claude/skills/invariants/scripts/` was used.
- `bash scripts/conventions-gate.sh` — PASS.
- Structural comparison against `HEAD^` — PASS: all 114 status fields remain in identical object
  order, preserving JSON insertion order for byte-identical frame-dump output.

`scripts/merge-gate.sh` was not run, as required.

## Behavior-change risk

No behavior change was found. The full state cross-product of every overlay, Diff, Markdown,
narration, and agent combination is not exhaustively enumerated by one smoke pair; residual risk is
limited to an unexercised combination. The unchanged 114-field order/default logic, focused live-port
test, full unit suite, and both prescribed driven smokes substantially constrain that risk.
