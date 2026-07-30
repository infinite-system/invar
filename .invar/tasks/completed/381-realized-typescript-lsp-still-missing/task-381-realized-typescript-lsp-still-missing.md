# #381 — typescript lsp still missing in the realized project (reopens #294 field evidence)

State: COMPLETED — d8526062 — TS LSP discovery includes the app root: every workspace gets tooltips
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

## Clarification (user, 2026-07-30 ~08:3x)

- NOT just realized: blackline and blackline-app also have no working
  TypeScript LSP. Three external projects, same symptom — this points
  AWAY from per-project tsconfig shape and toward the shared path:
  tsserver discovery/spawn for ANY non-Invar workspace on the user's
  machine (or the workspace-open path all three share).
- The user's reproduction check: hover over ts items in the editor — NO
  TOOLTIP appears. Add hover-tooltip to the reproduction: the driven
  check is "open external project, open a ts file, hover a symbol,
  expect the hover tooltip". (Also check a second LSP surface —
  diagnostics or go-to-def — to separate "LSP dead" from "tooltip UI
  dead": if diagnostics work but hover does not, the defect is the
  hover path, not LSP discovery.)

## Evidence update (user, 2026-07-30, VERBATIM)

"lsp tooltips for ts only work in invar workspace nowhere else"

This sharpens the frame: not repo-specific breakage (realized/blackline/
blackline-app) but WORKSPACE-POSITION-specific — works only in the
workspace the app was launched from (invar). Candidate generators, ranked:
1. The language service is bound to the BOOT/first workspace and never
   spawns (or never routes) for other workspaces — #393 observed exactly
   one live language-service process with only the active workspace
   retaining it; check whether hover requests from workspace B route to a
   tsserver rooted in workspace A (wrong project root = no tooltips).
2. tsserver discovery resolves relative to the LAUNCH cwd, not the
   document workspace root.
Say plainly which candidate measures true.
