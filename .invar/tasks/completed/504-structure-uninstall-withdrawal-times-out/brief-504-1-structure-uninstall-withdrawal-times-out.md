# Brief 504-1 — structure uninstall leaves its pane; the gate's standing red

## In plain words

Uninstalling the Structure Navigator extension sometimes leaves its pane
and status entry behind. The uninstall drive then times out. This one
defect has stained almost every merge gate for days. Find it by driving,
fix it, and make the gate finally quiet.

## End state (mechanically checkable)

A report newer than dispatch, and in your worktree
`bash scripts/smoke-plugin-manifest.sh` passes SOLO three consecutive
runs AND under two concurrent full-smoke processes.

## Evidence

- On plain main, solo: `bash scripts/smoke-plugin-manifest.sh` exits 1 at
  "uninstall removes the structure pane and withdraws its projection"
  (conductor log /tmp/pm-main-solo.log, 2026-08-04; still red in tonight's
  gates — latest /tmp/gate-521-r2.log contention tier).
- #356 history: the same assertion red at merge base twice.

## Ranked candidates (hypotheses, not a diagnosis)

1. Withdrawal races: the uninstall path disposes the contributor while a
   render or projection publish is in flight, and the disposer's effect
   never lands.
2. A leaked disposer: some registration (pane, status projection,
   command) is not in the disposer chain, so the pane survives.
3. The smoke's wait watches the wrong condition (pre-satisfied or
   watching a proxy) and the product is actually fine — prove which with
   the graph at the timeout (contributor disposer state, pane registry,
   projection registration).

## The bar

DRIVE ADVERSARIALLY per your fundamentals. Reproduce first; read the
graph at the exact timeout; separate the rivals BEFORE fixing (a probe
that distinguishes candidate 1 from 2 from 3 is the first deliverable —
say plainly if a number comes out zero). Never widen a timeout. Fix
product or instrument per the evidence and ratchet the verified behavior.
Test the surroundings: install/uninstall/reinstall cycles, other
extensions' uninstall, dirty manifest editor focus (a #356-era red),
Extensions list state after withdrawal.

## Companion chore (same area, do after the main fix)

MonitoringStats.writeLogLine enforces "Observability never crashes the
app" with prose only — add the `invariant:` annotation at the enforcement
point, and PROPOSE (do not apply) a Scope refinement naming the
monitoring log writer alongside StatusChannel in the record.

## Invariants in scope

- "Observability never crashes the app" —
  [system.invariants.md](../../../../src/modules/system/system.invariants.md)
  — the companion chore's record; answer it explicitly.
- Plugin/extension lifecycle records in
  [plugins.invariants.md](../../../../src/modules/plugins/plugins.invariants.md)
  if present — enumerate and answer record by record; a lifecycle record
  this defect violates is the headline verdict.

## Bycatch expected

Report per the taxonomy in [AGENTS.md](../../../../AGENTS.md), even when
None observed.
