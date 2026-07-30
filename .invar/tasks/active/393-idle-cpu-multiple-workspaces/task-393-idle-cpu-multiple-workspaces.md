# #393 — CPU does not return to idle with multiple workspaces open

State: ACTIVE
Priority: user-directed
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## The report (user, 2026-07-30)

"I still see CPU not going back to idle when multiple workspaces are open"
— reported together with the broken build, so the running binary PREDATES
the #380 landing (5a1a52a7) and the hotfix (this commit's parent chain).

## Order of work

1. FIRST establish the baseline on a current build: the user rebuilds after
   the hotfix; if idle CPU is then fine, this task closes as
   already-fixed-by-#380. A measurement on the old binary is not a data
   point against current source (#380's report proved exactly this class:
   the old --smol binary had a closed-pane cost current source lacked).
2. If it reproduces on current source: extend the #380 toggle-matrix probe
   to a MULTI-WORKSPACE fixture (two or more workspace folders open) and
   isolate which per-workspace subsystem keeps ticking while idle
   (watchers, LSP, terminal pollers, dashboard per-workspace instances).
3. Same discipline: /proc stat sampling arms, timeless count-based
   contract, positive control.
