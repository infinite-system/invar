# Brief #350 round 3 — commit; the gate chain is missing

Your work is staged but UNCOMMITTED, and no gate has run. The report says
"Gate verdict chain: recorded at the end of this report, from the commit
hook" — that section does not exist, because you never committed.

Do now, in order:
1. `git commit` the staged work with a message describing the change. Do
   NOT use SKIP_GATE; let the commit hook run the full merge-gate.
2. When the hook finishes, append the real verdict to the report: the
   final `merge-gate` line and `GATE_EXIT=<n>` from the hook output.
3. If the gate is RED: fix, or name the failing smoke and say whether it
   is one of the known pre-existing classes (#214 panel-chrome, #337
   structure-outline timeouts).
4. Confirm `git status` is clean after the commit.

End state: a commit on fleet/350-nicer-generated-sample-video whose hook
gate ran, and the report carries the verdict chain.

## Invariants in scope

Unchanged from round 1 (the media contract, already answered record by
record in your report). This round adds no code; it commits and gates what
round 1 produced.

## Bycatch expected

Already delivered in your report; add only anything new the gate surfaces.
