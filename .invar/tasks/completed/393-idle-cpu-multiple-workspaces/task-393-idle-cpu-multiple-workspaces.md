# #393 — CPU does not return to idle with multiple workspaces open

State: COMPLETED — 79b325ea — tasks dashboard idle cost painted-priced: hidden panes at rest on every hide path; visible tick scales with painted rows (2.40->0.07 pts)
Priority: user-directed
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## The report (user, 2026-07-30)

"I still see CPU not going back to idle when multiple workspaces are open"
— reported together with the broken build, so the running binary PREDATES
the #380 landing (5a1a52a7) and the hotfix (this commit's parent chain).

## Baseline result (2026-07-30)

The user rebuilt AFTER the #380 landing and the build hotfix: idle CPU is
still not fully back to idle. "needs deeper investigation" — this is a live
defect in current source, beyond the dashboard motion generator.

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

## Evidence addendum (2026-07-30 ~18:1x — RE-ATTRIBUTION, user-observed)

Delta measurement of the user's live instance (5 workspaces, jiffies
over 10s): iv 42.6%, tsgo LSP 0.0%. LSP is INNOCENT. User then closed a
tmux-attach terminal pane (streaming the busy #393 builder) and idle
fell to 3-7%. So: the tmux STREAMING pane dominated the 42% (legitimate
render work), and the true hidden-pane idle floor is 3-7% at 5
workspaces — not the ~30% earlier attributed. Earlier 30% reports may
also have carried a streaming pane. The fix target stands (hidden panes
must cost ~0), but the expected win is from ~3-7%, not ~30%. The round-8
monitoring readings must separate per-plugin load so streaming vs
heartbeat cannot be conflated again.
