# 305 — unknown ${...} task variables pass through to the shell (VSCode parity)

State: COMPLETED — 27c4d993 — task variables: unknown expressions pass through to the shell (VSCode parity)
Engine: codex
Effort: medium
Provenance: USER-DIRECTED 2026-07-29

## User's words (verbatim, GOVERNS)

> what i realized is also VSCode tasks are setup to run from host and Invar
> running now that i use runs from inside vm, make it passthrough like
> VSCode

Context: after #295, his realized tasks.json produced
`Unsupported task variable: ${LOCAL_DIR#/Users/one/Parallels/ubuntu2}` —
that expression is shell parameter expansion. VSCode's resolver leaves
unrecognized `${...}` untouched and the user's shell expands it; Invar's
strict refusal blocks any shell expansion from ever reaching the shell.

## Design

- Substitute the known schema (#295's set: ${workspaceFolder},
  ${workspaceFolderBasename}, ${file}, ${fileBasename}, ${fileDirname},
  ${fileExtname}, ${relativeFile}, ${cwd}, ${pathSeparator}, ${userHome},
  ${env:NAME}).
- Any OTHER `${...}` passes through UNCHANGED for the shell to expand —
  quote VSCode's variableResolver source for the unknown-variable default
  (the builder must cite the actual return, as #295 did for env).
- ${input:...} and ${command:...} remain loud refusals (features Invar
  does not implement; silently passing them to a shell would misfire).
- File variables without an active document: decide against VSCode's
  actual behavior and record the decision.
- Update the tasks invariant: fail-before-shell narrows to the refused
  classes; passthrough is recorded as deliberate VSCode parity.

## Acceptance

The realized-style command containing `${LOCAL_DIR#...}` launches and the
shell expands it (real PTY drive); refused classes still fail before the
shell; both polarities per class; positive control plants a resolution
for a refused class and the contract goes red.
