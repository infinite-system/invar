# Brief #393 round 5 — relaunch: one consolidated work order

Your predecessor session wedged after round 1 (no commits, steers
unprocessed); the worktree is intact at c290ef74. Execute in order:

1. MERGE current main into this branch (many landings since your base:
   panel v2, layout tiling, workspace isolation, LSP discovery,
   monitoring plugin). Your Bootstrap projection and dashboard-smoke
   changes must reconcile with main's versions — both intents hold.
2. THE FIX (user evidence, two parts):
   a. A HIDDEN tasks pane still polls at ~30% CPU in the same
      workspace; switching to another pane stops it. Verify the
      isObserved derivation: suspected selected-vs-painted. Fix:
      observed = painted, from the same generator the panel uses to
      paint. Every hide path flips it (dock toggle, panel collapse,
      tab switch, workspace switch).
   b. Even VISIBLE, a 1s data tick costing ~30% on a real-sized tree is
      a defect in the tick: profile where it spends (full-tree re-read,
      per-session tmux probes, row rebuild), then make cost
      proportional — mtime-guarded incremental reads, probe only
      painted rows, rebuild only changed rows. Target low single digits
      visible-idle on a ~250-folder tree.
3. CONTRACTS: real-shaped fixture (hundreds of task folders — build it,
   never this repo's live tree); per-hide-path zero-timer arms; a
   visible-idle cost arm (count-based: reads per tick bounded by
   painted rows, not tree size); positive controls.
4. ONE full gate at the end; commit BEFORE READY; report into the main
   checkout's in-progress folder with commit hash + GATE_EXIT from the
   hook.

## Invariants in scope

- Dashboard motion exists only while observed — [src/modules/tasks-dashboard/tasks-dashboard.invariants.md](../../../../src/modules/tasks-dashboard/tasks-dashboard.invariants.md) — REFINES: observed means painted; propose wording.
- Cost tracks the actively observed set — [project.invariants.md](../../../../project.invariants.md) — the visible tick must obey it too.
- Harness input and output use the real PTY — [scripts/harness/harness.invariants.md](../../../../scripts/harness/harness.invariants.md).

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy; carry the section even when it reads None
observed.
