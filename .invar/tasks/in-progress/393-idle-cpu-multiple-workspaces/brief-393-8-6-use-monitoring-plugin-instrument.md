# Brief 393-6 — use the Invar Monitoring plugin as your instrument

Addendum to the round-5 order. The scope does not change. The instrument does.

Main (already merged into your tree) now carries the Invar Monitoring
plugin (landed dae7fba9). It shows, from inside the running app:
per-plugin re-render load, timer state, and memory. Use it in BOTH loops:

1. INNER LOOP (hidden-pane fix): drive the real app, open the monitoring
   view, then hide the tasks pane through EACH hide path you are fixing.
   Watch the tasks-dashboard re-render load and heartbeat go to zero on
   the monitor. That is observed=painted verified by observation, per
   iteration, in seconds. Do not infer timer state from code reads when
   the app can show it.

2. PROPORTIONAL TICK: with the pane visible on the real-shaped tree
   (~250 task folders), read the dashboard's tick cost off the monitor
   before and after your change. Report both numbers in the READY report.
   The target stays: low single digits.

CAVEAT (do not skip): the monitor is itself a plugin with its own tick.
Take a baseline reading with ONLY the monitor open first, and subtract
it. An instrument that measures itself without a baseline is a proxy
trap.

If the monitor lacks a reading you need (for example it cannot see the
data heartbeat directly), say so in the report as bycatch — that is a
#402 follow-up finding, not yours to fix.

## End state

The READY report contains a section "Monitoring readings" with: the
monitor-only baseline, per-hide-path zero confirmation, and the visible
tick cost before/after on the real-shaped tree. Report file newer than
this brief's filing stamp.

## Invariants in scope

Unchanged from brief 393-5.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s bycatch taxonomy; monitoring-plugin gaps are
bycatch, not scope.
