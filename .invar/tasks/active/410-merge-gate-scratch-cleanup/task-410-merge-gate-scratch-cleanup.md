# #410 — merge-gate scratch files outlive their gate

State: ACTIVE
Priority: architecture-hygiene
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: low

## Origin — SPRAWL entry-surge alerts, 2026-07-30

merge-gate writes per-job scratch (/tmp/merge-gate-{summary,result,
retry-outcome}.<pid>.parallel.<n>) and never removes it: 3,489 files had
accumulated from finished gates, tripping fleet-watch entry-surge alerts
(cry-wolf noise on the one channel that must stay trustworthy). The
conductor swept dead-owner files by pid-liveness once by hand.

Fix in merge-gate.sh: an EXIT trap removing the gate's own pid-namespaced
scratch, plus a startup sweep of files whose embedded pid is dead
(kill -0 check — same pattern as the hand sweep). Self-test both arms:
files gone after a normal exit AND after a kill; live-gate files never
touched by the startup sweep.
