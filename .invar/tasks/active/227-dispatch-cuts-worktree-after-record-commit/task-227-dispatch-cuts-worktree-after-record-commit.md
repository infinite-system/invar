# 227 — dispatch cuts the worktree AFTER the record commit

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default
Priority: verification-integrity

## Outline

Found landing #222. dispatch.sh cuts the worktree (step 2) before the record
commit (step 4), so the branch sees the task folder under `active/` while main
moves it to `in-progress/`. #222 committed its analysis documents into its own
task folder — the intended durable-workspace pattern, now blessed — and the
merge needed a rename resolution because of the path mismatch.

Reorder dispatch.sh: guards and base-ref resolution first (all refusals before
any side effect — the validate-late lesson is already written in the script),
then the record commit (folder move, brief, meta, views, pathspec commit on
main), THEN cut the worktree from the commit that contains the move, install,
copy TASK.md, launch. The branch then carries `in-progress/<task>/` with its
brief and meta, and a builder's task-folder commits merge without renames.

Test in a throwaway clone (never the live repo), RECORD_ONLY=1 for the record
arms, both ledger arms (on main, on a branch), plus one full launch arm with a
fake agent command. The negative controls must not read `$?` after a pipeline
(that mistake is on record from the first clone test).

Also fold in: the transcript-pipe check and session-link resolution currently
run between launch and the attach printout; verify their ordering still holds
after the reorder.

## Sources

- This session, landing #222 (rename conflict UA on eight files).
- `scripts/fleet/dispatch.sh` comments (validate-late lesson, record-first
  design).
