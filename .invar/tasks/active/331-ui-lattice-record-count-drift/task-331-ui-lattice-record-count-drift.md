# 331 — ui.lattice.md record count drifted (says 61, checker counts 63)

State: active
Priority: architecture-hygiene
Engine: codex
Model: 5.6-sol
Effort: low
Provenance: BYCATCH of #323 (quit confirmation dialog), 2026-07-30

## Drift

[src/modules/ui/ui.lattice.md](../../../../src/modules/ui/ui.lattice.md)
states that
[src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md)
holds 61 records. The invariants checker reported 63 chosen UI records
during #323's verification (checker run: 1,209 annotations, 223 lattice
links, 0 problems — the count clause is prose the checker does not
verify). Classic comment drift: a rotted enumeration stated in prose
with no record behind it.

## Work

Fix the count, or better: remove the literal count from the lattice
prose if nothing depends on it (a number restated by hand rots again;
the checker already knows the true count). If the count is load-bearing
for the lattice's derivation story, derive or cite it instead. Check
whether other lattice files carry the same hand-written-count pattern
(both polarities: find every literal record count in *.lattice.md and
verify each).
