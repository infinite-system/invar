# TASK — RAPID-FIRE flicks throttle instead of accelerating (#138)

Builder on Invar. Work ONLY in `/tmp/conductor-rapidfire` (branch `fix-glide-rapidfire`, forked
from latest LOCAL main — remote may be unreachable, fork from local `main`). No merge-gate, no
push/tag/delete. Report to `/tmp/rapidfire-READY.md`.
`export PATH=$HOME/.bun/bin:$PATH; bun install --frozen-lockfile`.

## The user, verbatim (testing the JUST-LANDED glide fix `c51f185`)

> "glide is better but still stutters now it starts stuttering when i do massive fast flicks, many
> flicks at once, somehow it doesn't pick up speed but throttles instead"

## What we know (do not re-derive)

Three rounds just landed for the SEPARATED-flick regime — flick, ~200ms pause, flick. All drives
used that pattern. The user is now describing the OPPOSITE regime: many flicks in rapid succession,
faster than the 150 ms input-cadence window. **That regime was never driven.** The gap is ours.

The mechanism most likely responsible is the fix itself. `Momentum` now applies a HEADROOM ENVELOPE
(`followOnHardFlicksWithReservedHeadroom = 2`): flick one reserves two later gains, flick two
reserves one, flick three may reach the ceiling. Each reservation is 3/4 of a full-gain notch,
capped at 1/3 of the configured ceiling. We replaced "the cap saturates instantly" with "the
envelope holds you below the cap" — and under rapid fire the envelope may simply BE the throttle.

Ranked candidates (let the DRIVING rank them, this is a hypothesis list, not a conclusion):
1. The reserved-headroom envelope does not advance correctly when flicks arrive inside the
   continuation window — e.g. rapid notches merge into ONE gesture so the hard-flick counter never
   reaches 3, leaving velocity permanently clamped at the flick-1 or flick-2 envelope.
2. Input coalescing: many wheel notches arriving within one frame become one impulse, so 5 fast
   flicks deliver far less velocity than 5 spaced flicks. Check how notches-per-frame are folded.
3. The gain ramp (`gainRampNotchSpan = 20`) needs 20 impulses to reach full gain; rapid flicks may
   be re-entering the ramp from a reset `restEquivalentGestureVelocity` instead of accumulating.
4. Per-frame render cost under dense input (unlikely — this reads as physics, not throughput —
   but rule it out with a frame-count check rather than assumption).

## Method — Rule Zero, and the regime is the point

1. **REPRODUCE BY DRIVING FIRST, at DEFAULTS (220).** Drive the RAPID pattern: 5-8 flicks of 12
   notches with pauses of 0 / 30 / 60 / 100 ms (sweep), i.e. INSIDE and around the 150 ms window.
   Also drive one continuous burst (e.g. 60 notches in one PTY write). Print the per-frame
   row-crossing fingerprint per flick, as previous rounds did. The user's "throttles" should appear
   as peaks that FLATTEN or FALL across flicks, or a burst that crosses fewer rows than the same
   notch count delivered slowly.
2. Compare against the SEPARATED pattern (200 ms) on the same tree to prove the regime difference
   rather than a general regression.
3. Fix the mechanism the drive names. **Do not simply raise or remove the envelope** — it is load-
   bearing for the separated regime that was just proven at 120/220/320/480. Whatever you change
   must keep those tables climbing; re-run them as a regression check.
4. Contract: extend `glide-accumulation` (or add a sibling) so the RAPID regime is gated too — the
   permanent contract must cover both a separated and a rapid pattern, since the fix for one
   created the defect in the other. Count-based verdicts, positive control required.
5. Scale parity: confirm at 2k AND 100k. Defaults first, then 320 as the second probe.

## Acceptance

Rapid-fire peaks strictly climbing (or reaching ceiling and staying, if that is physically
correct — say which and why); separated-regime tables unchanged; both regimes in the contract;
positive control quoted; full checker suite ONCE, exact exit codes; wheel-consumer smokes re-run
(the census of twelve is in `/tmp/fold-feel-READY.md`).

