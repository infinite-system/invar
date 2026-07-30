# 272 — the task-record system has no invariants contract

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
Priority: architecture-hygiene

## Outline

Bycatch of #235: `.invar/tasks/` layout, meta.json stamps (startedAt,
roundBriefedAtMs, landedAt), the drift signals, and the readiness rule now
feed a production UI (the tasks dashboard) AND the fleet tooling — but the
law lives only in `scripts/tasks/tasks-status.ts` header comments and the
manage-tasks skill. Author [scripts/tasks/tasks.invariants.md](../../../../src/modules/tasks/tasks.invariants.md) (or extend
the manage-tasks contract — decide against the seam rule and say why):
the folder-state machine (active → in-progress → completed/retired), the
round-stamp readiness rule (report newer than roundBriefedAtMs), the
meta.json field law, one-task-one-folder-forever. Cite the exported
readers as mechanism; the CLI --self-test and the dashboard smoke as
verification. While there: remove the unused `basename` import at
tasks-status.ts:56 (#235's nonsense bycatch).

## Invariants in scope

- NEW [scripts/tasks/tasks.invariants.md](../../../../src/modules/tasks/tasks.invariants.md); [tasks-dashboard.invariants.md](../../../../src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
  (its reality record will cite the new contract).

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report carries `## Bycatch` even if it
reads `None observed`.

## Sources

- `report-235-...md`, Bycatch 2-3.

## Bycatch fold (2026-07-29, from #291)

The #291 sweep left 316 non-mechanically-fixable bare references and one
illustrative dead link across 48 legacy records (no unique target — the
linter refuses to choose). Manual triage belongs to this task's record-
system pass.

## Bycatch from #314 (2026-07-29)

- scripts/fleet has NO fleet invariants record — dispatch/land/steer
  guard behaviour lives in shell comments + prose only; unify in a
  domain record.
- project.fleet-operations.md drift: still describes agent-dispatches/
  records and full-brief TASK.md copies; dispatch.sh now uses
  .invar/tasks/in-progress/ and a root-relative TASK.md pointer (#297).
