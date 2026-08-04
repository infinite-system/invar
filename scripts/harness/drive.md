# Drive Invar in two minutes

THE ONE ENTRY POINT is the warm DriveSession server (the one-shot flag CLI
`--key/--wheel/--click/--wait-for-status/--cells/--env` was REMOVED
2026-08-03 by user policy — fluent snippets only). `bun run drive` is an
alias for `bun scripts/harness/DriveSession.ts`.

```sh
bun scripts/harness/DriveSession.ts --serve &   # warm server, once
bun scripts/harness/DriveSession.ts --attach "await app.key('Control+j')"
bun scripts/harness/DriveSession.ts --reload    # fresh app, same server
bun scripts/harness/DriveSession.ts --stop      # when your task ends
```

Attaches run against the SAME live session, so navigated state survives
between probes. The rendezvous directory is keyed to your checkout, so each
worktree gets its own server.

Boot options (for `--serve`, or for a one-shot `--eval`/`--script` run):

- `--open PATH` — workspace to open (default: a temp workspace).
- `--size 100000` — generate and open a temporary scale fixture.
- `--geometry 100x30` — terminal size (default 220x60, a real user scale).
- `--home DIR` — persistent home; state (session restore, settings) carries
  across runs. Run twice with the same `--home` to drive restart behavior.

A snippet sees `app` (the fluent session) and `driver` (the raw
PtyTestDriver). Chains queue and run when awaited:

```sh
bun scripts/harness/DriveSession.ts --attach "
await app.key('Control+p').waitForText('Go to File');
await app.key('Escape').waitForTextGone('Go to File');
"
```

Narrow output: `--show FIELD[,FIELD]` appends one `app.show(...)` step, so a
two-key probe prints two lines instead of the full status dump:

```sh
bun scripts/harness/DriveSession.ts --attach "" --show panelVisible,frame
bun scripts/harness/DriveSession.ts --attach "await app.key('Control+j')" \
  --show panelVisible,panelListGeometry.width
```

The verb vocabulary stays primitive: coordinates, visible text, keys,
published state (`moveMouse`, `click`, `clickText`, `drag`, `key`, `type`,
`scroll`, the `waitFor*` conditions, `show`, `showScreen`, `showLog`,
`get`/`set`). Neither front door defines app-specific gestures. The full
manual is `.claude/skills/drive-pty/SKILL.md`; `--help` prints the flag
reference.

Wait discipline: every wait is a condition that is FALSE before the action
and TRUE after it. Waits compare values as JSON — pass real typed values
(`waitForStatus('panelVisible', false)`, never the string `'false'`). A wait
whose text paints both before and after the change is pre-satisfied and
verifies nothing.

Diagnostic log: the driver declares its own per-home `TUI_LOG_PATH` and drops
an inherited one, so read the app's log through the session —
`app.diagnosticLogPath`, `await app.logTail(20)`, `app.showLog(20)`.
