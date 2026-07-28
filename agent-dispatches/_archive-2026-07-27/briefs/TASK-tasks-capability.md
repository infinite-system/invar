# TASK — #156: the tasks capability (`.invar/tasks.json`, `.vscode/tasks.json` compatible)

Work ONLY in `/tmp/conductor-tasks` (branch `feat-tasks-capability`, cut off latest main).
Do NOT run `scripts/merge-gate.sh`; do NOT push/merge/tag/delete. Report to
`/tmp/tasks-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`, then `bun install` FIRST.

## The reduction (the user's, 2026-07-27 — do not redesign it)

An agent is not a feature to build into the editor — it is **a process the workspace declares it
wants running**. Once that is the framing, "load a terminal agent", "run a dev server" and "open a
shell in the right place" are ONE capability, and the editor needs no knowledge of any of them. VS
Code already reduced this to `tasks.json`; adopting the shape means users' existing files work and
nothing new has to be learned.

This REPLACES the idea of swapping an in-terminal agent's context. The user dropped that for a
stated reason worth preserving: codex's context limit is 250k against claude's 1M, so the two are
not interchangeable and an in-place swap would pretend they are. Give people the mechanism to
declare whichever agent they want, per directory, with full customisation.

## Config resolution, in this precedence

1. `.invar/tasks.json` — if present it WINS OUTRIGHT.
2. `.vscode/tasks.json` — used only when there is no `.invar/tasks.json`, so a repo already set up
   for VS Code works on open with zero migration.
3. Neither → the built-in default (below).

**Precedence, never a union.** Do not merge the two files: a merged config is unreadable and nobody
can predict what will run.

## The reference file — read it before designing anything

`/home/parallels/dev/realized/.vscode/tasks.json` is the live example this was reduced from. Its
shape:

```json
{ "version": "2.0.0",
  "tasks": [ { "label": "Claude", "type": "shell", "command": "/bin/zsh",
               "args": ["-lc", "…"],
               "problemMatcher": [],
               "presentation": { "group": "terminal-split", "panel": "dedicated" },
               "runOptions": { "runOn": "folderOpen" } } ] }
```

Load-bearing fields, in order of importance:

- **`runOptions.runOn: "folderOpen"`** — THIS is how the agent gets loaded. It is the whole feature.
  Without it the user still starts things by hand and nothing has been gained.
- `type: "shell"` with `command` + `args` — run it in a terminal the panel owns. **Reuse the existing
  terminal runtime; do NOT invent a second process owner.**
- `presentation.panel: "dedicated"` — one terminal per task, not a shared one.
- `presentation.group` — tasks sharing a group land in the same split (`"terminal-split"` in the
  reference puts Claude and Terminal side by side).
- `label` — the terminal's heading, and how a user re-runs it from a command.
- `${workspaceFolder}` substitution at minimum. **FAIL LOUDLY on an unsupported `${…}`** rather than
  passing it through literally — a command containing a raw dollar-brace produces a baffling error.
- `problemMatcher` — accept and IGNORE for now, and SAY SO in the invariant record. Silently
  accepting a field you honour is fine; silently accepting one you ignore is a lie unless written down.

Unsupported task types (`process`, `npm`, compound `dependsOn`) must be REPORTED as unsupported when
encountered, never skipped in silence.

## The built-in default when no config exists

    claude --dangerously-skip-permissions --continue || claude --dangerously-skip-permissions

Note `||`, not a pipe: `--continue` fails when there is no session to resume and the fallback starts
a fresh one. (The user wrote it with `|`; the reference file uses `||`, and a pipe would feed one
agent's stdout into another. This reading is deliberate — record it in the invariant record so the
next reader does not "fix" it back.)

The default is a CONVENIENCE, not a policy: overridable by either config file, and a user with no
`claude` on PATH must get a legible failure in the terminal, never a silent empty pane.

## Explicitly OUT of scope

- **The power-user agent pane stays untouched.** It is the beginnings of the deeper integration, not
  something this replaces, demotes, or refactors. Two agent surfaces coexist deliberately: the pane
  (rich, Invar-native) and the terminal task (bring your own harness). Drive the pane afterwards and
  show it is unchanged.
- No context swapping between claude and codex.
- Do NOT build the MCP bridge (that is #157) — but read the next section, because the seam is yours.

## The seam #157 will attach to — build it, do not use it

The tasks capability and the MCP bridge are **the same seam viewed twice**: a task is how an external
harness gets STARTED, and starting is the only moment you can hand a process a capability. If the
launcher is built with no thought for injection, the bridge gets bolted on later as a claude special
case.

So: the launcher must have a documented place to contribute ENVIRONMENT and ARGUMENTS to a task's
process before exec. Build that seam, leave it unused, and name it in the invariant record as the
MCP injection point.

## Acceptance

- both config paths resolve with the stated precedence, proven BY DRIVING: a repo with only
  `.vscode/tasks.json` runs its tasks on open; adding `.invar/tasks.json` takes over; removing both
  falls back to the default;
- `runOn: folderOpen` actually starts the task on workspace open, verified in a real PTY, not
  asserted from a unit test;
- `presentation.group` + `panel: dedicated` produce the side-by-side split the reference describes;
- `${workspaceFolder}` substitutes correctly, and an unsupported variable FAILS naming the variable;
- an unsupported `type` is reported, not silently skipped — WITH A POSITIVE CONTROL proving the
  report fires;
- the power-user agent pane is unchanged in behaviour (drive it, show it);
- a `tasks.invariants.md` record in its own module directory — records live at
  `src/modules/<domain>/<domain>.invariants.md`, NEVER the repo root, and are cited by ROOT-RELATIVE
  path (a bare filename silently orphans the annotation);
- the env/args contribution seam exists and is named in the record as the MCP injection point.

## Repo law you will trip over otherwise

- `export let Class = $Class` — the `Class` slot is the swappable one and must never be `const`.
- The `Static()` wrapper lives at the `$Class` ANCHOR: `export const $Class = Static($Raw); export
  let Class = $Class`. Never `Class = Static($Class)` — that leaves the anchor unwrapped.
  `Reactive()` is different: it mutates in place, so `Class = Reactive($Class)` with a raw `$Class`
  is correct. conventions-gate rules 1.8/1.9/1.95 enforce all of this across `src` AND `scripts`.
- Full descriptive identifier names, no abbreviations. 80 columns.
- A file exporting `namespace X { … Static($…) }` MUST be named `X.ts`.

## Verification — quote exact exit codes, never read `$?` after a pipeline

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` (must stay at or above
884 annotations / 67 lattice links / 0 problems), `bun scripts/check-coverage-ratchet.ts`, plus the
driven passes above.

Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
