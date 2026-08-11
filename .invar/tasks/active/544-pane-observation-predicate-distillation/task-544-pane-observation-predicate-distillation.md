# 544 — pane observation predicate distillation

Priority: architecture-hygiene
State: ACTIVE
Engine: claude
Environment: linux
Model: fable-5
Effort: low

## In plain words

Five plugins now hand-build "is my pane actually being looked at" with
slightly different shapes. One shared predicate seam would make the
next gate impossible to get wrong.

## Evidence (from #542 bycatch, 2026-08-11)

- The observation predicate exists in Structure, Tasks, Monitoring,
  Database, and now Git — shapes differ by dock kind (primary dock
  painted-content, bottom panel, right dock).

## Outline

One generator (host-aware isObserved(contentId) on the application
surface or the dock hosts) that each plugin injects; the #542 gate and
its siblings consume it; delete the per-plugin copies. Seams at the
shared generator — neither duplicated nor over-unified (the dock-kind
differences are the generator's parameters, not reasons for copies).
