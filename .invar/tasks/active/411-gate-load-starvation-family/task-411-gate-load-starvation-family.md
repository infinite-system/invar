# #411 — the gate's parallel pool starves smokes into retry-greens

State: ACTIVE
Priority: verification-integrity
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## Origin — #408 round-2 bycatch, consolidating today's evidence

At least five distinct smokes (panel-chrome, markdown, layout,
git-watch, behavioral-contracts) passed only on retry across six gate
runs on 2026-07-30 — including at base commits before any branch
change. Common factor: gate LOAD, not any one smoke. A retried green is
exactly what this repo has been burned by. Related observations: #393's
six-worker starvation list, #409's markdown arm, #381's editor timeout,
the #214/#359/#385 family. Fix the MACHINERY, not the smokes: measure
pool-width vs starvation rate, consider deadline-aware scheduling or a
lower default worker count, and make the retry tally a first-class gate
output the conductor reads at every landing.

## Evidence addendum (2026-07-30 ~18:5x, #393 bycatch)

smoke-terminal-stage-harness failed its tool-result expansion wait twice
in one gate and once standalone on the #393 branch, then passed
unchanged on current main, standalone on the branch, and in the next
full gate (all 66 jobs, no retry). Builder changed no timeout or code.
Same retry-green shape as the rest of the family. Also: the
behavioral-contract serial step needed its permitted retry in the
green gate.
