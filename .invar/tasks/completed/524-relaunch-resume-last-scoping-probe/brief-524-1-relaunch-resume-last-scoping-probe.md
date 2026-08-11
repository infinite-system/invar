# Brief 524-1 — resume --last scoping probe, then the shared resolver

## In plain words

Prove whether resuming a dead builder can grab the WRONG conversation
(the most recent one anywhere instead of this worktree's). If it can,
build the one shared lane-rollout resolver and fix relaunch through it.
Two queued tasks, one lane, in their dependency order.

## Items

1. [#524 probe](task-524-relaunch-resume-last-scoping-probe.md): two
   scratch worktrees, two codex sessions, deliberate interleaving; kill
   lane A; relaunch lane A; the rollout file identity proves whose
   conversation resumed. Both polarities: a control where the right
   session resumes, and the crossing case. The verdict is the
   deliverable even if it refutes.
2. [#525 resolver](../../active/525-shared-lane-rollout-resolver/task-525-shared-lane-rollout-resolver.md):
   IF the probe proves crossing (or regardless — the duplication stands
   on its own): extract ONE lane-rollout resolver (thread-id first,
   cwd-scan fallback) into shared fleet support; steer.sh and
   fleet-watch.sh call it; if #524 proved crossing, relaunch.sh resumes
   by resolved id through the same seam. Self-test with a planted
   rollout fixture, both polarities.

## The bar

Never kill user Invar instances; scratch worktrees + scratch codex
sessions only (echo backend or trivial prompts); the probe's kill uses
cwd-resolved pids, never name patterns. Each script change keeps its
self-test green (steer.sh/fleet-watch.sh/relaunch.sh all have them or
gain one).

## Invariants in scope

None (fleet scripts); the never-search-to-kill and steer-verify-
delivery rules from the conductor doctrine bind the probe's method.

## Bycatch expected

Report per the taxonomy in [AGENTS.md](../../../../AGENTS.md), even when
None observed.
