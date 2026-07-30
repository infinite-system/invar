READY

# #322 (status editor-column content stale in preview)

Commit: `c1448fb5dc4e1923e7db289fe549ea8d0303246f`

The worktree is clean. The enforcing commit hook printed `GATE_EXIT=0`.

## Result

[AppStatusProjection.ts](../../../../src/modules/app/AppStatusProjection.ts)
now derives surface-specific status from the painted content set.

- `editorColumnContent` publishes the occupying editor-surface claim. It
  returns to `source-text-editor` when no claim occupies the column.
- The terminal fields publish terminal state only when a terminal cell is
  painted. A media or agent panel no longer masquerades as a terminal.
- Generic panel state now uses `panelVisible`, `panelFocused`,
  `panelColumns`, and `panelRows`. Existing panel smoke consumers no longer
  use terminal-named fields for agent state.
- The stale “Bottom panel / terminal state” comment now states the actual
  terminal-only rule.

## Driven evidence

Before the change:

- Preview-only mode painted only the Markdown preview and published
  `editorSurfaceIdentifier="markdown.preview"` with
  `editorColumnContent="source-text-editor"`.
- The 3D demo occupied the panel while terminal fields described the host
  panel.

After the change:

- The real PTY drive at 100x30 published
  `editorColumnContent="markdown.preview"` and
  `editorSurfaceIdentifier="markdown.preview"` in preview-only mode.
- Returning to editor mode restored
  `editorColumnContent="source-text-editor"` and an empty
  `editorSurfaceIdentifier`.
- [smoke-markdown-view-mode-harness.ts](../../../../scripts/harness/smoke-markdown-view-mode-harness.ts)
  passed at 10 and 100,000 Markdown lines.
- [smoke-media-harness.ts](../../../../scripts/harness/smoke-media-harness.ts)
  passed the 100x30 3D demo arm. The active `media-demo` published false,
  false, zero, and zero for the four terminal fields.
- The terminal return path and the preview return path pass in
  [AppStatusProjection.test.ts](../../../../src/modules/app/AppStatusProjection.test.ts).

## Positive controls

- Planting the old fixed `source-text-editor` value failed the focused test:
  expected `markdown.preview`, received `source-text-editor`.
- Planting host visibility as `terminalVisible` failed the focused test:
  expected false for `media-demo`, received true.

Both plants were removed before the commit.

## Contract review

- [Rendering is one coarse frame effect](../../../../src/modules/app/app.invariants.md#rendering-is-one-coarse-frame-effect):
  upheld. The projection remains a read-only snapshot. It adds no effect and
  no per-row work.
- [Boot checks ivue static getter caching](../../../../src/modules/app/app.invariants.md#boot-checks-ivue-static-getter-caching):
  upheld and untouched. The change does not add or alter a `$` getter.
- [The panel renders exactly the visible pane content cells each frame](../../../../src/modules/ui/ui.invariants.md#the-panel-renders-exactly-the-visible-pane-content-cells-each-frame):
  upheld. Status now reads the same resolved cell set that the panel paints.
- Contract gap: no record says that status fields describe the painted
  surface. Add an app observability record named “Status describes the
  painted surface”. Its mechanism should bind status projection to editor
  claims and resolved panel cells. The app contract is the right home because
  [AppStatusProjection.ts](../../../../src/modules/app/AppStatusProjection.ts)
  is the shared projection seam. No new lattice is needed for this one seam.

## Verification

- `bunx tsc --noEmit` — exit 0.
- `bun test` — 2,027 tests passed in the enforcing hook.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`
  — 0 problems.
- `bash scripts/conventions-gate.sh` — PASS.
- Commit hook merge gate — ALL-PASS, `GATE_EXIT=0`.
- The hook ran all 64 parallel-safe PTY smokes and the serial tail. Two
  starvation-class retries passed on their one allowed retry:
  scrollbars and panel split.

## Bycatch

- The first full `bun test` pass saw a transient Structure pane message,
  “No file is open.”, beside an open 3,352-line Markdown file in
  `Drive.test.ts`. The focused test passed on the second observation. Not
  fixed.
- One commit-hook run failed twice while the panel-chrome smoke closed
  “Terminal 2”. The same harness passed alone immediately afterward and
  passed without retry in the green hook. Not fixed.
- The green hook recorded starvation retries in the scrollbars and panel
  split smokes. Both passed on the gate’s one allowed retry. Not fixed.

## Round 2 — combined-tree merge

Merge commit: `813bc7f38a80b5fce5b17faf9cf7def40f36a903`

The merge combines this task with main at
`e57752cd274c9c04ce93ceac20479d8ecbd8283a`. The conflict in
[AppStatusProjection.test.ts](../../../../src/modules/app/AppStatusProjection.test.ts)
was classified against merge base
`c229593595fb66dce4f894d3dd5e92776006c5b9`. This task added surface-truth
assertions. Main added quit-confirmation fixtures and assertions. The
resolution keeps both disjoint changes.

The focused test passed with 75 assertions. The merge commit hook ran the
combined tree and printed `GATE_EXIT=0`. All 65 parallel-safe PTY smokes and
the serial tail passed without a retry.

The combined tree upholds the same records:

- [Rendering is one coarse frame effect](../../../../src/modules/app/app.invariants.md#rendering-is-one-coarse-frame-effect):
  upheld. Quit confirmation and surface status remain read-only inputs to the
  same projection.
- [Boot checks ivue static getter caching](../../../../src/modules/app/app.invariants.md#boot-checks-ivue-static-getter-caching):
  upheld and untouched by the resolution.
- [The panel renders exactly the visible pane content cells each frame](../../../../src/modules/ui/ui.invariants.md#the-panel-renders-exactly-the-visible-pane-content-cells-each-frame):
  upheld. Terminal status still derives from resolved panel cells.

### Round 2 bycatch

- The first merge-hook attempt reproduced #214 (panel-chrome agent close
  intermittent): the “Agent 2” list close timed out twice. The next complete
  hook passed panel chrome without a retry. Not fixed.
- The green hook reported an input-byte-flush p50 of 13.050 ms and a
  sustained-shift warning against the 4.928 ms reviewed baseline. The check is
  report-only. Not fixed.
