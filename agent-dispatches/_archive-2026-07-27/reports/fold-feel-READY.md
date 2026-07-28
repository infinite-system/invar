# READY — successive flick accumulation

Commit: `a8d09bb Make successive wheel flicks accumulate`

Branch: `fix-fold-smoothness`

Base used as requested: `25cdf18`

Tree: clean. The branch is one commit ahead of its requested base and eight
commits behind the now-advanced `origin/main`; no pull, merge, push, tag,
branch deletion, or worktree deletion was performed.

## Finding

The velocity cap was the cause.

Commit `99f0550` changed the progressive gain ramp from 40% of the configured
velocity cap to three impulses. That fixed a real defect: raising the fling
ceiling no longer made acceleration slower. At the user's raised 320 rows/s
ceiling, however, a realistic 12-notch flick then reached the hard physical
velocity clamp inside the first PTY write. Later same-direction notches were
added and immediately clamped away, so the glide felt heavy even though the
weaker non-decrease contract remained green.

The fix keeps the ramp impulse-based, preserving ceiling-independent
acceleration, but gives it twenty impulses of headroom. A first hard flick now
lands below the raised ceiling, the second is faster, and the third reaches
the ceiling. The later reversal halt-and-restart behavior, the from-rest
one-row floor, and live-glide continuation outside the 150 ms input window
remain unchanged.

## Drive method

Every measurement drove the real `src/main.ts` through `OpenPty`, opened the
same generated 2,000-line file, used the same 120x40 terminal, set
`verticalFlingCeiling=320`, and sent the same pattern:

- flick: one PTY write containing 12 down-wheel notches
- pause: requested 200 ms while completed frames continued to be observed
- repeat for three flicks

The table reports the exact visible per-frame row-crossing sequence. The peak
column is the maximum adjacent-two-frame crossing derived from that sequence.
Two frames preserve the shape while removing a one-row cell-grid phase tie;
it is not FPS, a mean, or an internal model value.

## DRIVE-FIRST current-build fingerprint

| Build | Flick 1 | Flick 2 | Flick 3 | Two-frame peaks | Shape |
| --- | --- | --- | --- | --- | --- |
| `87d25d0` / requested base behavior | `20,7,7,6,5` | `11,9,8,7,6,6,5` | `10,9,9,6,7,5,4,5,3,3,3,2,2,2,1,2,1,1,1,1,1,1,1,1` | `27 → 20 → 19` | heavy; later flicks do not climb |

## BISECT-BY-DRIVING

Candidates were ordered newest to oldest exactly as supplied. Starting from
the known-heavy new end, the range was halved rather than walked:

| Bisect step | Commit | Flick 1 | Flick 2 | Flick 3 | Two-frame peaks | Conclusion |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | `3d45b56` | `10,10,7,7,6` | `5,11,9,8,8,5` | `6,11,8,9,7,6,6,4,4,4,2,3,2,2,2,2,1,1,1,1,1,1,1,1,1` | `20 → 20 → 17` | flat/declining; take older half |
| 2 | `1ae7ec2` | `10,10,10,7,7` | `5,12,10,9,7,6` | `5,12,10,9,7,7,5,5,4,4,3,2,2,2,2,1,1,1,1,1,1,1,1` | `20 → 22 → 22` | second-to-third flat; take older half |
| 3 | `99f0550` | `10,11,9,7,6` | `6,11,11,8,8,7` | `5,12,9,9,8,6,6,4,4,4,3,3,2,2,1,2,1,1,1,1,1,1,1` | `21 → 22 → 21` | regression side |
| 4 | `40d244b` | `9,11,8,6,7` | `5,11,10,9,7,7` | `6,13,10,9,7,6,5,5,4,3,3,3,2,2,1,2,1,1,1,1,1,1,1` | `20 → 21 → 23` | climbing side |

Driven bracket: `40d244b` good shape → `99f0550` flat/declining shape.

