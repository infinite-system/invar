# #342 — .invar/tasks.json panes fail to load in the real app

State: ACTIVE
Priority: user-directed
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high

## The report (user, 2026-07-30)

The repo's own `.invar/tasks.json` (two zsh -lc tasks: "Claude" via
aws-vault + claude-conductor, "Terminal" via aws-vault) does not load
properly in his session. His persisted panelContentOrder carries
`task:%2Fhome%2Fparallels%2Fdev%2Finvar:2:error` — an error pane id from an
earlier attempt (index 2 is the displacement warning row).

## Conductor triage (done)

`probe-342-config-resolve.ts` (this folder): `TaskConfiguration.resolve`
parses the file CORRECTLY — both tasks normalize with right command, args,
presentation group `terminal-split`, runOnFolderOpen true, plus the expected
"Displaced: Claude" warning issue. So the defect is DOWNSTREAM: TaskLauncher
/ pane creation / the shell actually running. Unknown which.

## SAFETY RAIL — read before any reproduction

The real tasks spawn aws-vault and a claude conductor. A careless drive of
the repo root, or a smoke that opens it, spawns REAL agents. The user warns
this could fire hundreds of times across smoke runs.

- NEVER drive the app with this repo as the opened workspace root while its
  real tasks.json is in place.
- Reproduce in a FIXTURE workspace whose tasks.json copies the exact SHAPE
  (zsh -lc, compound && command, source of a profile file, an inner
  interactive `zsh -ic` wrapping a long-running echo loop) with harmless
  stand-ins for aws-vault/claude (a fake `aws-vault` script on PATH that
  execs its trailing command).
- AUDIT the guard: census which smokes/harness paths could ever open THIS
  repo root as a workspace, and whether any structural guard prevents
  folderOpen tasks from firing under the harness. If none exists, propose
  one (e.g. harness sets a documented env the launcher respects) — propose,
  with the tradeoff stated; the user mentioned believing a guard ("hardlink")
  exists — verify what actually does.

## Rival hypotheses (separate, do not assume)

1. Launch path: TaskLauncher spawn shape breaks on command+args with a
   login shell (`zsh -lc`) — env, cwd, or PTY allocation.
2. The inner INTERACTIVE `zsh -ic` inside aws-vault needs a TTY the task
   pane does not provide (or provides after the shell probed).
3. Pane layer: `presentation.group: "terminal-split"` routing fails when
   multiple folderOpen tasks plus the error row arrive together.
4. The error-row pane id persisted in settings poisons pane restoration
   (`task:...:2:error` in panelContentOrder) — a restore path defect
   independent of launch.

Evidence for which: the user says "right now it does not" — it may have
worked before; if so, feel-bisect candidates are the pane/panel landings
since (#324, #329 range).
