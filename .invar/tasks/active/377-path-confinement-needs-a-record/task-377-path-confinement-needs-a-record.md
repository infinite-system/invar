# #377 — workspace path confinement has no contract record

State: ACTIVE
Priority: architecture-hygiene
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## Bycatch from #347

Workspace.resolveFileReference / Files.confineToRoot stops links opening
files outside the workspace — security-character behavior claimed by NO
record in workspace.invariants.md or system.invariants.md (only described
inside a markdown-module record). A workspace-side change sees no
contract; exactly this blindness let the #347 link defect live.

## Work

Author the confinement record (reality-kind analysis, impossibility set,
annotations at resolveFileReference/confineToRoot), per the invariants
skill. Propose-only wording in the report.