Named delta: `99f0550` replaced a cap-scaled ramp ceiling with
`impulse * 3`; the shortened ramp pre-saturated the 320 rows/s physical cap
inside the first hard flick.

## After-fix fingerprint

The one-time final behavioral run observed:

| Flick | Actual pause | Per-frame row-crossing sequence | Two-frame peak |
| ---: | ---: | --- | ---: |
| 1 | from rest | `9,4,3,3,2` | 13 |
| 2 | 211.9 ms | `10,8,7,7,5,5` | 18 |
| 3 | 200.2 ms | `10,10,8,7,6,5,5,4,4,3,2,3,1,2,2,1,1,1,1,1,1,1,1,1` | 20 |

Result: `13 → 18 → 20`, strictly climbing through the ceiling-reaching third
flick.

Three additional narrow drives produced `13 → 18 → 20`,
`13 → 18 → 20`, and `13 → 19 → 20`.

## Contract and positive controls

The UI invariant was strengthened and renamed to:

`Same-direction notches accumulate until the glide ceiling`

The permanent `glide-accumulation` behavioral contract drives the three real
flicks above, requires their adjacent-two-frame peaks to rise strictly, and
requires the final peak to reach the ceiling-derived two-frame budget. It
also rejects a synthetic flat peak sequence before trusting production.

Mutation positive control:

- temporarily restored `gainRampNotchSpan` from 20 to the regressing value 3
- `bun test src/modules/system/Momentum.test.ts` exited 1
- the accumulation failure was exact:
  `Expected > 320; Received 320`
- restored 20
- targeted suite returned 14 pass, 0 fail, exit 0

## Final verification — exact exit codes

