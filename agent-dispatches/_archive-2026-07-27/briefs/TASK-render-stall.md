# TASK — the app STOPS RE-RENDERING for seconds under rapid input (#138 part 2)

Builder on Invar. Work ONLY in `/tmp/conductor-stall` (branch `fix-render-stall`, forked from
latest LOCAL `main`). No merge-gate, no push/tag/delete. Report to `/tmp/render-stall-READY.md`.
`export PATH=$HOME/.bun/bin:$PATH; bun install --frozen-lockfile`.

## The user, verbatim — this symptom is UNADDRESSED

> "it even stops re-rendering for a bit on rapid fire, so yeah it's a big hole"
> "yes it throttles to the point that it's not moving for a bit or even few seconds before it
> resumes"
> "also diff view for package-lock.json in realized/api is also better but also has that stutter"

A sibling task just fixed a genuine THROTTLE (velocity discarded at the ceiling; rapid input now
sustains capped speed — commit `0ac5996`). That work is landing separately. It did NOT investigate
the freeze: its report contains no frame-gap measurement, no stall reproduction, and no diff-surface
drive. **Do not re-fix the throttle. Your subject is the FREEZE.**

## What makes this different from a throttle

A throttle means motion is slower than it should be. A FREEZE means the app emits NO completed
frames for a period while input is arriving — seconds, per the user. Those need different
observables. Physics numbers (row crossings, velocity) can look fine across a freeze because they
are sampled from frames that did eventually arrive.

## Method

1. **REPRODUCE BY DRIVING, at DEFAULTS (ceiling 220), on a LARGE FOLD-DENSE fixture** — the user is
   on a real `package-lock.json`, which is large AND structurally dense. Drive BOTH the editor and
   the DIFF surface (`SMOOTHNESS_SURFACES=editor,diff`); the user sees it on both, which points at
   a shared path rather than one renderer.
2. **THE OBSERVABLE IS FRAME GAPS, not row crossings.** Instrument completed-frame arrival while
   input is being written. Report the frame-gap sequence. A stall is a window where input arrived
   and ZERO completed frames were emitted. Make the verdict count-based: frames emitted per input
   window.
3. **DISCRIMINATING TEST for the mechanism** — flick continuously for 1s, 3s, 5s and compare freeze
   duration:
   - freeze GROWS with input duration -> UNBOUNDED BACKLOG. Notches queue while blocked and drain
     later; the fix is bounded/coalesced intake, not faster per-notch work.
   - freeze CONSTANT regardless of duration -> a single blocking operation per burst; find its
     callee.
4. **ATTRIBUTE THE TIME.** Seconds of work has a callee — name it with the temporary per-frame
   attribution pattern that found `BracketMatch.findInDocument` earlier (see
   `/tmp/fold-scroll-READY.md`). Suspect any per-notch operation that is O(document) or
   O(fold-regions): the SCROLL path had several such costs fixed recently; check whether the
   INPUT/notch path has an unfixed twin.
5. **STRONG PRIOR from a sibling fix** — `7f859e1` root-caused the two-day overlay-dialog red as
   TWO OWNERS OF THE FRAME REQUEST: `OverlayLayer.requestPaint()` mutated the reactive
   `paintRevision` AND separately asked the renderer, so a stale frame could win and nothing
   superseded it. Check whether the editor/diff scroll path has the same shape — a second
   frame-request authority alongside its reactive projection. Repo doctrine is one authority per
   boundary contract (#103). This is a prior, not a conclusion; the measurement decides.

## Acceptance

- Frame-gap evidence before and after, both surfaces, at 2k AND 100k (scale parity).
- The mechanism NAMED, with attribution — not "it is faster now".
- Permanent contract: during a burst, every input window emits at least one completed frame.
  Count-based verdict, positive control required (plant a blocking op or a deferred request and
  quote the red).
- Bounded-intake invariant if the backlog test says so: freeze duration MUST NOT scale with how
  long the user keeps flicking. State it with its Impossible-if-true.
- Full checker suite ONCE at the end, exact exit codes. Re-run the twelve wheel-consumer smokes
  (census in `/tmp/fold-feel-READY.md`) — momentum/render is a shared generator.
- If you cannot reproduce a freeze, SAY SO with the frame-gap data and what you drove. An honest
  negative is a real deliverable; do not manufacture a fix.

Drive-first per AGENTS.md Rule Zero. Bycatch rules apply. Full descriptive names, 80 cols, ivue
conventions. Commit `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; clean tree.
