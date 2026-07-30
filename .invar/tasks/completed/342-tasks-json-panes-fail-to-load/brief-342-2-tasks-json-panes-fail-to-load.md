# Brief #342 round 1 — tasks.json panes fail to load

Read [AGENTS.md](../../../../AGENTS.md) fully before any work. Load
[.claude/skills/ibr/IBR.md](../../../../.claude/skills/ibr/IBR.md) and the
ivue skill. The task file in this folder IS the brief body: the reproduced
conductor triage (config layer parses fine — the defect is downstream), the
FOUR ranked rival hypotheses, and above all the SAFETY RAIL. Read it first.

The safety rail is absolute: NEVER drive the app with this repo as the
opened workspace while its real tasks.json is present — the folderOpen
tasks spawn a real aws-vault + claude conductor. Fixture-only reproduction
with harmless stand-ins, exactly as the task file prescribes. Also AUDIT
whether any structural guard stops folderOpen tasks under the harness, and
propose one if none exists.

Method: reproduce in the fixture first (drive it, see the panes fail or
succeed), separate the four rivals with observations, fix the winner, then
ratchet: a smoke arm that drives a fixture tasks.json with two shell tasks
into two live panes. Positive control per new assertion. Final pass:
relevant smokes + `bunx tsc --noEmit; echo TSC=$?` + invariants checker
--all --refs. Let the commit hook run the gate (no SKIP_GATE) — a landable
verdict chain is part of DONE. Known pre-existing red you may hit:
panel-chrome Terminal-2-list-close (#214 class) — quote it, do not chase it.

Do not run scripts/merge-gate.sh yourself. Commit in your worktree; no
push/merge/tag. READY report as `report-342-<slug>.md` here. END STATE: that
report exists with the winning hypothesis named and driven evidence.

## Invariants in scope

- [tasks.invariants.md](../../../../src/modules/tasks/tasks.invariants.md)
  — all records ("One task source controls each workspace", "Unsupported
  tasks fail visibly", "File sources report displaced built-ins" at least).
  Report each record: upheld / violated / refines.
- Panel/pane records implicated by pane creation (ui contract) — name what
  you touch. Name any record this list MISSED.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy; include the section even
if "None observed".