| Verification | Result |
| --- | ---: |
| `bunx tsc --noEmit` | 0 |
| `bun test` — 1,633 pass, 0 fail | 0 |
| `bash scripts/conventions-gate.sh` | 0 |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` — 0 problems | 0 |
| `bun scripts/check-coverage-ratchet.ts` — 29 assertions / 14 waits in `Momentum.test.ts`, no undeclared decrease | 0 |
| `bash scripts/behavioral-contracts.sh` — run once, ALL-PASS | 0 |
| `bun scripts/harness/smoke-code-folding-harness.ts` — ALL-PASS | 0 |
| `bun scripts/harness/smoke-editor-harness.ts` — ALL-PASS | 0 |

`conventions @ e0476d687c354daac606ba45d688d4ad467b81dc`

---

# ROUND 2 READY — defaults first and ceiling-relative headroom

Final tip: `dc6184a Keep glide accumulation verdict count-based`

Implementation commit: `0fd4271 Make glide accumulation ceiling-relative`

Integration commit: `e07314b Merge remote-tracking branch 'origin/main' into
fix-fold-smoothness`

Branch: `fix-fold-smoothness`

Merged base: `origin/main` at
`619422d3d01e69cee2510eedaf671b024f4bad0c`

Tree: clean. The branch is five commits ahead of `origin/main`. No push, merge
into main, tag, branch deletion, or worktree deletion was performed. The three
untracked JSON reports generated by the final behavioral run were removed
after their results were captured; they are reproducible run artifacts.

## DEFAULTS-FIRST finding

The first drive used the product default
`Settings.verticalFlingCeiling = 220`, before any new edit.

The fixed twenty-impulse ramp did produce a strictly climbing visible
two-frame fingerprint at 220 (`13 → 14 → 20`), but its internal post-flick
velocities were `148.94 → 220 → 220`. The second flick had already reached the
hard clamp, so there was no physical velocity headroom for the third. At the
lower sweep point the visible failure became unambiguous:

| Ceiling | Pre-fix two-frame peaks | Shape |
| ---: | --- | --- |
| 120 | `10 → 7 → 7` | declining, then flat |
| 220 default | `13 → 14 → 20` | visibly climbing, but internally clamped after flick 2 |
| 320 raised | `13 → 18 → 20` | climbing |
| 480 | `13 → 18 → 26` | climbing |

This falsified the constant-span claim across configured ceilings. The default
also exposed a resolution limit in the old contract: at 220 rows/s and 30 FPS,
a two-frame ceiling budget contains only about fourteen integer rows, while
the preserved first flick already occupies thirteen. Three strict integer
levels cannot fit. The instrument therefore retains every exact per-frame
crossing but folds its accumulation fingerprint over four adjacent frames.

## Ceiling-independent mechanism

The impulse-scaled gain curve remains independent of the configured cap, so
raising the ceiling does not slow ordinary acceleration. Ceiling reachability
now has its own generator: a headroom-relative physical-velocity envelope.

- One hard flick is the driven twelve-impulse PTY write.
- Flick one reserves two later velocity gains.
- Flick two reserves one later gain.
- Flick three may use the configured ceiling.
- Each reserved gain is three quarters of a full-gain notch, capped at one
  third of the configured ceiling so the rule still scales at low ceilings.
- `restEquivalentGestureVelocity` remains unclamped, so the acceleration curve
  cannot be rewritten by a low physical ceiling.

The envelope advances continuously with impulse units. A same-direction notch
therefore still adds positive physical velocity below the configured ceiling;
the envelope does not create a lower flat clamp.

## Post-fix default and raised fingerprints

The permanent `glide-accumulation` contract ran once in the final behavioral
pass. It drove the default first and the raised ceiling second:

| Ceiling | Flick 1 sequence | Flick 2 sequence | Flick 3 sequence | Four-frame peaks |
| ---: | --- | --- | --- | --- |
| 220 default | `9,4,3,3,2` | `7,5,5,4,4,3,3` | `8,6,5,5,5,3,4,2,2,3,1,2,1,1,1,1,1,1,1,1,1,1` | `19 → 21 → 24` |
| 320 raised | `9,4,3,3,2` | `10,8,7,7,5,5,4` | `10,10,8,8,5,6,4,4,4,3,3,2,2,2,1,1,1,1,1,1,1,1,1,1` | `19 → 32 → 36` |

Both are strictly climbing. The default first-flick four-frame peak remains
`19`, the same value derived from the round-one pre-change sequence
`9,4,3,3,2`; the default opening flick did not become weaker.

## Ceiling sweep

The same real PTY pattern was driven at 120 / 220 / 320 / 480 after the
`origin/main` merge:

| Ceiling | Flick 1 | Flick 2 | Flick 3 | Four-frame peaks |
| ---: | --- | --- | --- | --- |
| 120 | `4,2,1,1,2` | `3,2,3,2,2,1,2` | `4,3,3,3,2,2,2,1,2,1,1,1,1,1,1,1,1` | `8 → 10 → 13` |
| 220 default | `9,4,3,3,2` | `7,6,4,5,3,3` | `8,6,6,5,4,3,4,2,3,2,2,1,2,1,1,1,1,1,1,1,1` | `19 → 22 → 25` |
| 320 | `9,4,3,3,2` | `10,8,8,5,6,5` | `11,9,8,7,6,5,5,4,4,3,2,2,3,1,2,1,1,1,1,1,1,1,1,1` | `19 → 31 → 35` |
| 480 | `9,4,3,3,2` | `10,8,7,7,5,5,4` | `15,13,12,10,8,7,7,5,5,4,4,4,2,3,2,2,1,1,2,1,1,1,1,1,1,1` | `19 → 32 → 50` |

Every row is strictly climbing.

## Scale parity

The default-ceiling drive used both the generated 2,000-line and 100,000-line
flat editor fixtures:

| Lines | Four-frame peaks | Result |
| ---: | --- | --- |
| 2,000 | `19 → 22 → 25` | strictly climbing |
| 100,000 | `19 → 21 → 25` | strictly climbing |

The opening fingerprint is identical and accumulation survives document
scale.

## Contract and positive controls

`glide-accumulation` now:

- drives 220 first and 320 second;
- retains exact per-frame crossing sequences;
- requires three strictly climbing four-frame peaks in both rows;
- requires the first peak to remain below its ceiling-derived budget;
- rejects a synthetic flat sequence before trusting production;
- reports actual pauses as evidence but does not gate on wall-clock timing.

Final-code mutation control:

- temporarily changed
  `followOnHardFlicksWithReservedHeadroom` from `2` to `0`;
- `bun test src/modules/system/Momentum.test.ts` exited `1`;
- exact failure:

  `Expected: > 220`

  `Received: 220`

- restored `2`;
- targeted suite returned 14 pass, 0 fail, exit `0`.

## Final verification — exact exit codes

The full checker suite ran once, after the merge and final commits:

| Verification | Result |
| --- | ---: |
| `bunx tsc --noEmit` | 0 |
| `bun test` — 1,633 pass, 0 fail, 67,270 expectations | 0 |
| `bash scripts/conventions-gate.sh` — PASS | 0 |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` — 0 problems | 0 |
| `bun scripts/check-coverage-ratchet.ts` — 29 assertions / 14 waits in `Momentum.test.ts`; no undeclared decrease | 0 |
| `bash scripts/behavioral-contracts.sh` — run once, ALL-PASS | 0 |
| `bun scripts/harness/smoke-code-folding-harness.ts` — ALL-PASS | 0 |
| `bun scripts/harness/smoke-editor-harness.ts` — ALL-PASS | 0 |

