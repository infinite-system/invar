# 255 — a wrapped Extensions label breaks the exact-row locator

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
Priority: flake-evidence

## Outline

Bycatch of #245, seen once and worked around, not fixed: at 150 columns the
Extensions list wrapped the label `SQLite Database Provider` onto two grid
rows, and the harness's exact-row locator could not select it. The builder
shortened its own label (`SQLite Provider`) and moved on — the shared list
renderer and the locator are both unchanged, so the trap remains for the
next long label.

Two arms to settle:

1. PRODUCT: should an Extensions row wrap at all, or truncate with the
   width-clamp policy every other row list uses (tree, structure, git)?
   Read #247's analysis if it has landed — this is the same row-generator
   family.
2. INSTRUMENT: the locator assumed one row per item. Whichever way the
   product decides, the locator must either derive row spans or the
   renderer must guarantee single rows. Reproduce FIRST with the original
   long label at 150 columns (the report says no second reproduction was
   run — that is the first gap to close).

## Invariants in scope

- The ui/extensions records naming list rows; the harness locator helpers.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report carries `## Bycatch` even if it
reads `None observed`.

## Sources

- `report-245-...md`, Bycatch.
