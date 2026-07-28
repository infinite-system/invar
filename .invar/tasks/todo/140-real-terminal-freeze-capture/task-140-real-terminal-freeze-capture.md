# 140 — real-terminal freeze capture

State: TODO — deliberately NOT dispatched; waiting on one user check
Created: 2026-07-28
Engine: user
Environment: any
Model: —
Effort: default
Priority: performance-behaviour
Assignment note: Blocked on one check: try the rapid-fire flicks. If the freeze is gone, this closes for free.

## Outline

The harness cannot see the user's multi-second stall (user finding 22, part 3). Every instrument runs
inside a PTY the harness drives; the freeze was felt in a real terminal, and nothing that exists can
observe it there.

### The shape, as queued

An **off-by-default, bounded capture mode**: frame timestamps, input arrival times, and the top
per-frame callees — plus an analyzer with a **planted-gap positive control**, since a capture that
never shows a gap looks identical to a healthy run. The user turns it on, reproduces once in seconds,
and hands over the file; the fix then follows THAT evidence instead of a guess.

### Why it was deliberately not dispatched — a flagged omission

Its whole purpose is catching a stall that the glide fix **plausibly just eliminated**, by removing the
per-event reactive publication that was starving the frame loop. Building a capture instrument for a
symptom that may no longer exist is waste, and **only the user's real terminal can settle it**.

The check that closes or reopens this:

> **Try the rapid-fire flicks that used to freeze it.** If the freeze is gone, #140 closes for free. If
> it is not, the instrument is worth building and we know it is a different cause.

### The instrument gap this also explains

The earlier render-freeze hunt could not reproduce the stall, and there is now a mechanism for why:
**the harness almost certainly injects wheel notches slower than a real trackpad's ~150/sec burst**, so
it never creates the collision that produces the freeze. Closing that injection-rate gap is half of this
task — and it is worth doing even if the user's freeze turns out to be gone, because it means the
harness has been unable to reach a real input regime all along.

## Sources

None in this folder. Detail above recovered from the session transcript (`faf7e858-…jsonl`).
