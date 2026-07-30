# READY #390 — both dock groups stay narrower than the editor

Commit: `dab2e38e55d323a400a171098cb56009d8039255` on
`fleet/390-left-sidebar-proportional-bound`
Gate: `GATE_EXIT=0`, `merge-gate: ALL-PASS`, total 3m51s, through the
pre-commit hook.
Report written by the builder. Not pushed, not merged.

## Outcome

The left and right dock groups now share one proportional bound in
[LayoutModel.ts](../../../../src/modules/layout/LayoutModel.ts). Each dock
content area can use at most 30 percent of the terminal row. A second bound
keeps the complete dock group, including its activity bar and splitter,
strictly narrower than the editor. The smaller bound wins.

The persisted sidebar and right-dock widths remain requests. A narrow terminal
clamps only the painted layout. It does not rewrite either setting. A wider
terminal restores the requested widths.

The default geometry probe reports:

```text
80x24   left=25 (20 content) editor=34 right=21 (20 content) OK
100x30  left=35 (30 content) editor=36 right=29 (28 content) OK
120x36  left=37 (32 content) editor=54 right=29 (28 content) OK
```

Before this change, the same default requests produced these group widths:

```text
80x24   left=37 editor=22 right=21
100x30  left=37 editor=34 right=29
120x36  left=37 editor=54 right=29
```

The left group exceeded the editor at 80 and 100 columns. It no longer does.
The committed [dock-width probe](probe-390-dock-widths.ts) drives all three
required geometries and reports group widths, content widths, and row shares.

## Shared generator

`LayoutModel.maximumDockContentColumns` owns the common rule. Both public dock
maximum functions call it. The calculation combines:

1. A content cap of `floor(total columns * 0.30)`.
2. An editor-precedence cap calculated from the columns shared by the editor
   and the dock group.
3. The dock's fixed chrome, so activity bars and splitters cannot hide an
   inversion.

`LayoutModel.resolve` applies the two live maximums to the requested content
widths. [RootView.ts](../../../../src/modules/ui/RootView.ts) supplies the same
left maximum to the sidebar splitter. This replaces the fixed sidebar maximum.

Consumers that need a usable painted width now read the resolved viewport
instead of the persisted request:

- [ScrollbarSync.ts](../../../../src/modules/ui/ScrollbarSync.ts) uses the
  rendered sidebar width.
- [RootView.ts](../../../../src/modules/ui/RootView.ts) resizes dock content
  from the rendered sidebar width.
- [GitPaneContent.ts](../../../../src/modules/git/GitPaneContent.ts) maps
  pointer columns through its rendered viewport.

## Drag, resize, and scale evidence

The layout smoke dragged the sidebar request to 27 and the right-dock request
to 33 at 120 columns. Both requests were granted. At 80 columns, the painted
content widths clamped to 17 and 22 while the settings stayed 27 and 33.
Resizing back to 120 columns restored both requests.

The real app also booted at 80x24 with the shared 10-line and 100,000-line
fixtures. Both frames had the same slot edges: the left group ended at column
29 and the editor used the remaining 51 columns. The result is independent of
document length.

## Contract

The former right-only record in
[layout.invariants.md](../../../../src/modules/layout/layout.invariants.md) is
now **Each dock stays a bounded minority of the row**. The refined record
covers both dock maximum functions, both splitters, persisted width requests,
fixed dock chrome, and the resize restoration rule.

Record results:

- *Layout slots derive from one configuration* — UPHELD. Both dock bounds are
  part of the one layout resolution path.
- *Each dock stays a bounded minority of the row* — REFINED from the right-only
  record and strengthened for both dock groups.
- *A reported size never leaves its configured bounds* — UPHELD. The sidebar
  splitter receives the live primary-dock maximum.
- *Size changes flow through the onSizeChange seam* — UPHELD. Drag persistence
  still uses the existing setting callbacks.
- *Splitter paint and hit testing share one geometry* — UPHELD. The smoke
  drives the painted splitters and their live bounds.

The known direct host-write gap in
[SplitterElement.ts](../../../../src/modules/ui/SplitterElement.ts), tracked by
#391 (splitter host-write bound gap), remains unchanged as required.

## Verification

- Focused unit tests: 39 pass, 0 fail, 316 assertions.
- Dock-width probe: 3 geometries pass, 0 fail.
- Layout PTY smoke: ALL-PASS.
- Invariant checker: 1,235 annotations and 231 lattice links resolved,
  0 problems.
- Conventions gate: PASS.
- Full merge gate through the successful commit hook: ALL-PASS,
  `GATE_EXIT=0`.

### Positive control

I temporarily made `maximumDockContentColumns` return
`Number.MAX_SAFE_INTEGER`. This disabled both shared bounds.

- `bun test src/modules/layout/LayoutModel.test.ts` went red with 16 failures.
- `bun scripts/harness/smoke-layout-harness.ts` exited 1:
  `FAIL an 80-column row keeps the editor wider than the primary dock group
  (dock 32, editor 14)`.

I removed the plant. Both checks then passed.

### Gate history

The first final hook found the exact known `995/1000` fold-dense shortfall from
#193 (fold-dense contract row shortfall). Its values matched the active record:
one case, full stack, one checkpoint, 995 rows, and 30.0 FPS. No dock code
changed before the unchanged retry. The retry passed the behavioral contract.

The successful gate recorded one gate-managed retry in the unrelated git-watch
harness. It passed cleanly on retry. The previous blocked hook also recorded
one retry in the unrelated scrollbars harness.

## Files changed

- [LayoutModel.ts](../../../../src/modules/layout/LayoutModel.ts) — shared dock
  bound and two-dock resolution.
- [LayoutModel.test.ts](../../../../src/modules/layout/LayoutModel.test.ts) —
  geometry, request preservation, and shared-bound tests.
- [layout.invariants.md](../../../../src/modules/layout/layout.invariants.md) —
  both-docks contract refinement.
- [PaneSplitters.ts](../../../../src/modules/ui/PaneSplitters.ts) — live sidebar
  maximum dependency.
- [RootView.ts](../../../../src/modules/ui/RootView.ts) — live maximum wiring
  and painted-width propagation.
- [ScrollbarSync.ts](../../../../src/modules/ui/ScrollbarSync.ts) — painted
  sidebar viewport width.
- [GitPaneContent.ts](../../../../src/modules/git/GitPaneContent.ts) — painted
  viewport pointer mapping.
- [smoke-layout-harness.ts](../../../../scripts/harness/smoke-layout-harness.ts)
  — both-dock drag, clamp, resize, and compact-boot coverage.
- [smoke-activitybar-harness.ts](../../../../scripts/harness/smoke-activitybar-harness.ts),
  [smoke-panel-chrome-harness.ts](../../../../scripts/harness/smoke-panel-chrome-harness.ts),
  and
  [smoke-quickopen-harness.ts](../../../../scripts/harness/smoke-quickopen-harness.ts)
  — narrow-layout expectations now observe the intentional editor-first
  geometry.
- [probe-390-dock-widths.ts](probe-390-dock-widths.ts) — repeatable geometry
  probe.

## Bycatch

- KNOWN CONTRACT FAILURE. The first final hook reproduced #193 (fold-dense
  contract row shortfall) at exactly 995 rows. It passed on the unchanged retry.
  No fix was made in this task.
- KNOWN GATE FLAKES. The successful hook retried the git-watch harness. The
  previous hook retried the scrollbars harness. Both passed on their gate-managed
  retries. No fix was made in this task.
- No new runtime or contract-layer defect was observed outside the task scope.
