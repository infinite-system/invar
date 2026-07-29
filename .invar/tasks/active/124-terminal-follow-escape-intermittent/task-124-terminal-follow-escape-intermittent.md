# 124 — terminal-follow's Escape-cancellation intermittent

State: ACTIVE — but see "State discrepancy" below; a fix was demonstrated and may have landed
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default
Priority: flake-evidence

## Outline

`terminal-follow`'s Escape-cancellation smoke went from occasional to **deterministic: 3/3 failures on
clean main**. Worsening, and no longer deniable as load.

### What the quiet lock did to the diagnosis

This is one of the flakes the machine-wide quiet lock (#84/#147) reclassified. The lock's real value
turned out not to be preventing contention but **stripping the load alibi**: #124 misbehaves with
nothing else running, so it is a real defect rather than a scheduling artefact. Same for its sibling
#109 (agent-permissions), which flakes INSIDE the serialized quiet tail where contention is excluded by
construction.

### The dispatch condition, and why it is recorded

Investigation requires a quiet machine — running it alongside five builders poisons the exact
measurement that distinguishes a defect from contention. Recorded dispatch condition: **no other
builder live.** Written down because an undispatchable task with no stated condition looks identical to
a neglected one.

### The brief's method

1. **20× looped reproduction before any diagnosis.** Assumed mechanisms went 0-for-5 that week.
2. **Then classify: product race vs stale publication.** Escape-cancel either genuinely leaves a turn
   behind (fix teardown) or the turn ends correctly while the published state lags (fix publication).
   These need opposite repairs, so the classification is the work.
3. **Never widen a timeout.**
4. The shared-root hypothesis with #109 — both smokes wait on agent session state through the status
   channel — was carried as something to TEST, not assume.

### The result

**Publication race, as suspected, but with proof.** `interrupt()` tears down correctly and
synchronously; the *status file* could retain the previous rendered `running` frame. The fix schedules
one guarded render-revision pulse after the synchronous stack unwinds.

Reproduction was emphatic: **16/20 failures before → 20/20 passes after.**

A detail that raised trust in the report: the builder's FIRST attempted fix — an eager synchronous
pulse — still failed in its probe series and was **rejected rather than shipped**.

### The refuted unification

The three quiet-tail intermittents (#124, #109, and the narration flake) were asked to collapse into one
class. They do not: the narration reduction does not explain #124 or #109, because both of those change
visible cells and bump `renderRevision`. **They split into three independent defects.** That negative
result is worth more than a false unification and should not be re-derived.

### State discrepancy — resolve before acting

The session record lists #124 among the day's landed work, but `git log --all` on this repo finds no
commit naming #124, `terminal-follow`, or Escape cancellation, and no `*124*` branch or tag survives.
The tracker still carries it as pending. Before re-dispatching, check whether the pulse fix is present
in the source; re-doing a landed fix and leaving a landed fix undone are both live possibilities and
this record cannot distinguish them.

## Sources

- [brief-124-1-terminal-follow-escape-intermittent.md](brief-124-1-terminal-follow-escape-intermittent.md)
- Detail above additionally recovered from the session transcript (`faf7e858-…jsonl`).
