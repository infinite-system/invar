# ROUND 2 — your change broke two scroll instruments. Main is GREEN; the fault is here.

Work ONLY in `/tmp/conductor-lockvalid` (branch `fix-quiet-lock-validity`, main already merged).
Do NOT run `scripts/merge-gate.sh`; do NOT push/merge/tag/delete. Append to
`/tmp/lockvalid-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`.

Your round-1 work is ACCEPTED and is genuinely good — the three-way split
(`MEASUREMENT INVALID` / `MEASUREMENT TOO SLOW` / `DRIVEN BEHAVIOUR WRONG`), not writing history
on a contended run, the step rename from "latency" to "measurement", and finding the
`idle-quiescence` upper-bound exception to the contention asymmetry. Do not redo any of it. It
even proved itself: its own gate run correctly reported

```
input-byte-flush-gate: MEASUREMENT INVALID — measurement abandoned — quiet lock unavailable
after 120 s (waited 120007 ms), holders: merge-gate quiet serial tail (pid 2167731)
```

where the old code would have printed a number. That is the fix working.

## The problem

A SOLO re-gate on a quiet machine — quiet lock held cleanly, so this is a valid measurement —
failed `behavioral-contracts` with two errors:

```
FAIL  glide-smoothness instrument did not complete
error: live-glide continuation slowed at boundary: frame 15 3->2 rows at 211.7ms (requested 200ms)

FAIL  fold-dense cadence instrument did not complete
error: SMOOTHNESS_DEPTH_REFERENCE_FPS must name the measured 100k top FPS
```

**I have already run the differential so you do not have to:** `bash scripts/behavioral-contracts.sh`
on a clean worktree at `origin/main` (`72b28a0`) exits **0**. Main is green. Your branch is not.
Your branch does not touch scroll or glide, so this is almost certainly your INVOCATION PLUMBING,
not the scroll code.

## Ranked hypotheses — measure, do not assume

1. **A required environment variable stopped propagating.** `SMOOTHNESS_DEPTH_REFERENCE_FPS must
   name the measured 100k top FPS` reads exactly like a mandatory variable arriving unset. If you
   changed how timing-sensitive entry points are invoked — through a lock wrapper, a subshell, an
   `env -i`, a new exec layer — the variable may no longer reach the instrument. This is the
   likeliest cause and the cheapest to confirm: print the instrument's environment at the point of
   invocation on your branch and on main, and diff the two.
2. **The instruments now re-acquire or contend with the lock differently.** Round 1 changed
   acquisition/abandonment. The contracts invoke instruments that "recognize an inherited quiet lock
   without reacquiring it" per `harness.invariants.md`. If your change altered inheritance, an
   instrument may now wait, abandon, or run in a different mode — which would also explain the
   211.7 ms delay overshoot in the continuation error, because a wait would push scheduled input
   late.
3. Both, with (2) causing (1)'s sibling symptom.

Note the two errors may share one cause; do not fix them as two unrelated bugs before checking.

## Constraints

- **Do NOT relax the continuation contract or the 200 ms request tolerance.** That contract (#134)
  exists because a flick arriving during a live glide used to get a from-rest impulse; it is keyed
  on motion deliberately. If your change makes scheduled input arrive late, fix the lateness, not
  the assertion.
- **Do NOT give `SMOOTHNESS_DEPTH_REFERENCE_FPS` a default to silence the error.** It is required
  precisely so a depth measurement cannot silently compare against nothing — a defaulted reference
  is the "measures nothing" failure this repo has hit five times. Make it arrive.
- Keep the round-1 semantics intact. If honouring the lock correctly REQUIRES instruments to behave
  differently, say so explicitly and update `harness.invariants.md` with the reasoning rather than
  quietly changing behaviour.

## Verification — quote exact exit codes

`bash scripts/behavioral-contracts.sh` **3x** on a quiet machine (quote each), plus the two named
instruments run directly, `bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`,
`bun scripts/check-coverage-ratchet.ts`. Also re-confirm the round-1 positive controls still fire
(lock held by another process -> `MEASUREMENT INVALID`; functional break -> `DRIVEN BEHAVIOUR
WRONG`). Never read `$?` after a pipeline.

Full descriptive identifier names, 80 columns. Commit with
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
