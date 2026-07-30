# #369 — the breadcrumb walk needs a geometry record; hover tone rolls three times

State: ACTIVE
Priority: architecture-hygiene
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## Bycatch from #344 (two TabBarRenderer findings)

1. Contract gap: "Tab bars share paint and hit geometry" scopes itself to
   renderWorkspace + renderBuffer; the third column walk, renderBreadcrumb,
   now carries a real geometry promise (#344: pad cells belong to the
   crumb; the separator belongs to no segment) backed only by a smoke.
   Widen the record's scope to the third walk or author a breadcrumb
   record — design decision, then annotate.
2. Distillation: the hover tone bg(palette.cursorLine) is re-rolled at
   three sites (count-badge badgeHover branch, editor-title actions
   hovered branch, crumbs). Shared generator: "a hovered bar affordance
   takes the hover tone". Draw the seam once; verify every consumer.
