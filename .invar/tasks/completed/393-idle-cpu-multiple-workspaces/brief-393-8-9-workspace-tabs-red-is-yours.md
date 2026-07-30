# Brief 393-9 — the workspace-tabs red is YOURS; fix and re-gate

Your READY classified the workspace-tabs smoke red as unrelated. The
conductor ran the separating experiment and the classification is
refuted:

- main (ca5b4ca5), standalone: ALL-PASS.
- your tree (417084fa), standalone: FAILS at the same wait — "Timed out
  waiting for the retained workspace sessions settle in the selected
  panel world". Three failures on your tree (twice in-gate, once
  standalone), zero on main.

The branch broke it. Ranked hypotheses, not a diagnosis:

1. UNREACHABLE WAIT: the smoke's status publication ("retained
   sessions settle") is published by a tick or heartbeat your change
   stops when a workspace is not active or its pane is not painted. The
   mutation still happens; the publisher went dormant; the wait can
   never fire. Walk mutation -> reachable publisher -> observed
   condition for that status path.
2. The settle logic itself now runs lazily and the smoke's scenario
   (retained sessions across a workspace switch) never re-enters the
   painted state that would run it — meaning REAL user-facing settle
   behavior regressed, not just the smoke.

Distinguish 1 from 2 before fixing: if real settle behavior regressed,
the fix must restore it without reintroducing hidden-pane cost (the
painted-cost bound you just built stays green). Never widen the
timeout.

## End state

- smoke-workspace-tabs-harness ALL-PASS standalone on your tree AND in
  a full gate with GATE_EXIT=0 read from the log.
- The painted-cost contracts and both your new smokes still pass in the
  same gate.
- New READY report, newer than this brief's filing stamp, stating which
  hypothesis held.

## Invariants in scope

Unchanged from brief 393-5, plus the two records your branch edits
(dashboard observed-is-painted; project cost-tracks-observed-set) must
still verify.

## Bycatch expected

Report per the AGENTS bycatch taxonomy; None observed is a valid
section body.
