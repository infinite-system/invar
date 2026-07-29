# 295 — .vscode tasks: support the VSCode variable schema (env:, predefined), keep fail-before-shell

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium
Priority: USER-DIRECTED (2026-07-29 ~16:5x: "../realized workspace .vscode tasks doesn't recognize LOCAL_DIR, and do we have vscode compatibility with their schema?")

## Outline

Current state (measured): TaskConfiguration reads .vscode/tasks.json
and .invar/tasks.json, but substituteWorkspaceFolder supports ONLY
${workspaceFolder}; every other variable throws "Unsupported task
variable" per the fail-before-shell invariant. The user's tasks.json
uses LOCAL_DIR (likely ${env:LOCAL_DIR}) — refused by design, read as
"doesn't recognize".

Extend the substitution to the useful VSCode set, at the one
substitution seam:

- ${env:NAME} — from the app's environment; UNDEFINED env var keeps
  the fail-before-shell law (loud, named), unless VSCode semantics say
  empty-string — CHECK the reference and follow their schema.
- Predefined: ${workspaceFolderBasename}, ${file}, ${fileBasename},
  ${fileDirname}, ${fileExtname}, ${relativeFile}, ${cwd},
  ${pathSeparator}, ${userHome} — the file-scoped ones resolve from
  the ACTIVE editor document; absent context = loud refusal, not empty.
- ${input:...} and command-variables: OUT of scope this round — still
  refused loudly (record the boundary in the invariant).
- Per-workspace correctness: resolution uses THAT workspace's root
  (coordinate with #294's per-workspace wiring — do not duplicate; if
  #294 has not landed, your tests pin the workspace-root parameter,
  not the global).

Both polarities per variable class: defined resolves; undefined/
missing-context refuses loudly BEFORE the shell (extend the existing
invariant, don't weaken it). Census the user-visible error text —
"Unsupported task variable" must now name the supported set.

## Invariants in scope

- tasks.invariants.md ("Unsupported variables fail before the shell" —
  extend, don't delete); the tasks-configuration records.

## Bycatch expected

Per AGENTS.md's taxonomy. The READY report carries `## Bycatch` even if
it reads `None observed`.

## Sources

- User message 2026-07-29 ~16:5x; TaskConfiguration.ts:238-246 (the
  one-variable substitution).
