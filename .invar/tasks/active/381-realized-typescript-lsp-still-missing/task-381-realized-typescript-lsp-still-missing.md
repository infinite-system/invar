# #381 — typescript lsp still missing in the realized project (reopens #294 field evidence)

State: ACTIVE
Priority: user-directed
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## The report (user, 2026-07-30 ~08:0x)

Open the realized project, open any ts file (example:
BlChooseFieldClass.ts) — the TypeScript LSP is missing. The user believes
this was filed before: it was — #294 (lsp/structure dead in secondary
workspace), COMPLETED e23235c3 as "does not reproduce on main; realized
driven clean" with a two-workspace contract + process-root fingerprint
added. The field says otherwise: the mismatch persists on the user's
machine, so the completed diagnosis missed the field condition.

## Direction

The #294 instrument drove realized clean in-harness — so the difference
is environmental: the user's build (older --smol), the workspace-open
PATH (opened as second workspace vs directly?), tsserver discovery on
the user's PATH/node version, or the project's tsconfig shape. Read
#294's report first (completed folder); brief the delta hunt as an
experiment with the user's exact conditions, not a repeat of the clean
drive. May need the user's terminal for final verification — say so in
the report if in-harness reproduction fails again (do not fabricate a
fix for an unreproduced bug).