Overall full-suite exit: `0`.

`conventions @ e898c40d189bac146fe10b4e8d4fe011c1668abe`

---

# ROUND 3 READY — honest wheel drives across the shared momentum blast radius

Final tip: `c1be1af648bb629b3043d6954eb078e84458cf30 Drive wheel smokes through reserved headroom`

Branch: `fix-fold-smoothness`

The task commit changes only:

- `scripts/harness/smoke-scrollbars-harness.ts`
- `scripts/harness/smoke-settings-applied-harness.ts`

No push, merge, tag, branch deletion, or worktree deletion was performed.
Three generated JSON artifacts were already untracked on entry and were left
untouched. After the task commit, `AGENTS.md` acquired a concurrent unstaged
BYCATCH-law update; that unrelated change was also preserved and was not
included in the task commit.

## Finding — default single-flick travel did not decrease

The required comparison drove the real app at the default
`verticalFlingCeiling = 220`, with one PTY write containing twelve wheel-down
notches, from rest through the final settled frame.

To isolate only the envelope, the old side used the post-merge harness/app at
`e07314b` with `src/modules/system/Momentum.ts` restored from the pre-envelope
commit `a8d09bb`. The current side used `dc6184a`. This avoids mixing the
physics comparison with unrelated application changes between the older
branch base and the current post-merge tree.

| Physics | Per-frame row crossings | Rows travelled to rest |
| --- | --- | ---: |
| pre-envelope `a8d09bb` | `9,4,3,3,2,3,1,2,1,2,1,1,1,1,1,1,1` | 37 |
| current `dc6184a` | `9,4,3,3,2,2,2,2,1,1,1,1,1,1,1,1,1,1` | 37 |

Reduction: `(37 - 37) / 37 = 0%`.

