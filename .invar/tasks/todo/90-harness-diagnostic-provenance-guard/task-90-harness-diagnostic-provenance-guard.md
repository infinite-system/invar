# 90 — shared artifacts/tui.log lets runs read each other; stale lines satisfy assertions

State: TODO
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default
Priority: verification-integrity

## Outline

CONFIRMED WITH A MECHANISM by the flake investigation; previously a hypothesis.

`artifacts/tui.log` is SHARED. Parallel copies of the scrollbars smoke read each other's latest
`editor-scrollbar-v` lines, mixing wrap-off total rows (`502`) with wrap-on (`504`). The consequence is
not a flaky assertion — a same-smoke pool is an INVALID POPULATION, so any A/B built that way measures
cross-talk. The investigator hit this while building a scrollbars population and correctly refused to
diagnose from it.

Hidden because only scrollbars enables `TUI_DEBUG_BARS`, so the gate's DIVERSE pool never has two
readers at once. It needs two instances of the same debug-bar smoke.

What is needed:
1. **Per-run diagnostic isolation** — an instance-scoped log path, the same treatment the smokes already
   give `HOME`. `artifacts/` is repository-shared by construction, so the fix is a scoped path, not a mutex.
2. **The provenance guard this task opened for** — stamp each diagnostic line with instance identity and
   reject foreign lines, because a stale line from a previous run in the same worktree can still satisfy
   an assertion.
3. **A positive control** — plant a foreign-instance line and require the reader to reject it. A
   provenance check that never rejects anything looks exactly like clean provenance.

**The asymmetry that decides priority:** the concurrency collision produces WRONG NUMBERS; stale-line
acceptance produces FALSE GREENS. Only the first has been observed.

## Sources

None. Only the subject line above survives — no brief was written for this task.
