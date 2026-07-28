# TASK — Absence assertions become content invariance (this is what makes the gate fast)

Branch: create `refactor-content-invariance` from `origin/main`.
Worktree: assigned by the conductor at dispatch. Do not touch any other directory.

## Measured context (2026-07-25 night) — read this first

Two gate runs of the SAME branch, one with a builder active and one with the fleet idle, pinned the
numbers: **parallel pool 0m52s, quiet-serial tail ~4 minutes.** The tail is the whole cost. And a
census of every gate log on disk found **121 runs, 97 green, 33 masked retries** — a quarter of runs
carried an intermittent that `retry-once-on-timeout` rescued, so the suite READ as healthy while being
~27% flaky. Two of the five worst were repaired that night (a fixture that scored the machine's whole
/tmp, and a wait predicate the pre-action state already satisfied).

The lesson that reorders this work: parallelism was never the bottleneck — TRUSTWORTHINESS was, because
every flake costs a five-minute re-run and conceals itself while doing it. Load-independence is
therefore the same property as poolability, which is why this refactor both collapses the tail AND
removes flakes. Do not treat the speedup as the goal and the robustness as a side effect; they are one
change.

A fourth fragility class exists and is NOT in scope here, so do not try to fix it: PTY backpressure. The
paste smoke runs in 2s solo and stalled ~4.5 minutes at 0% CPU inside a loaded pool because it writes a
64KB payload into a much smaller PTY buffer. Tracked separately; if you meet a stall of that shape,
report it rather than converting a wait.

## Why this is the highest-value refactor available

The merge gate has a PARALLEL POOL (fast, ~1 minute) and a QUIET-SERIAL TAIL (~5 minutes). Audit result:
all 21 quiet-tail smokes are in the tail for exactly ONE reason — they call
`assertNoCompleteFrameEmittedFor` / `awaitFrameSilence`. **Not one of them measures a duration.** Make
those assertions load-independent and every one of them moves into the pool, collapsing the tail to the
byte-arrival latency step plus the soft perf baselines. The gate goes from ~5 minutes to roughly the
pool's ~1 minute, on every commit, forever.

## The design — and the design that was already REJECTED

A frame-silence assertion claims "no frame arrived for N milliseconds". That is load-sensitive in BOTH
directions: under load it passes vacuously when nothing was rendering, and it FAILS when a legitimate
awaited repaint lands inside the window. Both were observed today.

**REJECTED — do not implement this:** recording the frame count, applying a stimulus, and requiring the
next observed frame to be the stimulus frame. This contradicts the ESTABLISHED invariant *Harness waits
observe conditions not frame ordinals* (`scripts/harness/harness.invariants.md`), whose
Rejected-alternatives section names the reason: repaint coalescing changes frame ordinals under load,
and an action whose target is already rendered may emit NO frame. Read that record before you start.

**THE DESIGN: absence-of-churn is INVARIANCE-OF-CONTENT.** The claim behind a silence window was never
about frames — it was "the same thing stays on screen". Express it as: capture the region that must hold
still, perform a CONDITION-TERMINATED action, then assert that region is byte-identical while the region
expected to change did change. No clock, no frame ordinals, immune to load and to coalescing.

Two concerns are currently conflated across ~20 places and must be separated:
- "Is the app wasting frames at rest?" — that is the SINGLE `idle-quiescence` behavioural contract in
  `scripts/behavioral-contracts.sh`, which legitimately counts frames over a 3 s window. LEAVE IT ALONE.
- "Does the interface stay stable across this action?" — content invariance, per smoke, no clock.

## Required API shape

Add ONE helper (options object — it exceeds three parameters by design, and `project.conventions.md`
requires an object there). Make the old mistakes INEXPRESSIBLE:

- the region that must hold still is a REQUIRED argument, so "nothing changed anywhere" cannot be
  written by accident;
- the region expected to change is a REQUIRED argument, and the helper must ASSERT it actually changed —
  otherwise a passing invariance check cannot be distinguished from an action that did nothing (this is
  the intrinsic liveness control, and it is why this design needs no separate one);
- NO timeout or duration parameter is offered at all. If a caller needs to wait, it waits on a named
  condition through the existing `awaitGridCondition`.

## Migration

~24 call sites across ~20 smokes. An upper bound of 18 matched a backwards-ordering pattern
(silence asserted BEFORE the settle it depends on) but only `smoke-git-blame` was confirmed by reading,
so JUDGE EACH SITE — do not sweep mechanically. For each: identify what the original window was really
protecting, express it as regions, and say so in the report. If a site's claim turns out to be
unsound rather than merely clock-bound, say that explicitly and remove it WITH a `coverage-deltas.md`
entry — the coverage ratchet will fail the gate otherwise, which is correct.

Precedent to copy: `smoke-git-blame-harness.ts` already had its 600 ms window replaced by a state
assertion after the window was proven unsound (GitWatcher's 5 s reconcile floor legitimately repaints,
so ~12% of windows contained a CORRECT repaint). That is this refactor in miniature.

## Then reclassify, and MEASURE the payoff

Once a smoke no longer calls the silence helper, move it from `quiet_serial_smoke` to
`parallel_safe_smoke` in `scripts/merge-gate.sh`. The structural guard there greps for
`assertNoCompleteFrameEmittedFor|awaitFrameSilence|performance\.now\(\) -|Date\.now\(\) -`, so a smoke
that still measures cannot be moved by mistake — trust the guard and let it stop you.

Report the measured before/after gate wall-clock with `SKIP_PERF=1`, and the final bucket counts. The
number is the deliverable: today it is 32 parallel / 21 quiet at ~4m50s.

## House rules (non-negotiable)

- Full descriptive identifier names, no abbreviations. Name the STATE established, not the steps taken.
- `.prettierrc` formatting (80 columns).
- Refine the harness invariants: the silence-window record needs replacing, and the *waits observe
  conditions not frame ordinals* record should gain the content-invariance derivation. ALL fields
  required including **Scope**; verify with EXIT CODES, never by reading a log tail.
- Run and report exit codes: `bunx tsc --noEmit`, `bun test`, `bun scripts/check-file-grammar.ts`, both
  invariant checker passes, `bash scripts/conventions-gate.sh`, `bun scripts/check-coverage-ratchet.ts`,
  `bash scripts/behavioral-contracts.sh` (idle-quiescence MUST stay green), and every smoke you touch —
  each one THREE times, because the whole point is that they no longer flake.
- Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <message-file>` (use `-F`: backticks in
  a `-m` string get executed by the shell).
- Leave the worktree CLEAN; `git ls-files | grep '^TASK'` must return nothing.
- Report to `/tmp/content-invariance-READY.md`: the API, a per-site table of what each window was
  protecting and how it is now expressed, any claim removed and its coverage-deltas entry, the new
  bucket counts, and the measured gate time.
