# 556 — iv-harness script absorption and structured task reports

Priority: user-directed
State: COMPLETED — fe4d59fd — iv-harness M3 landed: structured worker reports + metrics, drift as a graph capability, stale-server warning. This task carries the fleet's first report-meta.json.
Engine: claude
Environment: linux
Model: fable-5
Effort: high
Assignment note: conductor self-do — M2 review PASSED 2026-08-14; user
order "do m3, file the rest".

## In plain words

Three things. One: builder reports gain a small structured file next
to the prose, so questions like "how much steering did this week need"
become computable. Two: the fleet's drift detector joins the graph as
a wrapped capability (logic stays in the script; the graph parses its
output). Three: the warm server stamps which commit it booted from, so
a server predating a landing warns instead of lying politely.

## Scope (settled in discussion)

1. STRUCTURED TASKREPORT (the paper's worker-as-sensor schema):
   `report-meta.json` beside the markdown report — touchedDomains,
   invariants {upheld,stressed,violated,discovered,refined}, bycatch
   count, steering {needed,cause}, evidence pointers. TaskNode gains
   reportMeta; graph gains `metrics` (report coverage, steering
   density, invariant-verdict tallies over tasks that carry meta).
   Exported TaskReportMeta type is the schema authority.
2. WRAP RUNG 1 — tasks-status drift: HarnessDrift capability shells
   out to scripts/tasks/tasks-status.ts and parses the DRIFT section
   into structured signals; `get drift` answers. Logic stays in the
   script (the one-place record governs); absent script = absent
   capability, not an error.
3. STALE-SERVER GUARD (M2 review finding): manifest + /status carry
   the boot commit; attach compares to current HEAD and prints a
   one-line stale warning while still answering.
4. cli.ts parseFlags moves to switch (user style call).
OUT OF SCOPE: dispatch/land/probe absorption with side effects (#559);
type-shape describe projection (#558).

## The deliverable, twice

CODE: new reports + drift capabilities, metrics node, boot-commit
stamp, tests both arms, ratchet includes new modules.
VISUAL: `get metrics` answers tallies; `get drift` lists the five
signals; a stale warm server prints its warning on attach.

## Invariants in scope

- iv-harness.invariants.md all five records — "A wrapped script keeps
  its logic in one place" binds item 2 hard; "disposable cache" gains
  the boot-commit refinement (propose wording update).

## Bycatch expected

Report per AGENTS.md taxonomy, even when None observed.
