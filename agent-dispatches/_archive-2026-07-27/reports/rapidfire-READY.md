# RAPID-FIRE glide READY

Commit: `0ac599664849aa7633518709684ebb4363542c68`

Branch: `fix-glide-rapidfire`

The worktree is clean. No push, merge, tag, branch deletion, or worktree
deletion was performed.

## Result

Rapid input now reaches the configured velocity ceiling and spends excess
same-direction impulse energy by sustaining that ceiling. It never exceeds
the configured maximum. The first two reserved-headroom flicks and the third
ceiling-reaching flick retain their landed behavior; only physical input
events after those first 36 events can extend capped-speed duration.

The permanent `glide-accumulation` contract now gates both regimes:

- three 200 ms-separated flicks must retain strictly climbing four-frame
  peaks at 220 and 320;
- one rapid 60-notch PTY write at the default 220 ceiling must retain at least
  24 completed ceiling-budget frames;
- the full separated and rapid row-crossing fingerprints are printed.

## Reproduction and mechanism

Before editing, the real PTY drive reproduced the cadence split at defaults:

| Pattern | Result |
| --- | --- |
| 60 notches in one PTY write | settled at row 55; instrument travel 41 rows |
| five 12-notch flicks around 33 ms | total row crossings 85 |
| five 12-notch flicks around 133 ms | total row crossings 141 |
| five 12-notch flicks around 200 ms | total row crossings 175 |

The pre-fix continuous-burst crossing fingerprint was:

`14,5,5,4,4,3,2,3,2,2,1,2,1,1,1,1,1,1,1,1`

The first number is the input frame's movement from row zero. Every later
number is a completed-frame crossing.

The cause was discarded velocity at the true configured ceiling. Rapid input
reached 220 and every later gain was clamped away. Separated input arrived
after decay, so the same later gains were accepted again. The headroom
envelope itself advanced correctly, input events were not coalesced away, the
gain ramp did not reset, and renderer cadence held.

`Momentum` now keeps only overflow received after the true ceiling has already
been reached. `stepMomentum` spends that reserve solely to replace velocity
lost to decay. The first/second-flick envelope still discards its rejected
velocity, preserving the separated shape.

A second driven finding refined the implementation: row-scaled impulse units
cannot identify physical flick count. With `linesPerNotch=3`, 25 wheel events
look like 75 row units. A separate same-direction physical-event count now
opens the reserve after 36 events, independent of row scaling. This restored
the scrollbar consumer while preserving the rapid default drive.

## Final rapid drives

The exact committed tree produced:

| Ceiling | Lines | Ceiling-budget frames | Instrument travel |
| ---: | ---: | ---: | ---: |
| 220 | 2,000 | 27 | 248 |
| 220 | 100,000 | 27 | 249 |
| 320 | 2,000 | 18 | 267 |
| 320 | 100,000 | 18 | 267 |

Default 220 crossing fingerprints:

- 2k:
  `7,7,8,7,8,7,7,7,8,7,8,7,7,7,7,8,7,8,7,7,7,8,8,6,8,7,8,7,5,5,5,3,4,3,2,2,2,2,1,2,1,1,1,1,1,1,1`
- 100k:
  `8,8,7,7,7,8,7,7,7,8,8,7,7,7,8,7,7,7,8,7,8,7,8,7,7,8,7,6,6,5,4,4,4,3,2,2,2,2,1,2,1,1,1,1,1,1,1`

At 220/30 FPS, a ceiling frame crosses at least 7 rows. The 60-notch burst
reaches the configured ceiling after the first three 12-notch flicks. Each of
the remaining 24 full-gain impulses carries more velocity than one default
ceiling frame loses to decay, so 24 is a derived, count-based floor. Production
gave 27 frames at both scales.

This is the physically correct “reach ceiling and stay” outcome. The setting
defines the maximum speed, so later rapid input must extend capped-speed
duration rather than raise the peak above it.

The final 0/30/60/100 ms sweep used five 12-notch flicks:

| Requested pause | Actual cadence shape | Four-frame slices | Total crossings |
| ---: | --- | --- | ---: |
| 0 ms | `71.6,35.6,35.7,32.3` ms | `9,7,7,7,30` | 279 |
| 30 ms | `74.5,35.5,34.1,34.1` ms | `9,7,7,7,30` | 279 |
| 60 ms | `74.3,71.2,62.2,65.8` ms | `9,12,14,14,30` | 285 |
| 100 ms | `118.7,124.5,103.5,130.6` ms | `13,21,20,28,30` | 298 |

Inside the cadence window, middle flicks contain only one to four completed
frames, so a per-flick four-frame slice is not a comparable peak window. The
continuous-burst ceiling-frame count is the load-invariant verdict: it shows
the speed reaches the ceiling and stays there rather than interpreting
different-length slices as separate full glides.

## Separated-regime regression

All ceiling rows remain strictly climbing:

| Ceiling | Landed table | Final table |
| ---: | --- | --- |
| 120 | `8 → 10 → 13` | `8 → 10 → 14` |
| 220 | `19 → 22 → 25` | `19 → 21 → 24` |
| 320 | `19 → 31 → 35` | `19 → 32 → 35` |
| 480 | `19 → 32 → 50` | `19 → 32 → 50` |

The ±1 differences are cell-grid/frame-boundary quantization; the strict
three-level shape, first-flick headroom, configured ceilings, and decay tails
are unchanged. On the committed scale drive:

- 220: 2k `19 → 21 → 24`; 100k `19 → 21 → 23`;
- 320: 2k and 100k both `19 → 32 → 35`.

## Positive controls

Source mutation:

- temporarily discarded true-ceiling overflow;
- `bun test src/modules/system/Momentum.test.ts` exited `1`;
- exact failure: `Expected: > 0`, `Received: 0`;
- restored production behavior; focused suite returned 15 pass, 0 fail.

The permanent behavioral contract also proves both verdict functions:

- `PASS glide-accumulation positive control rejects a flat peak sequence`;
- `PASS glide-accumulation positive control rejects a decaying rapid burst`.

The production rapid verdict was `rapidCeilingFrames=28/24` in the final
behavioral-contract run.

## Invariant review

Derived scope:

- `src/modules/ui/ui.invariants.md`, directly implicated by the annotation on
  `Momentum` and the changed same-direction accumulation behavior;
- `src/modules/system/system.invariants.md`, implicated by the touched system
  capability;
- `scripts/harness/harness.invariants.md`, implicated by the real-PTY contract
  and its positive controls;
- `project.invariants.md`, the ancestor contract and one-writer/shared-seam
  floor.

Verdicts:

- **Same-direction notches accumulate until the glide ceiling — strengthened.**
  Below-ceiling growth and separated headroom remain; post-ceiling rapid energy
  can no longer disappear.
- **A fast glide crosses rows in many small steps — upheld.** Final rapid steps
  stay at the declared 7–8-row default frame budget before decaying.
- **Capability classes are stateless and Static wrapped — upheld.** The new
  values live in each caller-owned `ScrollMomentum`; `Momentum` remains a pure
  static seam.
- **Harness input/output use the real PTY and checks need positive controls —
  strengthened.** The new gate drives one real 60-notch PTY write and rejects a
  known decaying fingerprint before production.
- **One writer per scroll regime — upheld.** No new writer or consumer path was
  introduced.

Mechanical result: 863 annotations and 45 lattice links resolved, 0 problems.

## Final verification

Final committed-state checker results:

| Verification | Exit |
| --- | ---: |
| `bunx tsc --noEmit` | 0 |
| `bun test` — 1,634 pass, 0 fail, 67,336 expectations | 0 |
| `bash scripts/conventions-gate.sh` | 0 |
| invariant checker `--all --refs` — 0 problems | 0 |
| coverage ratchet — 36 assertions / 15 waits in `Momentum.test.ts`, no decrease | 0 |
| `bash scripts/behavioral-contracts.sh` — ALL-PASS | 0 |

The first attempted verification invocation incorrectly replaced the login
PATH instead of prepending Bun. That removed `node`, `claude`, and `codex`:
typecheck exited 0; full tests exited 1 with two provider-resolution failures;
conventions exited 1 because `node` was absent; invariants and coverage exited
0. The corrected invocation inherited PATH and all corresponding final checks
above exited 0. This invocation defect changed no source.

## Wheel-consumer census

Final-tree exits:

| Wheel consumer | Exit |
| --- | ---: |
| `smoke-agent-pane-ux-harness.ts` | 0 |
| `smoke-bounded-list-popup-harness.ts` | 0 |
| `smoke-clipboard-frame-boundary-harness.ts` | 0 |
| `smoke-completion-harness.ts` | 0 |
| `smoke-editor-harness.ts` | 0 |
| `smoke-horizontal-extent-harness.ts` | 0 |
| `smoke-overlay-dialog-harness.ts` | 1 |
| `smoke-scrollbars-harness.ts` | 0 |
| `smoke-selection-harness.ts` | 0 |
| `smoke-settings-applied-harness.ts` | 0 |
| `smoke-terminal-harness.ts` | 0 |
| `smoke-tree-scroll-harness.ts` | 0 |

The scrollbar smoke initially exposed the row-scaled/event-count mistake,
failed twice, then returned ALL-PASS after the event-count correction. All
eleven non-overlay consumers are green on the final tree.

## Bycatch

- **Known overlay-dialog hard red, not fixed:** open Source Control, open the
  real changed-file context menu, then wheel inside it. The condition
  `Context Menu wheel scrolls only the dialog content changes its expected
  region` timed out with rows `Stage (1) / Unstage (0) / Discard… (1)`
  unchanged. It passed once in the earlier census, then reproduced in the
  final census and again on an immediate isolated retry (two consecutive
  confirmations). This is the separately assigned overlay-dialog task, not a
  momentum ceiling path, so no unrelated fix was attempted here.