The instrument's `totalDistanceRows` field reports `last observed position -
first observed position`, which excludes the nine rows already crossed in the
first completed frame. The finding therefore uses start-at-zero to final
resting position (`37`) and independently checks it by summing the complete
accumulation crossing sequence (`37`). The envelope changes the tail's cell
quantization slightly, but spends no single-flick travel at the required
default probe. The task's greater-than-15% stop condition did not apply.

## Reproduced failures

Before editing:

- `smoke-scrollbars-harness.ts` exited `1` at the unchanged visual landmark:
  `Timed out waiting for grid condition: the deep widest line is visible
  during the wheel drive`.
- `smoke-settings-applied-harness.ts` exited `1` at the unchanged settled-state
  landmark: `Timed out waiting for grid condition: the notch-driven editor
  viewport reaches its changed resting position`. The final published values
  were `editorScrollTop=0` and
  `workspaceScrollMomentumAtRest=true`.

Those real reds are the positive controls for the repaired drives.

## Fix — inputs changed, oracles did not

The settings-applied smoke now drives a two-notch short gesture as one PTY
write instead of a lone notch. Its content-invariance region, changed editor
region, at-rest condition, and every setting comparison remain unchanged.
Across the three final runs, the important low-gain comparison was stable at
`1 → 2`; `linesPerNotch` was `4 → 44`, and the Alt fast modifier was `4 → 33`.

The scrollbar smoke still uses the same full
`DEEP-WIDEST-END-MARKER` visual oracle. Its precision approach now sends
settled two-notch gestures. It uses the emulator grid to observe when fixture
line 401 is vertically visible, then routes the next real gestures
horizontally through Alt-wheel until the full marker appears. The old exact
row threshold and partial-marker precondition were assumptions tied to
one-notch travel.

No timeout was widened and no landmark, assertion, or comparison was removed
or weakened.

Both repaired smokes were green three times on the final targeted diff:

| Smoke | Final runs |
| --- | ---: |
| `bun scripts/harness/smoke-scrollbars-harness.ts` | 3/3 |
| `bun scripts/harness/smoke-settings-applied-harness.ts` | 3/3 |

## Wheel-consumer census and final-tree runs

`rg` over `scripts/harness/smoke-*.ts` for encoded wheel objects, helper
drivers, notch vocabulary, and raw SGR wheel bytes found these twelve
wheel-consuming PTY smokes. Every one ran once on the final tree and exited
`0`:

| Wheel consumer | Exit |
| --- | ---: |
| `smoke-agent-pane-ux-harness.ts` | 0 |
| `smoke-bounded-list-popup-harness.ts` | 0 |
| `smoke-clipboard-frame-boundary-harness.ts` | 0 |
| `smoke-completion-harness.ts` | 0 |
| `smoke-editor-harness.ts` | 0 |
| `smoke-horizontal-extent-harness.ts` | 0 |
| `smoke-overlay-dialog-harness.ts` | 0 |
| `smoke-scrollbars-harness.ts` | 0 |
| `smoke-selection-harness.ts` | 0 |
| `smoke-settings-applied-harness.ts` | 0 |
| `smoke-terminal-harness.ts` | 0 |
| `smoke-tree-scroll-harness.ts` | 0 |

The same census also found the legacy wheel drivers in
`scripts/behavioral-contracts.sh`; that suite ran once in the final checker
pass and exited `0`. The code-folding harness contains no wheel/notch driver,
so it is not part of this shared-momentum consumer census.

## Final checker suite — exact exit codes

The requested checker components ran manually once against commit `c1be1af`:

| Verification | Result |
| --- | ---: |
| `bunx tsc --noEmit` | 0 |
| `bun test` — 1,633 pass, 0 fail, 67,270 expectations | 0 |
| `bash scripts/conventions-gate.sh` — PASS | 0 |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` — 863 annotations resolved, 45 lattice links resolved, 0 problems | 0 |
| `bun scripts/check-coverage-ratchet.ts` — 307 files inspected, no undeclared decrease | 0 |
| `bash scripts/behavioral-contracts.sh` — ALL-PASS | 0 |

Overall manual checker result: `0`.

Process note: the first commit attempt triggered the repository's automatic
pre-commit merge-gate despite the task's `No merge-gate` instruction. It was
interrupted during the parallel smoke pool and exited `130`; no merge-gate
completed. The commit was then made with `SKIP_GATE=1`, and the table above is
the single complete manual checker pass.

## Bycatch

None observed on the current final tree. The task-mentioned overlay-dialog
failure did not reproduce in its required wheel-consumer run; the smoke exited
`0`, so no unrelated fix was attempted.

`conventions @ e898c40d189bac146fe10b4e8d4fe011c1668abe`
