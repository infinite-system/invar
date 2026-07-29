# 294 — LSP + structure never load for a TS file in a secondary workspace

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
Priority: USER-DIRECTED (2026-07-29 ~16:4x, verbatim)

## Outline

User, verbatim: "Structure and lsp do not load in ../realized
project/workspace when loading a ts file there, works in the default
workspace tree, so some wiring got lost for per workspace, also types
not loading in ../realized workspace either, probably same issue of lsp
not loading it, lsp is enabled in plugins, structure too."

Symptom set (one suspected generator):
- Open a .ts file in a NON-default workspace (e.g. ../realized): the
  structure pane stays empty, LSP features absent, TYPES not resolved
  (tsserver semantics missing) — while the identical flow in the
  default workspace works.
- Both plugins are enabled — this is not an activation toggle.

Suspects (measure before diagnosing — a structural read is a
hypothesis): the LSP server / TypeScript project root captured from the
FIRST/default workspace only (cwd, rootUri, or tsconfig discovery keyed
once at boot); the structure provider's supportsPath or file-watch
bound to workspace #0's root; per-workspace plugin surface never
re-binding the language seams on workspace switch/open
(WorkspaceSet.open path). "Types not loading" strongly implicates the
server's project root, which would explain structure too (it feeds off
the same analyzer).

Fix at the per-workspace generator, not per-symptom. Both polarities:
secondary workspace gains structure + hover types + diagnostics; the
default workspace stays intact; a workspace SWITCH re-targets cleanly
both directions.

## Invariants in scope

- The LSP/TypeScript provider records; structure records (#274/#281,
  answers-or-declines); the workspace records (WorkspaceSet, confined
  roots); plugin lifetime records.

## Bycatch expected

Per AGENTS.md's taxonomy. The READY report carries `## Bycatch` even if
it reads `None observed`.

## Sources

- User message 2026-07-29 ~16:4x (verbatim above).
