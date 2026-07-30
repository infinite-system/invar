# 328 — rename tui-editor -> invar + transplant the conductor session (ONLY when the fleet is still)

State: active
Engine: conductor (self-do; destructive-adjacent, not delegatable)
Provenance: USER-DIRECTED 2026-07-29
Priority: user-directed, HELD until fleet stillness

## User's words (verbatim, GOVERNS)

> yes, that's why I actually want to transplant this session into
> invar folder, rename tui-editor to invar, but I think I should only
> do it when fleet is still

(Context: the editor is named Invar; the full rename was already
pending. This record adds the conductor-session transplant and the
stillness precondition.)

## Precondition — FLEET STILLNESS (hard gate, both polarities)

- zero in-progress task folders (`.invar/tasks/in-progress/` empty)
- zero live builder tmux sessions (`tmux ls` shows no `invar/*` lanes)
- zero git worktrees under `.invar/worktrees/`
- clean `git status` in both repos
- the orphan sessions (200-pool, 205-flake-population) resolved first
Verify each arm positively (list what exists) — an empty check that
cannot see is not stillness.

## Checklist (conductor executes, in order)

1. **Anchor first** — full RESUME ANCHOR + this checklist state.
2. **Directory rename**: `mv ~/dev/tui-editor ~/dev/invar` (git repo
   moves whole; no history rewrite — the repo rule stands).
3. **Path sweeps** (grep-driven, both repos + home):
   - `~/.claude/projects/` dir naming for the NEW conductor cwd
   - context-usage.sh: CONTEXT_PROJECT_DIR default (conductor session
     project dir changes when the session cwd moves), ibr stub target
   - dispatch.sh / land.sh / steer.sh / fleet-watch.sh absolute-path
     assumptions (they mostly derive from repository_root — verify)
   - user's VSCode/host tasks that point at tui-editor paths (ASK
     before touching host-side config)
   - `.invar/tasks` records containing absolute paths (historic
     records stay as-is — history is not rewritten)
4. **Session transplant**: start/continue the conductor session with
   cwd `~/dev/invar` (new `~/.claude/projects/-home-parallels-dev-invar`
   dir is born; the old ibr-project transcripts stay archived).
   Memory: the auto-memory project dir is keyed to the ibr cwd —
   copy/merge MEMORY.md content to the new project's memory home.
5. **Watcher re-arm** from the new cwd (Monitor + cron verbatim lines).
6. **Positive control**: one no-op dispatch dry-run (DRY_RUN=1) + one
   fleet-watch self-test from the new path; a planted READY file must
   fire; the CTX rider must carry the NEW project dir in FILE=.
7. **Rename residue check** — both polarities: `grep -rn tui-editor`
   over scripts/skills/docs returns only deliberate historical
   references (records, archives); zero functional references remain.

## Acceptance

Fleet re-dispatched from ~/dev/invar with one lane green end-to-end
(dispatch -> READY -> land) proving the whole lifecycle survived the
rename; user confirms his host-side entry points work.
