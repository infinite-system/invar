# Brief #402 round 1 — Invar Monitoring plugin

Read the task file in this folder first — it carries the user's verbatim
request and the six-point shape. This brief adds method and boundaries.

## Method

1. Census the seams before writing: the plugin registry + contribution
   path (how Terminal/Database register — the #346-landed panel makes
   plugins content spaces), the render/paint request path (where a
   per-plugin attribution counter can hook without a second render
   model), the document/tab-switch cache (what #403 will audit — read
   its task file too), and the #393-published
   animationFrameCadenceTimerCount as the projection model.
2. Build the ONE stats provider module first (delta CPU, RSS, heap-used/
   heap-capacity via bun:jsc heapStats, file-ledger enumeration,
   per-plugin render counters), then the pane content consuming it.
   The CLI instances:watch (#376, unbuilt) will be its second consumer —
   design the module's surface for both, build only the plugin here.
3. Drive it: open the pane, open/close files, switch tabs, watch the
   ledger move; toggle logging on/off and prove off costs nothing
   (delta-sample the app WITH the monitor closed vs open vs logging —
   the monitor must name its own cost).
4. Answer the user's question IN THE REPORT: where does 206->263 MB sit
   — file-cache bytes (evictable) vs heap high-water. Real numbers from
   a driven session.
5. Contracts after it works: pane citizenship smoke arms (plugin
   enable/disable, pane opens, rows painted), counter correctness
   (open N files -> ledger shows N entries with plausible bytes; close
   -> released), monitor-closed quiescence (no timer alive when the pane
   is hidden — the #380/#393 idle contracts are the model, and your
   plugin must APPEAR in them, not weaken them). Positive controls.

## Boundaries

- The monitor must not become the burn: hidden = zero timers, zero
  sampling (assert it in the idle contract).
- No parallel render model, no second stats path — one generator, two
  consumers (#376 later).
- Enable/disable + plugins-section visibility like Terminal/Database.
- Commit BEFORE READY; report into the main checkout's in-progress
  folder for this task; header carries commit hash + GATE_EXIT read from
  the hook. Full gate on your tree.

## Invariants in scope

- Cost tracks the actively observed set — [project.invariants.md](../../../../project.invariants.md) — the core rule this plugin both obeys and makes visible.
- The tasks dashboard is a pane content citizen — [src/modules/tasks-dashboard/tasks-dashboard.invariants.md](../../../../src/modules/tasks-dashboard/tasks-dashboard.invariants.md) — the citizenship model to mirror for a new plugin pane.
- Plugin panes use the shared pane and popup hosts; Provider rendezvous is host carried; Plugin settings live in contributed schema — [src/modules/plugins/plugins.invariants.md](../../../../src/modules/plugins/plugins.invariants.md).
- Each workspace owns one panel world — [src/modules/workspace/workspace.invariants.md](../../../../src/modules/workspace/workspace.invariants.md) — decide and state whether monitoring is per-workspace or app-global (recommend app-global with one shared world; say why in the report).
- Appearance comes only from theme data — [src/modules/theme/theme.invariants.md](../../../../src/modules/theme/theme.invariants.md).
- Expect a NEW record: the monitor observes without adding load (its own
  cost bounded and named). Propose it in the plugin's contract file.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy; carry the section even when it reads None
observed. The file-cache bounds question belongs to #403 — measure and
report, do not fix eviction here.
