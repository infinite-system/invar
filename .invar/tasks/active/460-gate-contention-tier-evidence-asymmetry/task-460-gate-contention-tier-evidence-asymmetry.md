# Task 460 — gate contention tier evidence asymmetry

Priority: verification-integrity
State: ACTIVE
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high
Source: bycatch from #457 (gate determinism), reported 2026-08-02

The conductor’s finding at #457 landing, not the builder’s.

#457 moved four checks to the report-only contention tier. Three carry
reproduced evidence. `git-watch` does not: it passed on retry ONCE and was
not reproduced. The same report refused to move `bounded-list popup` on
exactly that evidence, calling one unreproduced retry "not enough to weaken
a deterministic correctness claim".

Two checks, one evidence class, opposite rulings. Decide the rule and apply
it to both: either one unreproduced retry is enough to move a check, or it
is not. Write the rule into the contention-tier record so the next
reclassification is not a judgement call.

Then gather a real rate for both `git-watch` and `bounded-list popup`:
several loaded runs each, recorded, before either stays where it is.

## Evidence
Report `.invar/tasks/completed/457-*/report-457-*.md`, sections "Blocking and
contention tiers" and "Bycatch".
