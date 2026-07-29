# project.tasks.md — how to see the tasks

This file is a command reference only. It holds no task list. The task system
lives in `.invar/tasks/` (one folder per task), and the protocol is the
`manage-tasks` skill (`.claude/skills/manage-tasks/SKILL.md`).

## Commands (from the repo root)

```
bun run tasks:live     # in-progress tasks: builder status + tmux attach command
bun run tasks:active   # the waiting backlog, grouped by priority
bun run tasks:done     # everything landed, latest first, with commit + summary
bun run tasks          # full report: counts per state + the five drift signals
```

`tasks:live` is the one to reach for first. Each entry shows whether the
builder is still building or has delivered, and the exact
`tmux attach -t invar/<task>` command to join and watch it.

## The generated views (same data, as files)

- `project.active-tasks.md` — auto-generated; in-progress first with attach
  commands, then active by priority, then the last 15 completed.
- `project.tasks-completed.md` — auto-generated; every completed task ever.
- `project.active-priority-tasks.md` — hand-written priority log (the why).

Never edit the two generated files. They are rewritten by
`bun scripts/tasks/tasks-status.ts write-active`, and every dispatch and
landing regenerates them.
