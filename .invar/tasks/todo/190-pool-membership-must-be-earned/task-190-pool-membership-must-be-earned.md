# 190 — a smoke may not enter the concurrent pool by default

State: TODO
Created: 2026-07-28 (reconstructed from the conductor task list during the ledger migration)

## Outline

a smoke may not enter the concurrent pool by default.

> RECONSTRUCTED ENTRY. This outline was rebuilt from the session task list when `.invar/tasks/` was
> created. Where a brief or report exists beside this file, THOSE are the primary sources and carry the
> full mechanism, measurements and refutations. Where they do not, the detail for this task lives in
> `project.ledger.md` and in the commit that closed it — this file is a stub with an honest label
> rather than invented specificity.

## Files in this folder

- `task.md` — this outline.
- `brief-N-<date>.md` — each brief sent to an agent, numbered in send order. A follow-up brief is a
  NEW file, never an edit of the previous one: steering that overwrites its predecessor destroys the
  record of what the agent was actually working from when it made a decision.
- `report.md` — the agent's READY report, verbatim.
- `summary.md` — what actually happened, written after landing: outcome, what was refuted, what was
  left undone. Distinct from the report, which is the agent's own account.
- `meta.json` — branch, worktree, engine, base commit, timestamps.
- Transcripts are NOT stored here; they are gitignored under `tmp/transcripts/`.
