# Brief #339 round 2 — produce a readable gate verdict

Your rollout's hook output was truncated: no GATE_EXIT line is readable, and
your bycatch reports the behavioral-contracts step timing out twice. The
conductor lands only on a read verdict.

1. `git merge main` (record-only commits expected; report any conflict).
2. `git commit --allow-empty -m "re-gate #339 combined tree"` WITHOUT any
   SKIP_GATE, so the hook runs the full gate on the combined tree.
3. Quote the verdict verbatim in a new "## Re-gate" report section: the
   GATE_EXIT line and the final merge-gate summary line. If RED, quote the
   failing step and STOP — no bypass, no silent rerun. Note every
   starvation-class retry the tally reports.

END STATE: report newer than this brief containing the re-gate commit hash
and the quoted GATE_EXIT line.

## Invariants in scope

Unchanged from round 1; no new code.

## Bycatch expected

Per round-1 taxonomy; include the section even if "None observed".
