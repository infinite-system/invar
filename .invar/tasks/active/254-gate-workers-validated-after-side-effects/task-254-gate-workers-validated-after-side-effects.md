# 254 — INVAR_GATE_WORKERS is validated after the gate has already taken side effects

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
Priority: verification-integrity

## Outline

Bycatch of #251, confirmed by inspection: `scripts/merge-gate.sh` validates
`INVAR_GATE_WORKERS` at line ~407, but PID publication, orphan reaping, and
failure-log publication run at lines ~279-338 first. An invalid worker value
exits 2 AFTER those side effects — the guards-go-first rule (three prior
bites, project.conductor.md family 10) violated inside the gate itself.

Move the validation into the preflight block #251 established (guards
cluster at entry). Prove both arms outside the apparatus, #251's way: an
invalid `INVAR_GATE_WORKERS` in a scratch tree must refuse BEFORE any pid
file, reap, or log publication exists (assert their absence — both
polarities); a valid value passes preflight silently.

## Invariants in scope

- The gate's preflight contract (merge-gate.sh header, extended by #251).

## Bycatch expected

Per AGENTS.md's taxonomy — you are in the gate's entry neighborhood; #251
found this one by looking, look for its siblings. The READY report carries
`## Bycatch` even if it reads `None observed`.

## Sources

- `report-251-...md`, Bycatch.
