# Brief 420-1 — terminal-stage stale expanded result: bisect and fix

Read the task file in this folder for the verified evidence. Method:
1. REPRODUCE BY DRIVING first: run
   bun scripts/harness/smoke-terminal-stage-harness.ts on main —
   currently exits 1 at driveAnimatedTerminalTools (:388): the
   expanded agent tool result paints the PREVIOUS command while the
   status line sees the new readline buffer.
2. BISECT by driving between 79b325ea (where this smoke was
   retry-green, load-flake only — see #411's record) and current
   main. The Field v2 landings are doc/tools-heavy; suspect any
   src/modules/terminal or panel-adjacent diffs first, but let the
   bisect decide — a structural read is a hypothesis.
3. Fix the code, never the timeout. The smoke stays as-is unless the
   bisect proves the smoke itself wrong — then refine with evidence.
4. Distinguish from #411's load-flake family in your report: this one
   is deterministic standalone.

End state: smoke green standalone AND in a full gate GATE_EXIT=0;
report names the guilty commit and mechanism.

## Invariants in scope

Terminal/panel contracts implicated by the guilty commit — enumerate
in the report once found.

## Bycatch expected

Report per the AGENTS taxonomy; None observed is a valid body.
