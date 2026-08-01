# Summary #433 — what actually happened

Landed 7a33c34b, 83m dispatch-to-landing, three rounds.

- The FILED diagnosis (conductor's) was WRONG twice. First filing
  blamed hidden-activation pricing; driving showed the dock visible
  and a stale 1,000-row predicate. The round-1 fix was then refuted by
  the conductor's own landing gate: the predicate keyed on exit-code
  nullability, and a RUNNING gate (null exit) also adds a row.
- The real generator: `refreshGateGlance()` read the literal
  `/tmp/fleet-watch-gates`. The smoke priced the HOST fleet into its
  row counts in five places. Round 3 isolated the seam
  (INVAR_FLEET_GATE_REGISTRY), drove missing/running/finished registry
  states, and planted the baked read back as a positive control (red),
  then removed it (green).
- Rejected on the way: an activation-seed design (070c0def), blocked
  by independent invariant review (memory scales with hidden task
  population; a seed cannot create READY-reveal).
- New contract record: Harness fleet facts are isolated from host
  state. Refined the workspace-path record's boundary.
- Landed over a red proven PRE-EXISTING on main by a baseline gate at
  full concurrency: tasks:watch partial frame under load, filed as
  #436 with four gate logs. Bycatch converted: #434 (dead no-registry
  render branch).
- Left undone: #436 itself; the READY-triggered reveal policy remains
  contract-gapped (noted in round-1 report).
