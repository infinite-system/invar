# 564 — describe depth and references

Priority: user-directed
State: ACTIVE
Engine: claude
Environment: linux
Model: fable-5
Effort: medium
Assignment note: conductor self-do — user order 2026-08-14 ("yes do it
as #564").

## In plain words

A shape answer now names the types it points at, and can unpack them
in place: describe tasks.all shows that reportMeta is a
TaskReportMeta, and --depth 2 expands that type right there instead of
making the agent ask again. Circular types stop at a reference instead
of looping forever.

## The shape (settled)

1. ALWAYS: `references` on every shape answer — catalog type names
   found in member/parameter/return type text. Shallow answers teach
   the reachable shape space (misses-teach philosophy).
2. OPT-IN: `--depth N` (default 1) inlines referenced interface shapes
   recursively with a cycle guard (revisited types become references
   at the cut). Bounded printing (#561) already protects output size.
3. Read-time join over the existing catalog — no new authority, no
   generation change.

## Invariants in scope

- iv-harness.invariants.md — no store/arrow change; the catalog stays
  the generated authority (#558's no-drift test untouched).

## Bycatch expected

Report per AGENTS.md taxonomy, even when None observed.
