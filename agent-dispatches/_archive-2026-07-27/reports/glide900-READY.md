# READY — 900 ms glide smoothness instrument

## Outcome

READY on branch `fix-glide-900-stall` at commit `4a1fb67`
(`fix(harness): derive glide continuation probes from cadence`).

The shipped 900 ms easing remains unchanged. The defect was in the scroll
instrument: its third continuation probe assumed that a 12-notch glide would
always produce a fourteenth positive row-crossing. A full-tail pure ease-out
does not promise that crossing.

The worktree is clean. Nothing was pushed, merged, tagged, branch-deleted, or
run through `scripts/merge-gate.sh`. The two detached comparison worktrees
created for the 150/300 ms measurements were removed after use.

## Exact throwing call

The diagnostic replay printed:

```text
error: continuation minimumMovingFrames=14 waiting for a one-row moving frame
      at measureContinuationBoundary
      at async measureSurface

error: Timed out waiting for the next complete synchronized frame
       (completed frames observed: 71)
```

The throw was the third `measureContinuationBoundary` call, not
`measureOneGesture`. The first two probes had already completed:

```text
editor continuation minimumMovingFrames=6 ... frames=43->44 rows=1->2
editor continuation minimumMovingFrames=10 ... frames=56->57 rows=1->1
```

`measureContinuationBoundary` now adds the minimum-moving-frame count and
the condition phase to both of its frame-wait errors.

## Mechanism

At 150 ms easing, the 900 ms glide contains a 750 ms ordinary phase and a
150 ms linear taper. Its velocity-area equivalent is 825 ms, and the same
12-notch drive supplied enough positive row-crossings for the fourteenth
probe:

```text
minimumMovingFrames=14 observedMovingFrames=14 actual=582.1ms
frames=81->82 rows=1->1
SMOOTHNESS_150_EXIT=0
```

At 900 ms easing, the taper spans the entire 900 ms cap. Its velocity-area
equivalent is 450 ms, so the same gesture has fewer row-crossings. Once the
available positive crossings end, later sub-row integration ticks repaint
nothing; after the glide reaches rest, no further completed DEC 2026 frame
can satisfy the fourteenth-crossing condition. The 700 ms waiter then
correctly reports quiescence. Widening that timeout would only delay the same
answer.

The fixed instrument derives continuation checkpoints from its existing
ten-moving-frame cadence floor: halfway through and at the floor. The
behavioral contract reads that declared population instead of assuming three
probes. It also now includes input-to-first-frame movement in total travel and
the row-crossing fingerprint; the old summary omitted the first, largest
step.

Hypothesis 1 did not hold. A one-notch drive reached its first visible row
well inside 700 ms at every requested easing:

| easing revision | first visible row | settled travel | exit |
| ---: | ---: | ---: | ---: |
| 150 ms (`85b4cc8`) | 114.631 ms | 1 row | 0 |
| 300 ms (`ef66187`) | 110.736 ms | 1 row | 0 |
| 900 ms (`bf57bcf`) | 114.564 ms | 1 row | 0 |

The near-equal latency is the intended from-rest floor: it raises starting
velocity enough to integrate one row despite the easing-area change.

## Driven evidence

The exact full instrument command at easing 900 completed:

```text
FULL_SMOOTHNESS_EXIT=0
```

Small/medium/large editor fingerprints were identical:

```text
2,000 lines:   frames=13 moving=13 distance=28 maxDelta=9
26,635 lines:  frames=13 moving=13 distance=28 maxDelta=9
100,000 lines: frames=13 moving=13 distance=28 maxDelta=9
```

Every editor scale also reported exactly 65 document reads, 33 fold lookups,
2 wrap lookups, and 1 layout computation per attributed frame. Diff reported
14 moving frames and 28 rows at all three scales.

The default continuation probes were green:

```text
minimumMovingFrames=5 observedMovingFrames=6 actual=245.3ms rows=1->2
minimumMovingFrames=10 observedMovingFrames=10 actual=408.7ms rows=1->1
```

Positive control: reintroducing the old configured population produced the
expected red:

```text
POSITIVE_CONTROL_EXIT=1
error: continuation minimumMovingFrames=14 waiting for a one-row moving frame
error: Timed out waiting for the next complete synchronized frame
       (completed frames observed: 72)
```

Removing that planted condition restored the focused green:

```text
FIXED_NARROW_EXIT=0
```

## Contract and documentation changes

- `scripts/harness/measure-scroll-smoothness.ts` derives the continuation
  checkpoints, names continuation wait failures, and measures the complete
  gesture from its pre-input scroll position.
- `scripts/behavioral-contracts.sh` consumes the reported cadence floor and
  continuation population.
- `src/modules/ui/scroll.invariants.md` now describes the shipped 900 ms
  full-tail ramp and the derived continuation placement.

## Final verification

```text
TSC_EXIT=0
BUN_TEST_EXIT=0
1673 pass
0 fail

CONVENTIONS_GATE_EXIT=0
conventions-gate: PASS

INVARIANTS_EXIT=0
884 annotation(s) resolved, 67 lattice link(s) resolved, 0 problem(s)

COVERAGE_RATCHET_EXIT=0
coverage ratchet: inspected 312 files; no undeclared decrease

BEHAVIORAL_CONTRACTS_EXIT=0
behavioral-contracts: ALL-PASS
```

The behavioral run specifically reported:

```text
PASS the fling is carried by many frames
     (fewest moving frames=13, floor=10)
PASS a 12-notch fling outruns its raw notch travel
     (best=28 rows, floor 24)
PASS live-glide notches preserve boundary velocity
     (movingFrames=6,10, trials=2)
PASS editor frame work is invariant from 2k to 100k
PASS rapid input sustains the ceiling
     (rapidTravelRows=98/98)
```

## Bycatch

None observed.
