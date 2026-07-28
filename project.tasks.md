# project.tasks.md — MOVED

This file is no longer the task record. It was a session-written snapshot (last full write
2026-07-25), and a snapshot of a task list is stale the moment the session moves on.

**The record is `.invar/tasks/<state>/<number>-<name>/`** — one folder per task, moved between
`todo` / `live` / `done` / `retired`, never deleted.

- **Protocol** (file layout, naming, assignment fields, numbers): `project.tasks-ledger.md`
- **Index** with the full spec per open task: `project.ledger.md`
- **Counts and drift**: `bun scripts/tasks/ledger-status.ts`

The snapshot this file held is in git history (`git log -- project.tasks.md`); its durable findings
(the 121-run flake census among them) were carried into `project.conductor.md`'s lesson families.
