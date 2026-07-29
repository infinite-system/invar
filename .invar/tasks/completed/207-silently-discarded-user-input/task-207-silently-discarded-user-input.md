# 207 — accepted input no longer disappears silently

State: COMPLETED — fb199cb
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default

## Outline

Two user-reported input-dropping defects, landed together because they are **one shape**: input the app
ACCEPTS and then discards without saying so.

### The diagnosis was in the app's own status channel

Driving `bun run start /tmp/...` published:

```
START_REQUESTED_ROOT=/tmp/...
START_ACTIVE_ROOT=.
```

**The request and the reality disagreeing, side by side, in the app's own published status.** Nothing
had to be instrumented — the contradiction was already being published and nobody had read it. That is
the general lesson: a status channel that carries both the request and the effect makes this class of
defect self-diagnosing.

### The two halves

1. **`start` forwards its path** (#195's underlying trap) — a wrapper that accepts an argument and drops
   it is worse than one that rejects it.
2. **Quick Open** gains a bounded third fallback (a 2,000-entry directory walk) and **publishes
   `degraded`/`failed` distinctly from empty** — because `return []` could not express the difference,
   and **that distinction was the real defect** (#201).

### The reduction

**A silent drop is the interface form of a silent wait.** Both accept something, do nothing, and report
success. In both cases the repair is the same: make the failure expressible, then make it visible.

## Sources

- `brief-207-1-silently-discarded-user-input.md`
- Detail above additionally recovered from the session transcript (`faf7e858-…jsonl`).
