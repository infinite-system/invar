# READY — overlay dialog hard red

Branch: `fix-overlay-dialog-red`

Commit: `7f859e11444eaa260107f7957b9602bd2cffd073`

Worktree: clean

## Result

Fixed the intermittent context-menu wheel hard red in
`src/modules/ui/OverlayLayer.ts`.

`OverlayLayer.requestPaint()` used to mutate the reactive `paintRevision` and
also request a renderer frame immediately. On a settling one-row context-menu
glide, that renderer request could serialize before the coarse reactive paint
effect projected the new viewport window. The physics reached scrollTop 1 and
`OverlayLayer` built the row-1 window, but the stale row-0 frame won; momentum
then stopped at the boundary and no later frame published the new content.

The fix removes the competing direct renderer request. `paintRevision` now
invalidates the one coarse paint effect, and that effect projects the updated
dialog content before requesting its frame.

## Drive evidence

Baseline, default settings:

- Ran `bun scripts/harness/smoke-overlay-dialog-harness.ts` 10 times.
- Exit sequence: `0, 1, 0, 1, 0, 1, 0, 0, 1, 0` — 4/10 red.
- Every red timed out at:
  `Context Menu wheel scrolls only the dialog content changes its expected region`.
- The final 54x5 grid stayed on `Stage (1) / Unstage (0) / Discard… (1)`.

One-instrument trace on the real app:

- The mouse path received the wheel at the context menu.
- The viewport stepped from scrollTop 0 to 1.
- `OverlayLayer` projected `firstVisibleContextMenuIndex=1`.
- The terminal emulator still received the stale row-0 frame, proving a
  projection-to-frame publication race rather than a harness predicate defect.

After the fix:

- Five initial fixed-tree drives: 5/5 green, every exit 0.
- Positive control: restored the removed renderer request; the first smoke run
  exited 1 with the original changed-region timeout and unchanged three-row
  frame. Removed the planted defect afterward.
- Acceptance run: 20 consecutive final-tree drives, 20/20 green, every exit 0.
- The drive covers the constrained 54x5 context menu, 54x12 resized dialogs,
  and the standard 120x40 overlay flow.

The existing changed-region smoke assertion is the permanent regression
contract. No assertion or wait was removed or weakened.

## Final verification

Ran the full checker exactly once:

`bash scripts/merge-gate.sh`

Actual gate exit: `0`.

Result: `merge-gate: ALL-PASS`.

Hard checks passed: conventions/tsc, invariant structure and references,
coverage ratchet, reactive-observation check, unit tests, the 56-job parallel
smoke pool, behavioral contracts, all five quiet-serial jobs including
`smoke: overlay-dialog harness`, and the input-byte-flush latency gate.

Input-byte-flush result: p50 5.218 ms, p95 8.148 ms; fail threshold
9.856 ms.

The soft performance suite returned its documented non-blocking exit 3 for one
budget target miss; the merge gate remained exit 0.

## Invariant review

Derived scope:

- `project.invariants.md` by content implication: `Data flows one way`.
- `src/modules/app/app.invariants.md` by content implication:
  `Rendering is one coarse frame effect`.
- `src/modules/ui/ui.invariants.md` by path and behavior:
  `Wheel impulses start their own frame sequence` and
  `Overlay dialogs stay inside the terminal`.

Verdict: PASS. The change strengthens the single coarse projection authority
by removing a renderer request that could precede projection. Wheel input still
requests its first animation frame through `ScrollableTextViewport`; the
reactive paint effect requests content frames after projection.

## Bycatch

- Context-menu wheel bubbling invokes both the list and its parent box handler:
  one physical wheel produced two consecutive impulses (10.2 then 22.78
  velocity) in each of two diagnostic reproductions. This was not the hard-red
  cause and was not changed.
- Full-gate `smoke: move-line harness` first attempt timed out waiting for
  `one / two / three`; its final frame still showed `no open files`. The quiet
  retry passed, so it did not reproduce a second time.
- Full-gate `smoke: audio-narration harness` first attempt timed out waiting for
  `narrationBargeInCount` to advance in the enabled-setting barge-in phase. The
  quiet retry passed, so it did not reproduce a second time.
- The full gate's soft performance probe reported one unnamed budget target
  miss (`measurement failures=0`, `idle-quiescence violations=0`,
  `target misses=1`). It was report-only and was not rerun.
