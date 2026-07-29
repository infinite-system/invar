# 280 — comment drift: PaneContent.interface.ts and RootView ScrollbarSync

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: low
Priority: hygiene

## Outline

Bycatch of #274, both confirmed on a second read:

1. `src/modules/ui/PaneContent.interface.ts` — first paragraph claims the
   seam is "not yet retrofitted" onto editor/tree/markdown panes; the next
   paragraph says tree and editor ARE citizens today. Reconcile with the
   present truth (#122 landed the editor as final contributor).
2. `src/modules/ui/RootView.ts` ScrollbarSync comment — says RootView
   constructs the bars and names methods that do not exist; ScrollbarSync
   constructs and owns them. Rewrite to the current owner.

Truth from the code, not the old comments; cite records where they exist.
Small task — no behavior change, doc-only diff, but each claim verified
against the current AST before writing.

## Invariants in scope

- The cited ui records only; no contract changes expected.

## Bycatch expected

Per AGENTS.md's taxonomy. The READY report carries `## Bycatch` even if it
reads `None observed`.

## Sources

- report-274, Bycatch 2-3.
