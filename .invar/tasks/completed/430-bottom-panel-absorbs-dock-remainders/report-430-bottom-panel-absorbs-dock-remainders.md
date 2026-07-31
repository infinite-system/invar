# READY — Bottom panel absorbs dock remainders (#430)

## Result

The bottom panel now absorbs every reachable dock group that ends at the panel. Full-height docks
and activity bars remain outside it.

One `LayoutModel.resolve` result still drives the splitter, tab row, panel body, paint, published
geometry, and pointer geometry. Commit: `ab01d30384510c3e921b431cdc623dcdbce506e7`.

The change adds the probe command below. It drives all four span combinations through the real PTY.

```sh
bun .invar/tasks/in-progress/430-bottom-panel-absorbs-dock-remainders/430-span-combination-probe.ts
```

## Driven evidence

The baseline used the conductor probe from the [task brief](brief-430-2-bottom-panel-absorbs-dock-remainders.md).
The four-case probe then set both span values through isolated user settings and drove the app.

### Before

| Primary dock | Right dock | Bottom panel | Primary remainder | Right remainder |
|---|---|---:|---:|---:|
| full-height | full-height | L37 W54 | L4 W0 | L91 W0 |
| full-height | ends-at-panel | L37 W54 | L4 W0 | L91 W29 |
| ends-at-panel | full-height | L37 W54 | L4 W33 | L91 W0 |
| ends-at-panel | ends-at-panel | L37 W54 | L4 W33 | L91 W29 |

### After

| Primary dock | Right dock | Bottom panel | Primary remainder | Right remainder |
|---|---|---:|---:|---:|
| full-height | full-height | L37 W54 | L37 W0 | L91 W0 |
| full-height | ends-at-panel | L37 W83 | L37 W0 | L91 W0 |
| ends-at-panel | full-height | L4 W87 | L4 W0 | L91 W0 |
| ends-at-panel | ends-at-panel | L4 W116 | L4 W0 | L91 W0 |

The Centered panel preset now spans `L4 W116` at 120 columns. The Default preset now reaches the
right edge under the ended right dock.

The two-line probe and the shared 100,000-line fixture produced the same Default geometry. The large
fixture reported `bottomPanel`, `bottomPanelSplitter`, and `bottomPanelTabs` at `L37 W83`.

## Contract and implementation

- [LayoutModel.ts](../../../../src/modules/layout/LayoutModel.ts) now derives the panel from the
  connected range left after full-height flanks.
- [LayoutModel.test.ts](../../../../src/modules/layout/LayoutModel.test.ts) covers all four span
  combinations and exact tiling.
- [smoke-layout-harness.ts](../../../../scripts/harness/smoke-layout-harness.ts) checks the named
  presets, zero absorbable remainders, shared chrome widths, and exact area.
- [layout.invariants.md](../../../../src/modules/layout/layout.invariants.md) now records “A dock
  ending at the panel yields its columns.” It also removes the stale blank-remainder mechanism.

## Invariant verdicts

| Invariant | Verdict | Evidence |
|---|---|---|
| Layout slots derive from one configuration | strengthened | One resolver still supplies every slot. Named presets tile 120×46 and 80×20 exactly once. |
| A dock ending at the panel yields its columns | established by this change | Four PTY combinations and focused tests cover neither, either, and both dock groups. |
| Default panel height scales with the viewport | upheld | The smoke retained the 50-row and 24-row proportional-height checks. |
| Each dock stays a bounded minority of the row | upheld | The smoke retained 120-column requests and 80-column clamps. Dock widths did not change. |
| A reported size stays within its live effective bounds | upheld | The 80-column splitter reports still matched painted widths `17/22`. |
| Splitter paint and hit testing share one geometry | upheld | [RootView](../../../../src/modules/ui/RootView.ts) consumes the wider slot once. Shared splitter hover and drag checks passed. |

No implicated invariant was missed or refuted. The new rule narrows panel expansion at full-height
slots, so it does not overlap either dock or an activity bar.

## Positive control

I planted the original left-edge defect by forcing `panelLeft = editorLeft`. The live layout smoke
failed with exit 1:

```text
FAIL Centered panel preset: bottom panel spans 4-120 with no absorbable dock remainder
```

I removed the plant before the final pass.

## Verification

- `bunx tsc --noEmit` — exit 0.
- Focused tests — 57 passed, 0 failed, with 1,178 expectations across three files.
- `bun scripts/harness/smoke-layout-harness.ts` — `ALL-PASS`.
- Invariant checker `--all` — exit 0. The layout contract has 2 reality and 12 chosen records.
- Invariant checker `--refs` — 1,321 annotations and 263 lattice links resolved, with 0 problems.
- Worktree after commit — clean.

The pre-commit hook started the forbidden merge gate automatically. I stopped it during its unit-test
step and recommitted with `SKIP_GATE=1`. I claim only the direct checks listed above.

## Bycatch

- Suspect plain nonsense: `panelAlignment` remains in Settings and presets, but
  `LayoutModel.resolve` no longer reads it. The live settings matrix reproduced identical panel
  edges for center and right more than twice. Not fixed.
- Compatibility debt: `primaryDockRemainder` now has zero area in every layout, but RootView still
  mounts its renderable. The four-case probe reproduced this. Not fixed.
