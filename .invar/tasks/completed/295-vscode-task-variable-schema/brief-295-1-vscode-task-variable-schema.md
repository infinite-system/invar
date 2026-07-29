# Brief — #295: .vscode tasks — support ${env:} and predefined variables, keep fail-before-shell

Read first: [task-295-vscode-task-variable-schema.md](task-295-vscode-task-variable-schema.md)
— USER-DIRECTED; the record governs and names the exact current seam:
`TaskConfiguration.substituteWorkspaceFolder` supports ONLY
`${workspaceFolder}` and throws on everything else. The user's real
tasks.json uses LOCAL_DIR and reads as "not recognized".

Arms:

1. **${env:NAME}** — resolve from the app environment at the one
   substitution seam. Check the VSCode variables reference for their
   undefined-env semantics and FOLLOW their schema; if VSCode
   substitutes empty, do that and record it — if not, keep the loud
   fail-before-shell refusal. State which in the report with the
   reference quoted.
2. **Predefined set** — ${workspaceFolderBasename}, ${file},
   ${fileBasename}, ${fileDirname}, ${fileExtname}, ${relativeFile},
   ${cwd}, ${pathSeparator}, ${userHome}. File-scoped ones resolve
   from the ACTIVE document; absent context refuses loudly, never
   empty.
3. **Boundary**: ${input:...} and ${command:...} stay refused loudly —
   record the boundary in the invariant.
4. **Per-workspace roots**: resolution parameterized by THAT
   workspace's root (tests pin the parameter; #294 owns the wiring —
   do not duplicate).
5. **Error text**: the refusal now names the supported set.

Both polarities per class; positive control: a planted resolution for
a refused class must red the contract.

## Invariants in scope

[Unsupported variables fail before the shell](../../../../src/modules/tasks/tasks.invariants.md)
— extend, don't weaken; the tasks-configuration records.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report
carries `## Bycatch` even if it reads `None observed`.

## End state (mechanical)

READY report: each variable class driven both polarities, the VSCode
undefined-env decision quoted from their reference, boundary recorded,
refusal text updated, green `bun test` + tasks smokes. The conductor
gates at landing.
