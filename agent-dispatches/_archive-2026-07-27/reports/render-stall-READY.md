# READY — render-stall investigation

## Outcome

READY on branch `fix-render-stall`.

The reported seconds-long render freeze did **not** reproduce. I drove the
default vertical fling ceiling (`220`) through the real PTY on fold-dense
editor and diff surfaces at 2,000 and 100,000 lines. One-, three-, and
five-second continuous-input bursts did not produce duration-growing frame
starvation. I therefore made no production-code change and did not invent a
backlog fix.

The delivered change makes the missing observable permanent:

- the scroll-smoothness instrument now records completed-frame timestamps,
  frame-gap sequences, and frame counts per input window while input is still
  arriving;
- strict mode fails at the instrument boundary if any window has no completed
  frame;
- `render-progress` gates three seconds of continuous input in 200 ms windows
  on both surfaces at both scales;
- `The render loop never wedges` now states the count-based impossible state.

Commit:
`f5d233b24c56fbbd948cacca24c03e0fc285eb02`
(`Add sustained render progress contract`).

Base:
`b08ce029cd22b44f22c3cc398e8b546bbe84d3f5`.

No merge, push, tag, branch deletion, or production source edit was made.
The worktree is clean.

## Drive evidence

### Before: 1 s / 3 s / 5 s discriminator

These runs used 100 ms input windows and twelve down-wheel notches per
window, at defaults, with folding on. The entries are completed frames per
input window.

| Surface | Scale | 1 second | 3 seconds | 5 seconds |
| :-- | --: | :-- | :-- | :-- |
| editor | 2k | every window 1–4 | every window 1–4 | every window 1–4 |
| diff | 2k | every window 2–4 | every window 2–4 | 0 once, then 1–4 |
| editor | 100k | every window 1–4 | every window 1–4 | every window 1–4 |
| diff | 100k | every window 1–3 | every window 1–3 | every window 1–3 |

The sole zero was the first 100 ms phase window of the 2k diff five-second
run. Its first completed frame arrived at 102.7 ms and its measured
starvation was 100.4 ms. It did not recur or grow with the longer burst.
Other baseline maximum gaps were generally at or below 85 ms. This is
ordinary phase placement around a 100 ms boundary, not the reported
multi-second freeze.

The already-integrated sibling throttle tree at `fd623df` was also driven to
separate the throttle repair from this investigation. At 100k, its editor
emitted 1–4 frames/window for all three durations. Fresh-session diff runs
emitted 2 frames/window for 1 second, 2–3 for 3 seconds, and 2–4 for
5 seconds. All had zero starvation. The sibling throttle change did not
reveal or conceal a freeze in this probe.

### After: permanent contract configuration

The final `behavioral-contracts.sh` run used 200 ms windows. This is the
full count sequence emitted by the committed contract:

| Surface | Lines | Completed frames in each 200 ms input window | Max gap |
| :-- | --: | :-- | --: |
| editor | 2,000 | 4,5,5,5,6,5,5,5,5,5,5,5,6,6,6 | 85.6 ms |
| diff | 2,000 | 5,5,5,5,5,5,5,5,5,5,5,4,5,5,5 | 108.2 ms |
| editor | 100,000 | 4,5,5,6,6,6,6,6,6,7,6,6,6,5,7 | 76.1 ms |
| diff | 100,000 | 5,4,5,5,5,5,5,5,5,5,6,5,5,5,5 | 113.3 ms |

Minimum: four completed frames in every window. Maximum consecutive
zero-frame windows: zero on all four cases.

The before and after app code is identical; “after” means the final committed
instrument and contract observing the same production path. There is no
claimed performance improvement.

## Mechanism and attribution

There was no seconds-long missing-frame interval to attribute to a callee.
The largest gap in the final shared-load gate run was 113.3 ms.

The healthy ownership path is:

1. Editor wheel handling mutates the one momentum controller. The coarse
   reactive projection runs before `Bootstrap.advanceAnimationFrame` requests
   the cadence frame.
2. Diff momentum projects synchronously through `DiffView.update()` before
   its render request; the shared cadence request follows that projection.
3. One absolute-deadline cadence advances the live momentum owners and stops
   at quiescence.

The structural owner/call-site audit found no editor/diff equivalent of the
old overlay race from `7f859e1`: neither wheel path has a second
pre-projection frame-request authority that can let a stale frame win.
Scale parity also gave no evidence of an unfixed per-notch O(document) or
O(fold-regions) twin. Because starvation did not scale with burst duration,
the task's condition for a bounded-intake invariant was not met and no such
invariant was added.

## Positive control

I temporarily planted a 500 ms blocking loop at the start of
`Bootstrap.advanceAnimationFrame` and ran the strict 2k editor probe. It
exited 1 with:

```text
error: editor fold-dense 2000-line burst emitted zero completed frames in
input window 1; counts=[0,0,1,0,0,1,0,0,1,0,1,0,0,1,0]
```

The plant was removed immediately. A path-specific diff confirmed
`Bootstrap.ts` was byte-identical to the base before the final run and
commit. The same strict probe then passed all four editor/diff and 2k/100k
cases.

The permanent behavioral entry also carries a small local positive control:
the verdict must reject `[2,0,3]`.

## Invariant verdict

- Refined: root `The render loop never wedges`, adding completed-frame
  progress during continuous input and the impossible zero-frame 200 ms
  window.
- Upheld: app `Rendering is one coarse frame effect`.
- Upheld: UI cadence and one-momentum-writer invariants.
- Upheld: diff bounded viewport and harness synchronized-frame/timing-lock
  invariants.
- No invariant was downgraded and no conflict was found.

Conventions version read:
`e898c40d189bac146fe10b4e8d4fe011c1668abe`.

## Final verification

The full checker suite was run once at the end:

| Command | Exit | Evidence |
| :-- | --: | :-- |
| `bunx tsc --noEmit` | 0 | no diagnostics |
| `bun test` | 0 | 1,635 pass, 0 fail |
| `bash scripts/conventions-gate.sh` | 0 | PASS |
| invariant checker `--all --refs` | 0 | 864 annotations, 45 links, 0 problems |
| `bun scripts/check-coverage-ratchet.ts` | 0 | no undeclared decrease |
| `bash scripts/behavioral-contracts.sh` | 0 | `ALL-PASS` |
| `git diff --check` | 0 | clean |

The behavioral suite waited 120 seconds for other merge-gate quiet-lock
holders, then used its documented non-wedging unlocked fallback. The new
contract still passed with at least four frames per window.

All twelve wheel-consumer smokes exited 0:

1. `smoke-agent-pane-ux-harness.ts`
2. `smoke-bounded-list-popup-harness.ts`
3. `smoke-clipboard-frame-boundary-harness.ts`
4. `smoke-completion-harness.ts`
5. `smoke-editor-harness.ts`
6. `smoke-horizontal-extent-harness.ts`
7. `smoke-overlay-dialog-harness.ts`
8. `smoke-scrollbars-harness.ts`
9. `smoke-selection-harness.ts`
10. `smoke-settings-applied-harness.ts`
11. `smoke-terminal-harness.ts`
12. `smoke-tree-scroll-harness.ts`

## Bycatch

No user-visible bycatch was observed.

Diagnostic-only: on the sibling throttle tree, one multi-burst diff session's
existing reset helper stopped at scroll offset 81 instead of reaching zero
within its fixed attempt count. Fresh-process 3-second and 5-second reruns
completed and produced the frame data above. This is an on-demand instrument
reset limitation under the sibling physics, not an observed app defect; it
was not changed in this branch.
