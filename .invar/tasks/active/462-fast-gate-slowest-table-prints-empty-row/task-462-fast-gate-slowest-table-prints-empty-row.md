# Task 462 — fast gate slowest table prints empty row

Priority: architecture-hygiene
State: ACTIVE
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high
Source: bycatch from #457 (gate determinism), reported 2026-08-02

Bycatch from #457, observed once.

A FAST gate with zero parallel jobs printed an empty ranked row:

```text
1. 0m00.000s —
```

The slowest-table reporter emits a row when it has no data. Small, but it is
a report that lies about having measured something. Make an empty set print
nothing, or print that it measured nothing.
