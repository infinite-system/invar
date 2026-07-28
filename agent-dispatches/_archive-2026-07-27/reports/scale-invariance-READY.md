# Scale invariance phase 1 — READY

## Outcome

The editor scroll contract now asserts load invariance directly. The same
12-notch PTY wheel gesture runs over generated 2,000-line and 100,000-line
flat fixtures. Cumulative integer work is divided by attributed frame count
with exact rational cross-multiplication; there is no timing tolerance.

`EditorFrameAttribution` brackets `RootView.update()` and exposes the latest
frame plus cumulative totals through the existing frame-settled status
projection. It counts:

- document-line reads;
- fold projection lookups;
- wrap projection lookups;
- layout computations.

The root `Cost tracks the actively observed set` contract and the new editor
contract both state the impossibility boundary: no per-frame quantity may
scale with document length.

Feature history: WIP implementation `8438514`, repository-law sync
`02337b9`, completion commit `e8a2c45`.

## Measured contract

All three final behavioral runs reported the same values:

| fixture | frames | document reads | reads/frame | fold/frame | wrap/frame | layout/frame |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2,000 lines | 66 | 4,290 | 65 | 33 | 2 | 1 |
| 100,000 lines | 66 | 4,290 | 65 | 33 | 2 | 1 |

Ratios at 100,000 / 2,000 lines:

- document-line reads/frame: `1.000000`;
- fold projection lookups/frame: `1.000000`;
- wrap projection lookups/frame: `1.000000`;
- layout computations/frame: `1.000000`.

Exact equality is the tolerance. These counters and the driven gesture are
deterministic, and all four measurements are positive, so an epsilon would
only weaken the contract.

## Positive control

I temporarily planted one document read per 100 document lines inside the
real `RootView.update()` frame path. That is O(document length) while remaining
small enough for the 100k fixture to render and reach the assertion.

The focused PTY drive exited 1 with:

```text
scale-invariance document-line reads-per-frame ratio
100000/2000=12.395349, expected exact 1
(counts 35178/33 vs 2838/33)
```

The planted loop was removed. The same focused drive then returned to 65,
33, 2, and 1 per frame at both sizes.

## Assertion role changes

The count ratio is now the primary document-size contract.

- Diff retains one 28 FPS wall-clock canary.
- The fold-dense editor checkpoint retains one 28 FPS wall-clock canary.
- The previous editor/diff size-matrix FPS floors no longer claim to prove
  scale invariance.
- The existing glide shape, travel, continuation, and moving-frame assertions
  remain across the full size matrix.

This count-neutral role refinement is declared in
`project.coverage-deltas.md` as 41 assertions / 34 waits before and after.

## Wall-clock cost

The task brief's before reference is approximately 101 seconds for
`behavioral-contracts.sh`. Final uncontended runs were 105 and 104 seconds
(about +3–4 seconds versus that reference); one run took 212 seconds while an
unrelated external harness was active. No PTY case was added: the count
comparison reuses the existing flat matrix. The final flat smoothness stage
reported 38.548 seconds and the existing fold-dense canary 10.702 seconds.
The counter path's added cost is therefore within run-to-run noise.

## Verification

All required commands exited 0:

- `bunx tsc --noEmit`
- `bun test` — 1,634 pass, 0 fail
- `bash scripts/conventions-gate.sh`
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`
  — 0 problems
- `bun scripts/check-coverage-ratchet.ts`
- `bash scripts/behavioral-contracts.sh` — 3/3, 212s / 105s / 104s
- `bun scripts/harness/smoke-editor-harness.ts` — 3/3
- `bun scripts/harness/smoke-scrollbars-harness.ts` — 3/3

## Follow-up axes

These estimates include counters, paired fixture wiring, a planted red, and
three driven repetitions. They are deliberately not implemented in phase 1.

| axis | estimated cost | extension |
| --- | ---: | --- |
| fold density | 4–6 hours | Compare flat and nested/fold-dense fixtures at equal size and viewport. |
| word wrap | 3–5 hours | Pair wrap-on fixtures at 2k/100k and attribute wrap-index work. |
| gutter marks | 3–5 hours | Pair version-control/diagnostic mark densities and count projection work. |
| indent guides | 2–4 hours | Pair guide-off/on fixtures and count visible-row guide work. |
| scroll depth | 3–4 hours | Reuse the settled jump driver to compare top and line 75,000. |
| diff surface | 1–2 days | Add per-pane diff/alignment attribution, then compare 2k/100k with the same gesture. |

## Bycatch

None observed.