Bycatch rules apply. Full descriptive names, 80 cols, ivue conventions.
Commit `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; clean tree.

## ADDENDUM (user, seconds after dispatch) — IT ALSO STUTTERS IN THE DIFF VIEW

> "also diff view for package-lock.json in realized/api is also better but also has that stutter"

This is a load-bearing clue, not a second bug report. The same rapid-fire stutter on BOTH the
editor and the diff surface means the cause is almost certainly in the SHARED generator (Momentum /
the wheel-to-frame path), not in either surface's own rendering. If your driving finds a
surface-specific cost instead, that is a genuine surprise and you must say so explicitly.

Required additions:
- Drive the rapid pattern on the DIFF surface as well as the editor (`SMOOTHNESS_SURFACES=editor,diff`
  is already supported by the smoothness instrument; the diff smokes are in the wheel census).
- Use a fold-dense / large JSON fixture — the user is on a real `package-lock.json`, which is both
  LARGE and structurally dense, so drive the fold-dense large fixture, not the flat one, for at
  least one comparison row.
- Report both surfaces' fingerprints side by side. If the two surfaces stutter IDENTICALLY, that is
  strong evidence for the shared generator and you can fix once; if they differ, report the
  difference — it localizes the cost.

## ADDENDUM 2 (user, critical) — IT STOPS RE-RENDERING ENTIRELY FOR A BIT

> "yes it even stops re-rendering for a bit on rapid fire, so yeah it's a big hole, we used to have
> it working just fine"

This REFRAMES the task. "Doesn't pick up speed" could be physics; **"stops re-rendering" is a
RENDER-SCHEDULING failure** — the app emits NO frames for a period while input is arriving. That is
a freeze, however brief, and it is the primary symptom now. Physics throttling may even be a
downstream effect of it (no frames -> no glide advance -> looks like a throttle).

THE OBSERVABLE, and make it count-based: during a rapid burst, measure FRAMES EMITTED PER WINDOW of
arriving input. A stall is a window where input arrived and ZERO completed frames were emitted.
Report the frame-gap sequence, not just row crossings. `PtyTestDriver` already exposes completed
frames; a stall must be visible as a hole in that sequence.

New ranked candidates for the STALL specifically (drive to arbitrate; the physics list above still
stands for the throttle):
1. RENDER CADENCE STARVATION. An absolute-deadline render cadence landed recently (the scroll work).
   If the deadline is recomputed or pushed forward on every input, a flood of notches can keep
   deferring the next frame indefinitely — input outruns the scheduler. Check whether dense input
   can postpone a frame that was already due.
2. INPUT-BATCH BLOCKING. Many notches in one PTY write processed synchronously on the event loop
   would block rendering for the duration. Note the repo already fixed one such class
   (`OpenPty.write` blocking the event loop, #81) — check whether the READ/parse side has the twin
   defect for large input bursts.
3. COALESCING THAT SWALLOWS THE REQUEST. If a render request is coalesced per revision and the
   revision keeps changing mid-flight, the pending request may be repeatedly superseded and never
   serviced.
4. Quiescence misfire: the idle path concluding "at rest" while input is still arriving, so the
   loop parks itself.

ALSO: "we used to have it working just fine" is a FEEL-BISECT invitation for the STALL, separate
from the earlier accumulation bisect. If driving does not localize the mechanism quickly, bisect
history on the rapid-burst frame-gap fingerprint the same way the accumulation regression was found
(worktrees at candidate commits, same burst, compare shapes). Candidates include the render-cadence
change from the scroll work and the fold/projection landings.

ACCEPTANCE ADDITION: no stall — during the rapid burst, every input window must produce at least
one completed frame, gated as a count. That assertion goes in the permanent contract with a
positive control (plant a deferred-deadline or a blocking read and require the red).

## ADDENDUM 3 (user) — SEVERITY: the freeze lasts SECONDS, not frames

> "yes it throttles to the point that it's not moving for a bit or even few seconds before it
> resumes"

SECONDS changes the diagnosis. Re-rank accordingly:

- **DEMOTE cadence deferral.** A deferred render deadline cannot hold for seconds; it would show as
  dropped frames, not a multi-second freeze. Keep it on the list, stop treating it as #1.
- **PROMOTE event-loop blocking / backlog drain to PRIME SUSPECT.** Two shapes, distinguish them:
  (a) SYNCHRONOUS WORK — a burst of notches performs N expensive operations in one turn without
      yielding, so nothing renders until the whole burst finishes. The repo already fixed this
      class on the WRITE side (`OpenPty.write` blocking the event loop, #81); check the READ/parse/
      dispatch side for the twin.
  (b) UNBOUNDED BACKLOG — notches queue while blocked, then the queue is drained all at once, so
      the freeze duration scales with how long the user kept flicking. TEST THIS DIRECTLY: flick for
      1s, 3s, 5s and see whether the freeze grows with input duration. If it scales, it is a
      backlog and the fix is bounded/coalesced intake, not faster per-notch work.

MEASURE THE STALL, do not just observe it:
- Report stall DURATION and the input-window count with zero frames, per burst length.
- Attribute WHERE the time goes during the stall — the same temporary per-frame attribution pattern
  the fold work used to find `BracketMatch.findInDocument`. Seconds of work has a callee; name it.
- Note that a fold-dense 100k document is the user's real case: any per-notch operation that is
  O(document) or O(fold-regions) would produce exactly this, and several such costs were fixed
  recently for the SCROLL path — check whether the INPUT/notch path has its own unfixed twin.

Bound the fix: intake must be bounded so freeze duration CANNOT scale with how long the user
flicks. State that as the invariant, with its Impossible-if-true, and gate it: a burst of N notches
must still emit frames throughout, with the no-stall assertion count-based and positive-controlled.

## ADDENDUM 4 — a SIBLING defect was just found and fixed; check for the same shape

`fix-overlay-dialog-red` (commit `7f859e1`) just root-caused the two-day overlay-dialog red, and it
is the same FAMILY as your stall candidate #3:

> `OverlayLayer.requestPaint()` mutated the reactive `paintRevision` AND separately requested a
> renderer frame. TWO OWNERS OF THE FRAME REQUEST. The direct request could serialize BEFORE the
> reactive paint effect projected the new viewport, so a STALE frame won and no later frame ever
> published the new content — the surface simply stopped updating.

That is "the render request is issued by more than one authority, and the losing order publishes
stale or nothing". Your symptom — no frames for seconds under dense input — could be the same
defect with a larger window: under rapid input the two request paths interleave repeatedly, and the
surface stops publishing until something finally forces a frame.

Check explicitly, and say what you find either way:
- Does the EDITOR/scroll path have a second frame-request authority alongside its reactive
  projection (the shape the overlay had)? One authority per boundary contract is repo doctrine
  (#103); a second one is the defect.
- Does the diff surface share that path? The user sees the stall on BOTH surfaces, which fits a
  shared request authority far better than two independent renderer bugs.
- If you find it, the fix shape is the same: remove the competing direct request, let the reactive
  effect project THEN request.

This does not replace your measurement — the seconds-long freeze still needs its callee named and
the 1s/3s/5s backlog-scaling test still decides blocking-vs-backlog. It is a strong prior, not a
conclusion.
