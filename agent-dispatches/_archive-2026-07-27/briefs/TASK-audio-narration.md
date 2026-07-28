# TASK — `audio-narration` is now hard-red and blocking commits. Find the real cause.

Work ONLY in `/tmp/conductor-narrationflake` (branch `fix-audio-narration-flake`).
Do NOT run `scripts/merge-gate.sh`. Do NOT push, merge, tag, or delete branches — the
conductor lands work. Write your report to `/tmp/narration-flake-READY.md`.
`export PATH=$HOME/.bun/bin:$PATH`.

## ⚑ DRIVE IT FIRST. Write no assertion until you have reproduced the failure.

## What happened

`smoke: audio-narration harness` failed the pre-commit merge gate at run `1182419`
**and failed its quiet retry**, blocking a markdown-only commit. Before tonight it was a
retry-tally regular: it timed out on the first parallel-pool attempt and passed on the
quiet retry, repeatedly, for days.

That trajectory is the thing to take seriously. `overlay-dialog` followed exactly this
path — retry-tally regular for two days, then hard red — and the cause was a **real
defect**: `OverlayLayer.requestPaint()` had two owners of the frame request (it mutated
the reactive `paintRevision` *and* directly asked the renderer for a frame), so a stale
frame could win. It was never load. Do not open this one assuming flake.

## Known environmental factor — resolve it, do not route around it

The narration harness wants **`espeak-ng`**, which is **not installed** on this machine.

If the smoke behaves differently with the binary present versus absent, that difference
is itself the defect. A smoke that depends on an optional external binary must either
skip explicitly with a declared, printed reason, or stub the synthesizer at a seam. It
must never *time out* — a timeout is indistinguishable from the app hanging, which is
precisely the signal this smoke exists to catch.

Do not fix this by installing `espeak-ng`. The gate must be green on a machine that does
not have it, because ours does not.

## Method

1. **Get a rate before touching anything.** Run the harness directly, 10 times, on an
   idle machine. Quote all ten exit codes. If it is 10/10 green solo, drive it again
   under a concurrent gate-sized load — contention is a test, not an excuse, and a
   smoke that only fails under load is still failing.
2. **Name what it waits on at the timeout.** Which predicate, and what the frame
   actually showed. A timeout with no captured frame is not a diagnosis.
3. **Mechanism before fix.** Connect the cause to the observed hang. Three ranked
   candidates, but let the measurement rank them, not this list:
   - the espeak-absent path blocks or never publishes instead of degrading;
   - a publication race of the `overlay-dialog` shape — two owners of one signal, so a
     stale value can win;
   - a genuinely load-sensitive wait that samples async state after a grid wait.
4. **Positive control.** Before you believe any fix, make the smoke fail deliberately
   and quote the red. A check that can only pass is not an instrument.

**Do not widen a timeout.** A wait that needs more time is hiding a defect, and widening
one to silence a red is forbidden in this repo.

## Two sibling tasks — check whether they share your generator

Two other quiet-tail intermittents are open, and all three may have one cause:

- **#109** — `agent-permissions` flakes *inside* the serialized quiet tail, so
  cross-gate contention is already ruled out for that one.
- **#124** — `terminal-follow`'s Escape-cancellation intermittent, which fails **3/3 on
  clean main**.

If your reduction explains any of theirs, say so explicitly and name the shared
generator. If it does not, say that too — a negative result here is worth reporting,
because it splits three tasks that currently look like one.

## Scale parity and defaults

Drive the **defaults** first. Only then try the user's settings, if you need to see what
their last attempt changed. Most users are on defaults, so defaults are the contract.

## Bycatch

If you notice other bugs while driving the app, report them. Do not chase them. Fix one
only if it is small, obvious, clearly correct, and in a file you already touched — and
list every such fix separately in the report so the conductor can split it out.

## Verification — quote exact exit codes

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`,
`bun scripts/check-coverage-ratchet.ts`, and the narration harness **10 consecutive
times**. One verification pass at the end — do not run the full checker suite while you
are iterating.

Full descriptive identifier names (no abbreviations), 80 columns, ivue conventions
(subclass `$Class`, never `Class`). Commit with
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>` and leave the tree clean.
