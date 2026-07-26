# Diagnostic instruments — optional tooling, and how to know it exists

These are NOT run by the merge gate. They are on-demand instruments for answering a specific
question with numbers instead of opinion. **This file exists because an instrument nobody knows about
is nobody's instrument** — three separate builders tonight rebuilt measurement machinery that already
existed. Before writing a new measurement script, look here first, and when you build one that
outlives its task, ADD IT HERE.

## When to reach for one

The rule that earned this file: **a structural read produces a hypothesis; only a measurement
produces a mechanism.** Four confident diagnoses were overturned by measurement in one night — a
"missing watcher" that was transitively tracked, a "bypassed momentum generator" that was a retired
test discriminator, a "narrowed code body" that was a stale log line, and a "scroll regression" that
was six commits of flat numbers. Reach for an instrument BEFORE briefing a cause.

## The instruments

### `bun scripts/harness/measure-scroll-smoothness.ts`
Per-frame glide behaviour on the real app through the PTY. Reports, per gesture: moving frame count,
total distance, max/mean frame delta, peak velocity, fps, and bytes per frame. Reads the lowest
visible fixture line out of every completed synchronized frame, so each sample IS that frame's
scrollTop with no publish race.
USE IT WHEN: scrolling "feels" wrong. It distinguishes the two failures that feel identical —
choppiness (few frames, big steps) from low velocity (fewer rows for the same gesture).
KNOWN RESULTS: a fling runs 19-23 fps against a declared 30; and the same gesture yields ~48 rows
from idle but ~36 after a previous fling (a 45% peak-velocity deficit, because gain derives from a
decaying velocity). Both are PRE-EXISTING and intended-feel questions, not regressions.
CAUTION: send a gesture as ONE PTY write. Split across 12 writes the identical gesture lands on one
of three quantized outcomes ±35%, because progressive gain compounds from current velocity and the
chunk boundary decides the peak.

### `bun scripts/harness/measure-completion-list-latency.ts`
Keystroke-to-visible and wheel-to-visible latency for the completion popup at 10 / 1,000 / 5,000
items, plus provider request counts and popup match-preparation counts.
USE IT WHEN: a list feels slow, or when changing popup filtering/painting.
KNOWN RESULTS: key latency ~14 ms and wheel ~85 ms, both FLAT in item count. The counts are the part
people forget — they prove zero language-server requests and zero re-filters during movement.

### `bun scripts/report-graphics-capabilities.ts`
What OpenTUI reports about the CURRENT terminal, the tier Invar derives from it, and — critically —
whether any capability reply arrived at all. Writes `/tmp/invar-graphics-report.txt` as well as
printing, because the renderer's teardown restores the screen and erases anything printed inside it.
USE IT WHEN: images render at the wrong tier. Silence and a negative answer are different failures
with different fixes, and only this distinguishes them.
CAUTION: capabilities belong to the LIVE terminal. Running it in a different shell than the one with
the problem answers a different question.

### `bun scripts/check-reactive-observation.ts`
AST census of live `Ref` reads, `shallowRef` payload reads, `Reactive()` classes and version-signalled
plain fields, plus three report-only categories for construction-captured or module-scope reactive
reads. Refuses to run unless its positive-control fixture flags every category.
USE IT WHEN: a value looks stale, or after moving state between owners.

### `bun scripts/check-coverage-ratchet.ts` · `bun scripts/check-harness-wait-observation.ts`
Gate checkers, but runnable alone while iterating. The ratchet verifies DECLARED counts against
actual ones, so run it before assuming a decrease is disclosed.

## The rule every instrument here obeys

**A check that can only fail toward "pass" is a decoration.** Each of these has a positive control —
a known-bad input it must flag before its silence about real input is trusted. That rule was written
after a gate guard called `rg` (not installed), swallowed the error, and printed OK for 14 runs while
inspecting nothing; the same defect was later found in a second script. If you add an instrument here,
add its control.
