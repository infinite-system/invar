# Brief — #305: unknown ${...} task variables pass through to the shell (VSCode parity)

Read first: [task-305-unknown-task-variables-pass-through.md](task-305-unknown-task-variables-pass-through.md)
— USER-DIRECTED; his verbatim words and the design are in the record and
GOVERN. #295 landed the schema; this narrows its refusal boundary.

Arms:

1. **Passthrough**: any `${...}` not in the known schema
   (#295's set + ${env:NAME}) passes through UNCHANGED for the shell to
   expand. Cite VSCode's variableResolver source for the
   unknown-variable default — quote the actual line, the way #295's
   report quoted the env `return ''` case. If VSCode's behaviour
   differs from plain passthrough, FOLLOW VSCODE and say so.
2. **Refusal boundary kept**: ${input:...} and ${command:...} still
   fail loudly before the shell (unimplemented features; silent
   passthrough would misfire). File variables without an active
   document: check VSCode's actual behaviour and either follow it or
   keep the loud refusal — record the decision with the citation.
3. **Acceptance drive**: a real PTY task whose command contains
   `${LOCAL_DIR#/some/prefix}` with LOCAL_DIR exported — the shell
   expands it and the task runs (this is the user's realized case).
4. **Both polarities** per class; positive control: plant a resolution
   for ${input:...} and the contract must go red (as #295 did).
5. **Invariant update**: fail-before-shell narrows to the refused
   classes; passthrough recorded as deliberate VSCode parity.

## Invariants in scope

[Unsupported variables fail before the shell](../../../../src/modules/tasks/tasks.invariants.md)
— this task RENAMES/NARROWS its claim; the tasks-configuration records;
#295's contract tests are the base to extend, not duplicate.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report
carries `## Bycatch` even if it reads `None observed`.

## End state (mechanical)

READY report: passthrough driven with a real shell expansion, VSCode
citations for the unknown-variable and no-active-document decisions,
refusal boundary intact with positive control, invariant updated, green
`bun test` + tasks smokes, full gate GATE_EXIT=0 through the enforcing
hook (no SKIP_GATE commits). The conductor gates at landing.
