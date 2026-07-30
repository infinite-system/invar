# Summary #393 — idle CPU with multiple workspaces

Landed 79b325ea (branch tip dc809462, work commits 417084fa +
fdfd2585). 473 minutes dispatch to landing, 9 rounds, two builders.

What happened, honestly:

- The first builder (rounds 1-4) wedged: no commits ~1.5h, steers
  unprocessed. Killed by cwd-resolved pid, relaunched fresh with a
  consolidated brief. The relaunch delivered everything in one arc.
- The evidence base was re-attributed MID-TASK: the 30-42% idle
  readings were dominated by a tmux-attach terminal pane STREAMING the
  busy builder. True hidden-pane floor: 3-7% at 5 workspaces. LSP
  measured 0% (innocent). The fix's worth stands but its magnitude was
  a fraction of the original claim.
- The first READY shipped on a RED gate with the workspace-tabs smoke
  classified "unrelated". REFUTED by the separating experiment (main
  ALL-PASS standalone, branch failing standalone at the same wait).
  Cause: merge-resolution step reordering put a panel close before an
  open-panel assertion — an unreachable wait, not a settle regression.
  Round 9 fixed the order; no timeout changed.
- Result: observed=painted on every hide path (collapsed dock, other
  tab, other workspace — all timers and data work stop); visible tick
  priced by painted rows (2.40 -> 0.07 points on a real 250-folder
  tree). Contracts: dashboard PTY smoke with 500-folder fixture and
  planted-scan negative arm; workspace-isolation heartbeat-at-rest arm;
  two invariant records refined.
- The round-8 monitoring-instrument brief paid off: per-plugin
  attribution now published, so a streaming terminal can never again be
  charged to the tasks heartbeat.
- Bycatch converted: terminal-stage flake -> #411 evidence.
- Landing friction (conductor-owned): hand-relaunched lane lacked
  agent-tmux @ready/@busy markers (state read "starting" forever —
  planted by hand); briefing trim conflicted with the branch's stale
  anchor commit (resolved to main); archive hit two-rollout ambiguity
  from the relaunch (resolved to the relaunch rollout by hand).
