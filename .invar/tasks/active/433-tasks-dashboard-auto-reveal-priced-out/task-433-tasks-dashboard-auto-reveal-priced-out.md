# 433 — tasks dashboard auto-reveal priced out by idle-work pricing

Priority: verification-integrity
State: ACTIVE
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high

## Defect

`417084fa` (tasks dashboard: price idle work by painted rows) broke
auto-reveal-on-READY and the large-fixture smoke step. A hidden tasks
pane now performs zero tree reads (`tasksTaskTreeReads=0`,
`tasksDataHeartbeatTicks=0`, `available=false` — probed 2026-08-01),
but auto-reveal needs a read to discover the READY row. Chicken and
egg: the pane cannot auto-show because it is not shown.

User-visible half: the dashboard no longer auto-reveals when a builder
goes READY. Smoke half: `smoke-tasks-dashboard-harness.ts` "the large
fixture shows the same compact live projection" times out — red on
every gate since 417084fa landed.

## Evidence (bisected by driving)

- `417084fa~1`: large fixture steps PASS.
- `417084fa`: the step times out; deterministic, not flake.
- Probe: fresh large fixture, 30s observation — the plugin activates
  (status projection answers) but refresh never runs while the dock is
  hidden; `rightDockActiveContent` stays `structure`.

## Direction (hypothesis, not a diagnosis)

One seed refresh at activation (a single tree read, no timers) would
let availability and auto-reveal work while keeping 417084fa's pricing
for the ongoing clocks. Rank against alternatives: a cheap
availability-only probe (existsSync + READY glob) on a slow clock, or
reveal keyed on the status projection instead of the overview refresh.
Keep "an off-screen live row owns no dashboard motion timer" green.

## Invariants in scope

- tasks-dashboard.invariants.md — "Task truth lives in the folders the
  CLI reads"; the pricing rationale in 417084fa's contract additions.

## Bycatch expected

Report per AGENTS.md's bycatch taxonomy.
