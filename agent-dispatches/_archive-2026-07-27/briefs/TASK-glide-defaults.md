# ROUND 2 — prove it at DEFAULTS (220), and make the ramp ceiling-independent (#135)

Work in `/tmp/conductor-foldfeel` (branch `fix-fold-smoothness`, at `a8d09bb`). Do NOT run
`scripts/merge-gate.sh`; do NOT push/merge/tag/delete. Append to `/tmp/fold-feel-READY.md`.

Your bisect and finding are ACCEPTED and excellent: `99f0550` shortened the gain ramp from
cap-scaled to `impulse * 3`, which pre-saturated the physical velocity clamp inside the first
flick. The fingerprints (`27→20→19` heavy, `13→18→20` fixed) are exactly the evidence this needed.

Two things remain.

## Job 1 — you measured ONLY at the user's ceiling (320). The default is 220.

`Settings.ts:506` — `verticalFlingCeiling: 220`. Every table in your report used 320, which is the
USER'S setting, not the product's. Repo law (AGENTS.md, "DEFAULTS FIRST"): the contract is the
default experience; a user's settings are a second probe and are often their attempt to COMPENSATE
for the very bug being reported. Raising the ceiling to 320 is precisely such a compensation.

Drive the identical three-flick pattern at the DEFAULT 220 and publish the fingerprint table.

**Specific worry, which the measurement must answer:** a constant `gainRampNotchSpan = 20` was
chosen so a 12-notch flick lands below 320. At 220 there is LESS headroom, so the first flick may
saturate anyway — in which case the accumulation you just restored does NOT exist for a default
user, and the bug is only fixed for the one person who raised their ceiling. It is also possible
the longer ramp makes the FIRST flick weaker at 220 than it was before your change. Both are
regressions; measure for both.

## Job 2 — if defaults do not climb, make the ramp CEILING-INDEPENDENT

`99f0550`'s intent was right: raising the ceiling must not change acceleration, which is why it
moved the ramp off the cap. Your constant 20 re-couples feel to the ceiling in the other direction
— now the ceiling determines whether accumulation is reachable at all.

The honest invariant is neither "ramp = cap × k" nor "ramp = impulse × constant". It is:

> **A hard first flick must land BELOW the ceiling with headroom left for at least two more
> same-direction flicks — at ANY configured ceiling.**

Derive the ramp span from that requirement (headroom-relative), so accumulation is reachable at
220, at 320, and at whatever a user sets. If you conclude a constant genuinely satisfies it across
the supported ceiling range, prove it with a table across ceilings (e.g. 120 / 220 / 320 / 480)
rather than asserting it.

## Job 3 — merge, then re-verify

The branch is 8 commits behind `origin/main` (documentation only: conductor doctrine, AGENTS.md
laws, gitignore). `git fetch origin && git merge origin/main` — expect no source conflicts.

## Acceptance

- Fingerprint tables at 220 AND 320, same pattern, both strictly climbing.
- A ceiling sweep proving accumulation is reachable across the range.
- The `glide-accumulation` contract must exercise the DEFAULT ceiling as its primary case; keep a
  raised-ceiling case as a second row.
- Positive control still required and quoted (your `Expected > 320; Received 320` mutation was the
  right shape — do the equivalent at the default).
- Full checker suite ONCE at the end, exact exit codes. Do not run contracts 3x while iterating.

Keep driving as your inner loop. Full descriptive names, 80 columns, ivue conventions. Commit
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; clean tree.
