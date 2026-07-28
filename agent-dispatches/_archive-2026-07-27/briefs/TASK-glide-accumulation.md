# TASK — successive flicks must ACCUMULATE. Find the good version by DRIVING history (#135 v2)

Builder on the Invar terminal IDE. Work in `/tmp/conductor-foldfeel` (branch `fix-fold-smoothness`,
forked from latest main `25cdf18`). Do NOT run `scripts/merge-gate.sh`; do NOT push/merge/tag/delete.
Report to `/tmp/fold-feel-READY.md`. `export PATH=$HOME/.bun/bin:$PATH; bun install --frozen-lockfile`.

## The user, verbatim — this is the specification

> "it starts but each subsequent flick doesn't increase it as it should it stumbles a bit and makes
> it feel heavy, it should just glide upwards smoothly and keep gliding without slow downs jitters
> or anything, we had that before, maybe agent can try a version from days ago, I don't know which
> commit though lol but maybe can try different checkouts and find the one that glides smooth,
> drive it rather than test with assertions, conclude, it's even interesting if it can find the
> version that was gliding well by purely driving it"

## The gap in what we just shipped — read this first

`87d25d0` landed the invariant "a same-direction notch never SLOWS a live glide" — NON-DECREASE.
Its own measured margins were `0, +1, 0`. FLAT. That contract is fully satisfied by the behaviour
the user is complaining about: the flick lands, nothing gets worse, nothing gets faster.

**The property the user wants is ACCUMULATION: each same-direction notch during a live glide must
INCREASE velocity by its gain-ramped impulse, not merely fail to reduce it.** Non-decrease is the
weaker sibling and we asserted it by mistake. Strengthening that invariant is part of this task.

PRIME SUSPECT, test it early: the velocity CAP. The user runs a raised "Vertical fling ceiling"
(they mentioned 320). If the first multi-notch gesture already saturates the ceiling, later notches
have nowhere to go and are absorbed — which feels exactly like "heavy" and "stumbles". Check where
the cap is applied relative to impulse accumulation, and whether the ramp is computed against a cap
the glide has already reached. Other candidates: gain ramp resetting per notch; the reversal
detector mis-firing on a same-direction notch; the from-rest single-row floor being applied to a
continuation.

## METHOD — drive, do not assert. This is a change of method, follow it.

**Phase 1 — feel the current build.** Launch the app in your own PTY, open a large file, and send
a REALISTIC pattern: flick, short pause, flick, short pause, flick — the way a human scrolls a long
file. Watch it. Record for each gesture the PER-FRAME ROW-CROSSING SEQUENCE (not FPS, not the
mean). That sequence is the fingerprint of feel: `3,3,3,3` glides; `5,1,5,1` at the same average
stumbles; a sequence that does not grow across successive flicks is "heavy".

**Phase 2 — bisect HISTORY by driving.** The user believes an older build glided correctly. Find
it. Create scratch worktrees at candidate commits, `bun install --frozen-lockfile` in each, and
drive THE SAME pattern with THE SAME settings, capturing the same fingerprint. Compare sequences
across commits. Do not use pass/fail thresholds — compare SHAPES, and say which one climbs.

Candidates on the scroll/momentum path, newest first:
`87d25d0` `674cfdd` `3baba8a` `1f745b1` `3d45b56` `d61124d` `1ae7ec2` `99f0550` `40d244b`
Bisect properly (halve the range), do not walk them one by one. `40d244b` "one fling profile on
both axes + progressive impulse gain" and `99f0550` "ramp gain by impulse not cap" are the two most
likely to bracket the change in feel — note that `99f0550`'s message says the gain ramp was
deliberately moved OFF the cap, which is suspicious given the prime suspect above.

**Phase 3 — name the delta.** Once you have a commit whose fingerprint climbs and a later one whose
fingerprint is flat, diff them on the momentum path and name the mechanism. That is the finding.

**Phase 4 — fix, then lock it in.** Restore accumulation without reintroducing whatever the later
commits were fixing (read their messages and invariant records; they were solving real defects —
reversal handling, from-rest flooring). Only AFTER the drive feels right, write the contract:
successive same-direction notches must produce a STRICTLY INCREASING per-gesture peak until the cap
is genuinely reached, and the cap must be reachable rather than pre-saturated. Positive control
required.

Do NOT run `behavioral-contracts.sh` while iterating. Do NOT run it 3x. One instrument at a time.
Full suite ONCE at the end.

## Honest outcomes, all acceptable

- A commit is found where it climbs -> name the regressing change and fix it.
- No commit climbs -> the user is remembering a feel that never existed; say so with the
  fingerprints as evidence, and then make it climb anyway, because the SPEC above is what they want.
- The cap is the cause -> say so plainly; the fix may be as small as where the ceiling is applied.

## Final verification only

`bunx tsc --noEmit`, `bun test`, conventions gate, invariant checker `--all --refs`, coverage
ratchet, `behavioral-contracts.sh` ONCE, folding + editor smokes once. Exact exit codes. Report the
fingerprints (before, after, and per bisect step) — those tables ARE the report.

Full descriptive identifier names, 80 columns, ivue conventions. Commit
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; clean tree.
