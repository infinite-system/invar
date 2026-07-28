# TASK — The two agent-state intermittents polluting every gate (#124 + #109)

You are a builder on the Invar terminal IDE. Work ONLY in `/tmp/conductor-agentflakes`
(branch `fix-agent-state-intermittents`, forked from main at `3694b23`). Do NOT run
`scripts/merge-gate.sh`; do NOT push/merge/tag/delete. Commit and report to
`/tmp/agent-intermittents-READY.md`. `export PATH=$HOME/.bun/bin:$PATH; bun install
--frozen-lockfile` first.

Two intermittents share the agent-session-state neighborhood and have been flaking gates all day.
The quiet lock removed the load excuse: both misbehave with nothing else running, so they are REAL
defects — a race in the product or a wait observing the wrong state. Both briefs demand the same
discipline: REPRODUCE with counts before diagnosing; classify wait-defect vs product race; never
widen a timeout (that converts signal to silence).

## Defect A (#124) — Escape-cancellation sometimes leaves a turn/indicator behind

`smoke-terminal-follow-harness.ts` times out at "Escape cancellation leaves no turn and no
indicator in session state". Evidence trail (worsening through the day): passed-only-on-retry in
one gate (~17:50); retried-AND-failed in another (~19:00, both attempt logs preserved in
/tmp/merge-gate-failures.3995667); isolated on clean main 1563456: FAILS 3/3; on the icons-merged
tree: 0,0,1,1 across four runs. Start here — it is the more reproducible of the two.

Method: loop the smoke 20x under quiet-exclusive, capture failing-attempt session state (the
status.json the wait reads, plus the app-side session state if you add temporary instrumentation).
The failing condition is the Escape-cancel path of an agent turn — prior work in this area: #55
(Escape cancel + stuck-spinner liveness), #64 (follow-injected turns strand the spinner; its
guarantee landed as "Guarantee injected turns cannot strand spinner"). The question the evidence
must answer: after Escape, does the TURN actually linger in the product (teardown race — fix the
product), or does the turn end correctly while the PUBLISHED state lags or skips an update (fix
the publication or the wait)? Both have precedent here; do not guess between them.

## Defect B (#109) — agent-permissions passes only on retry INSIDE the serialized quiet tail

`smoke-agent-permissions-harness.ts`, timeout-class first attempts, at least four occurrences
today including INSIDE the quiet tail with the pool finished — under the lock, "starvation-class"
is a demonstrably false label for a tail smoke; nothing else was running. Attempt-1 logs preserved
in /tmp/merge-gate-failures.3417012 and later gate failure dirs.

Same method: 20x looped runs, capture the failing attempt, classify. Plausible shared root with
Defect A: both smokes wait on agent session state published through the status channel; if
publication can skip or reorder under specific turn transitions, both flakes fall out of one
mechanism. TEST that hypothesis rather than assuming it — if the two failures have different
mechanisms, say so and fix both.

## Acceptance

- Each smoke: 20 consecutive passes under quiet-exclusive on the fixed tree (report the exact
  loop counts and any failure BEFORE the fix as the reproduction evidence).
- Assertions unchanged or STRONGER; no timeout widened.
- If the fix is in turn teardown or state publication, a unit test pinning the mechanism plus the
  driven smoke evidence.
- Full checker suite, exact exit codes; coverage declarations (counted grammar, APPEND).
- If you add temporary instrumentation for diagnosis, REMOVE it before commit or land it as a
  status-projection field if genuinely useful — no debug prints left behind.

## Rules

Full descriptive names, 80 columns, ivue conventions. The scroll-feel builder owns
Momentum/ScrollPhysics/render-loop files — stay out; your ground is src/modules/agent and the two
smokes. Commit `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <message-file>`; clean tree.
