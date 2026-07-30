# 90 — shared artifacts/tui.log lets runs read each other; stale lines satisfy assertions

State: ACTIVE
Created: 2026-07-28
Engine: claude
Environment: linux
Model: opus-5
Effort: medium
Priority: user-directed

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

## USER DIRECTIVE (2026-07-30 04:5x — promoted to user-directed, dispatch soon)

From the #337 report: artifacts/tui.log has no instance identity — two
concurrent plugin-manifest runs interleave geometry lines in one file and
the newest-boot slice holds both instances' lines (reproduced 2/2
concurrent pairs). Correction to this task's earlier detail: the
plugin-manifest smoke ALSO sets TUI_DEBUG_BARS='1', so "only scrollbars
enables it" no longer holds.

The user's order widens the scope: "test isolation is critical — find out
EVERY instance where we are violating test isolation and writing to the
same file polluting the results."

So this task now has two parts:
1. The census FIRST: enumerate every shared mutable path the harness and
   smokes write concurrently — artifacts/tui.log and every sibling
   (relative-path logs, fixed /tmp names, shared HOME/settings,
   .perf-history, fixed ports/sockets, fixed fifo paths). For each: who
   writes, who reads, per-run-isolated or shared, and whether pollution
   can flip a verdict (false green OR false red). The #337 report's
   measurement method (plant a foreign line, watch the reader accept it)
   is the model. Both polarities per check.
2. The fix: instance-scoped diagnostic paths (per-run log path or
   instance-tagged lines), a provenance guard in the readers, and a
   positive control that rejects a planted foreign line. Fix the worst
   class first (verdict-flipping shared writes), then sweep the rest.
