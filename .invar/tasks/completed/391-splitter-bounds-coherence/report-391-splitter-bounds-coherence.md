# READY — Splitter bounds coherence (#391)

## Outcome

Commit `88e01cc9421173954689342bc4c86cf8e70c73da` is ready for review.

The corrected layout-switch symptom did not reproduce on this checkout. I dragged the left and
right panes to 27 and 33 columns. I then drove Default, Full-height docks, Centered panel, Focus,
and Default. The visible width fingerprint was `27/33 -> 27/33 -> 27/33 -> hidden -> 27/33`.
The same switch cycle completed on the shared 100,000-line fixture. The root splitters are built
once. The preset adapter changes settings and host visibility. It does not rebuild either root
splitter. This evidence refutes the stale or default rebuild seed as the cause on this branch.

The resize control exposed a related coherence defect. At 120 columns, the panes painted and
reported 27 and 33 columns. At 80 columns, they painted 17 and 22 columns but still reported 27
and 33. A persisted 33-column right dock painted 20 columns but reported 21 at an 80-column boot.
At 64 columns, it painted 12 columns but still reported 21. The fixed 16-column minimum also
exceeded the 12-column live maximum.

The confirmed causes were stale host-to-splitter synchronization, writes that bypassed the clamp,
and an incoherent fixed minimum. The change now does the following:

- Every model write passes through the live clamp.
- The right-dock minimum collapses to the live maximum when the row is too narrow.
- The resolved layout synchronizes visible splitter reports with painted widths without persisting
  the temporary clamp.
- The workspace preference remains intact, so a wider row restores the requested width.

The final driven fingerprint was `27/33 -> 17/22 -> 27/33` for shrink and regrow. The persisted
33-column request painted and reported 20 at 80 columns, then painted and reported 12 at 64
columns. The layout-switch cycle still returned to 27 and 33 columns.

## Changed files

- [SplitterModel.ts](../../../../src/modules/layout/SplitterModel.ts) adds the clamped host
  synchronization seam and coherent live bounds.
- [SplitterElement.ts](../../../../src/modules/ui/SplitterElement.ts) routes its setter and
  pointer-down seed through that seam.
- [RootView.ts](../../../../src/modules/ui/RootView.ts) derives both right-dock bounds from live
  layout capacity and synchronizes reports from resolved geometry.
- [AppStatusProjection.ts](../../../../src/modules/app/AppStatusProjection.ts) publishes semantic
  splitter sizes for the PTY probe.
- [smoke-layout-harness.ts](../../../../scripts/harness/smoke-layout-harness.ts) locks the preset
  cycle, report-to-paint equality, and remembered-width restoration.
- [layout.invariants.md](../../../../src/modules/layout/layout.invariants.md) refines the stressed
  record to cover all writes and empty live intervals.

## Positive controls

- I removed the resolved-layout synchronization. The smoke failed with
  `the 80-column splitter reports match painted dock widths (27/33)`.
- I made `setSize` bypass the clamp. Four focused checks failed. They covered host sync, the live
  maximum, the element setter, and the pointer-down seed.
- I planted a layout-switch reset to 16 columns. The smoke failed with
  `the layout cycle restores both pre-switch widths (11/33)`.

I removed each planted defect before the final pass.

## Invariant review

The stressed record is now **A reported size stays within its live effective bounds** in
[layout.invariants.md](../../../../src/modules/layout/layout.invariants.md). The record is
strengthened. Its scope now names construction, host synchronization, pointer seeding, drag writes,
and an empty live interval.

Sibling verdicts:

- **A split ratio stays within zero and one:** upheld. The shared clamp still adds the ratio bounds.
- **A pointer delta converts to size through the axis extent:** upheld. The delta conversion did not
  change.
- **Layout slots derive from one configuration:** strengthened. The resolved slot geometry now also
  supplies each visible splitter report.
- **Layout slot sizes are workspace scoped:** upheld. Host synchronization does not invoke the
  persistence callback and does not replace the workspace request.
- **Each dock stays a bounded minority of the row:** strengthened. The right-dock splitter and the
  layout use the same live maximum generator.
- **Only a drag in progress moves the size:** upheld within its stated `dragTo` scope. Host
  synchronization uses a separate operation.
- **Size changes flow through the onSizeChange seam:** upheld for user drag changes. Host
  synchronization intentionally does not claim a user change.
- **The splitter model carries no renderable dependency:** upheld. The model change adds no view
  dependency.
- **Split arrangement follows panel content order**, **Default panel height scales with the
  viewport**, **Expanded panel overrides only the editor center rows**, and **An unexpanded bottom
  panel leaves one editor row:** reviewed and not touched. The change does not alter panel ordering
  or row allocation.

No sibling layout record was missed.

## Verification

- `bun scripts/harness/smoke-layout-harness.ts`: all pass.
- The 100,000-line `bun run drive` layout-switch cycle: exit 0.
- `bun test src/modules/layout/SplitterModel.test.ts src/modules/ui/SplitterElement.test.ts
  src/modules/app/AppStatusProjection.test.ts`: 28 pass, 0 fail.
- `bunx tsc --noEmit`: exit 0.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: 1,316 annotations,
  263 lattice links, 0 problems.
- `bash scripts/conventions-gate.sh`: pass.
- `git diff --check` and committed-tree check: pass.

The brief prohibited the full merge gate. The pre-commit hook started it automatically, so I used
its documented `SKIP_GATE=1` commit bypass after the focused final pass. I stopped the remaining
hook process.

## Bycatch

- Suspect contract wording drift: **Only a drag in progress moves the size** is broader than its
  stated scope, which covers only `dragTo`. Construction and explicit host synchronization also
  move the stored report. I reproduced this by inspection. I did not change this sibling record.

## Inputs

- [Filed task](task-391-splitter-bounds-coherence.md)
- [Corrected brief](brief-391-3-2.md)
