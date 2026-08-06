---
name: drive-pty
description: >-
  Drive the Invar app through a real PTY as an agent: the fluent DriveSession
  (moveMouse/click/clickText/key/type/scroll), the warm drive server
  (--serve/--attach, one boot, many probes), the --mirror mode a human watches
  live (pointer trail, click rings, scroll marks, humanPace), and the live app
  graph (get/waitFor/set/awaitTransition — any app state by path, no publish
  tax). Use when probing the running app, demoing agent control visibly,
  writing drive snippets, debugging why a gesture or wait misbehaves, or
  deciding between graph waits and screen waits. Encodes the hard-won rules:
  ask the screen instead of hardcoding cells, graph sequences / screen
  asserts, waits are conditions never sleeps, set is experiment-only.
---

# drive-pty — driving the app like a hand, observing it like a debugger

## THE AGENT'S PRIMARY LOOP — read this first

You are usually driving HEADLESS: no mirror, no human watching, no humanPace.
The pattern is ONE warm instance per checkout, probed many times:

```
bun scripts/harness/DriveSession.ts --serve &          # once: boots the app
bun scripts/harness/DriveSession.ts --attach "…"       # probe (state persists)
bun scripts/harness/DriveSession.ts --attach "…"       # probe again, ~100ms
bun scripts/harness/DriveSession.ts --reload           # start FRESH when state is dirty
bun scripts/harness/DriveSession.ts --stop             # done: kill your server
```

- The rendezvous dir is KEYED TO YOUR CHECKOUT (git toplevel of cwd), so an
  agent in a worktree gets its own server and its attaches find it — you
  never share an app with another agent. `--server-dir` only for deliberate
  sharing.
- `--reload` boots a fresh app (new scratch home) on the same server: use it
  when accumulated state would contaminate the next question. With an
  explicit `--home` the home is REUSED — persistence by choice.
- Do not boot per probe (`--eval` cold-runs are for one-shots); do not leave
  servers running when your task ends; a `timeout`-killed server LEAKS its
  inner app — always `--stop`.
- `bun run drive` is an ALIAS for DriveSession.ts (the one-shot Drive.ts
  was REMOVED 2026-08-03 by user policy). Every invocation is fluent:
  `bun run drive -- --serve`, `-- --attach "…"`, `-- --eval "…"`,
  `-- --home DIR` for persistent state. There is no flag-per-key mode.
- Mirror, trail, and humanPace exist for HUMAN-WATCHED sessions only — skip
  them headless; they cost time and change nothing you can assert.

**You are part of this instrument's feedback loop.** If your brief carries
an `## Instrument feedback` (or `## PTY usability`) section, answer it in
your report: EASY / CONFUSING / MISSING. A verb you wanted and did not find
is an ASK — name it, then do the work with the primitives (never hand-roll a
parallel layer; that path was tried and vetoed). Asks get converted by the
conductor at landing, so what you name today the next builder holds
tomorrow. Nine builders shaped this skill's current surface that way in its
first two nights.

## DRIVE ADVERSARIALLY — the verification law (user doctrine, 2026-08-05)

The happy path is the smoke's FLOOR, never its content. Whatever you
build, verify it by DRIVING VARIATIONS until it breaks or clearly
will not:

- CYCLES: create several -> remove ALL -> create again -> remove one
  by one. Lifecycles break at re-entry, not first entry.
- BOUNDARY COUNTS: zero, one, many, all. The bug lives at 0 and at
  "remove the last one" far more often than at 3.
- ORDER VARIATIONS: same actions, different orders; interleave
  surfaces (create terminal, open dialog, remove terminal, close
  dialog); do things while other things are mid-flight.
- ASSERT AFTER EVERY STEP, not at the end: read the graph state
  (lists, counts, focus) after each action — an end-state assertion
  hides which step corrupted it (#514's over-removal hid exactly
  this way).
- BREAK IT ON PURPOSE: the action your feature makes possible, done
  twice, cancelled midway, repeated fast — before the report claims
  done.
The READY report names the variation protocol driven, not just the
assertions written. A report showing only the happy path is
incomplete by definition.

Two instruments, one contract. INPUT always travels through the real PTY as
bytes a real terminal could produce — the founding harness invariant; there
is no teleport path and none may be added. OBSERVATION has two eyes: the
painted screen (what a user sees) and the live object graph (what the app
knows). The craft is using each for what it is.

## The fluent session — one flowing operation, no preamble

```
bun scripts/harness/DriveSession.ts --script my.drive.ts     # file snippet
bun scripts/harness/DriveSession.ts --eval "await app.key('Control+j')"
```

A snippet sees `app` (the fluent session) and `driver` (the raw PtyTestDriver)
— no imports, no setup, no teardown. Chains queue and run when awaited:

```ts
await app.key('Control+j').waitFor('panelHost.visible', true)
  .clickText('+ Plugin').waitFor('boundedListPopup.open', true);
```

**Verbs stay primitive by decree.** Coordinates, text, keys, published state.
An earlier attempt grew app-specific verbs (openInstances, addInstance) and
was rejected: they encode the implementation into the instrument until the
driver is a second copy of the app. Do not add app verbs.

- `moveMouse(column, row)` — a real move; hover states are real state.
- `click(column?, row?, {alt, shift, control}?)` / `clickText(text, columnOffset?, modifiers?)` — modifier clicks (Alt+click = LSP jump) pass modifiers on press AND release
- `drag(fromColumn, fromRow, toColumn, toRow, modifiers?)` — press, pressed
  glide, release: text selection, thumb drags, splitter moves. Always emits
  real intermediate drag-move bytes (a teleporting press-release selects
  nothing); humanPace only spaces them for a watcher.
- `key('Control+p', ...)` / `type('text')`
- `scroll('up'|'down', ticks?, column?, row?)`
- Waits: `waitFor(graphPath, value)` (the workhorse), `waitForStatus(field,
  value)`, `waitForText(text)` / `waitForTextGone(text)` (the ABSENCE wait:
  "it closed" = its text is no longer painted), `waitForHoverState()`,
  `waitForRepaint()`.
- Readers: `show(...statusFields)`, `showScreen(firstRow?, lastRow?)` (two
  integers; anything else throws at call time), `await app.screen()`,
  `await app.status()`, `await app.get(path)`, `await app.set(path, value)`.
- Labeled evidence: `app.show('after panel open', ['panelVisible', 'frame'])`.
- Diagnostic log: `app.diagnosticLogPath` (the app's ACTUAL log),
  `await app.logTail(20)` / `app.showLog(20)` — provenance-guarded: only the
  driven instance's own lines, never a leftover or a concurrent instance's.
  The driver DROPS an inherited `TUI_LOG_PATH` and declares its own per-home
  path (home isolation), so tailing the path from your shell's env reads a
  file the driven app never writes — ask the session.
- Impossible inputs fail loudly: a pointer target outside the live grid
  throws (a real terminal cannot produce that event) — never a silent no-op.

**Wait-value and needle traps** (each cost a builder a probe):

- Waits compare values as JSON — pass the real TYPED value:
  `waitForStatus('panelVisible', false)`, never the string `'false'`.
- `type()` then `waitForRepaint()` is the pre-satisfied class: the repaint
  the typing caused often lands BEFORE the wait starts. Wait on what changed:
  `waitForText('$ xy')` for the text you typed.
- `waitForTextGone` pre-satisfies the same way: if the text never painted,
  it resolves instantly and verifies nothing. Wait for presence first, then
  absence.
- A hidden surface keeps its content state: `panelActiveContentKind` persists
  while the panel is hidden — the close condition is `panelVisible === false`
  (or a `waitForTextGone` on the panel's visible text), never the kind field.
- Broad `findText` needles (the composer prompt glyph, a bare `│`) can match
  another surface first — prefer narrow visible text unique to the target.

**Default geometry is 220x60** — a drive session models a real user at a real
screen (the reference it was tuned on is 295x65). The smoke suite keeps its
own calibrated 120x40 through PtyTestDriver directly. Which leads to:

**RULE: ask the screen, aim at text.** Never hardcode a cell. On a 295-column
terminal, the cell that is "the editor" at 120 columns is the FILE TREE — a
wheel aimed there scrolls the wrong pane and every event still "works".
Derive targets from `(await app.screen()).findText(...)` or from proportions
of `screen.columns/rows`.

## The warm server — one boot, many probes; state survives

```
bun scripts/harness/DriveSession.ts --serve [--open DIR]      # boots ONCE
bun scripts/harness/DriveSession.ts --serve --size 100000     # generated fixture
bun scripts/harness/DriveSession.ts --attach "…snippet…"      # probe it
bun scripts/harness/DriveSession.ts --attach-script FILE
bun scripts/harness/DriveSession.ts --attach "" --show panelVisible,frame
bun scripts/harness/DriveSession.ts --stop
```

`--show FIELD[,FIELD]` appends one `app.show(...)` to the probe, so a two-key
question prints two lines instead of a full status dump. It composes with
`--eval`, `--script`, `--attach`, and `--attach-script`; paths reach into
published values (`panelListGeometry.width`).

Attaches run against the SAME live session (~100ms each vs ~400ms cold, and
navigated state persists — the real win: never re-drive to where you were).
Rendezvous dir: KEYED TO YOUR CHECKOUT by default —
`/tmp/invar-drive-server-<slug-of-git-toplevel>` — so an agent in a worktree
gets its own server and its attaches find it; two agents can only share a
server by BOTH passing the same explicit `--server-dir`, never by accident.
Inside it: manifest with pid (dead-pid detected), request/response files,
`server.log`. A failed snippet answers loudly, abandons its queued steps,
and the server keeps serving. Stale requests from a previous session never
replay. One attach at a time per server. Kill orphans by /proc env evidence,
never by name-pattern.

## The MCP doorway — Claude controls the same warm server

From the checkout, add the stdio server to the current Claude project:

```
claude mcp add --scope local invar-drive -- bun "$PWD/scripts/harness/InvarMcpServer.ts"
```

Restart Claude after adding it. The MCP server resolves the same
checkout-keyed DriveSession server as the shell commands. It exposes
`server_start`, `server_reload`, `server_stop`, `drive_attach`, `graph_get`,
`graph_await`, `graph_set`, and `screen`.

`drive_attach` sends actions through the existing real-PTY verbs. `graph_set`
is EXPERIMENT ONLY and never supplies verification evidence. Use
`server_stop` before ending the task. It is the MCP form of
`DriveSession.ts --stop`.

## --mirror — a human watches the agent's hand, live

```
bun scripts/harness/DriveSession.ts --serve --mirror          # in any terminal
```

Relays the app's raw bytes to the hosting terminal (geometry inherited,
workspace defaults to cwd, settings seeded BY COPY from the real config —
never shared; the #465 damaged-config incident is why). Watch-only: stdin is
swallowed raw (Ctrl+C stops the server); your keyboard does not double-drive.
The server forwards hosting-terminal `SIGWINCH` events to the inner PTY. A
pane resize therefore changes the mirrored app's live grid.

Hard-won mirror rules, each bought with a live defect:

1. **The mirror owns stdout exclusively.** Any server log printed there lands
   at the app's live cursor and clobbers cells that damage-tracked repaint
   NEVER repairs (this blanked the activity bar). All chatter goes to
   server.log.
2. **Negotiate as the least capable link.** The app probes terminal
   capabilities against the harness emulator, which is a BETTER terminal than
   most real ones — it passed the kitty text-sizing probe, the app wrapped
   glyphs in OSC 66, and the watching terminal deleted them wholesale.
   Mirror mode sets `textSizingSupported: false` so probes fail honestly.
   This defect class is structurally invisible to the gate: the oracle that
   grades output is the oracle that answered the probe.
3. **Two oracles, one byte stream** (conductor family 17): when the emulator
   and the human disagree about the same bytes, diff the interpreters, not
   the app — the disagreement locates the defect class in one step. Read the
   raw bytes (`--serve --mirror > capture.bytes` headless) before modeling.

### The pointer trail (TUI_POINTER_TRAIL=1; mirror sets it)

App-side render post-process: `✛` at the pointer, a fading `•`/`·` wake,
orange `◉` click rings, green `⇅` scroll marks — fed by the app's OWN
received mouse events, so it shows what ARRIVED, never a reconstruction. The
painter keeps requesting frames while any trail cell remains, so the wake
drains to nothing when the hand stops.

### humanPace — every action feels like a human doing it

`app.humanPace()` (multiplier arg: 1.5 slower, 0 = machine speed). The motion
model is Fitts-shaped: a gesture takes near-constant TIME regardless of
distance — fast mid-flight, soft landing (constant cells-per-second read
robotic; long crossings dragged). Clicks dwell ~220ms before pressing and
rest ~260ms after; typing lands at ~105-150ms per character with a light
rhythm wobble. **Tempo is animation, never synchronization**: no step's
correctness may depend on a pacing delay; every wait-for-state remains a real
condition. Pacing a VERIFICATION is the sleep-as-sync defect.

Worked presentations: `scripts/harness/drives/tour.drive.ts` (verbs, popup,
Quick Open) and `scripts/harness/drives/scroll.drive.ts` (wheel under the
mark, graph-verified). Both geometry-agnostic — copy their style.

## The graph — any app state by path, no publish tax

The app answers path queries against its LIVE ivue object graph
(src/modules/system/GraphChannel.ts; enabled only under harness env — a
shipped binary exposes nothing). The root is the real `BootedApp` composition
object. Its `contributors` property contains every installed contributor by
identifier, with no second membership list. Other roots include `panelHost`,
`workspaceSet`, `bufferTabStrip`, `workspaceTabStrip`, `view`, `settings`,
`quickOpen`, `findBar`,
`completionPopup`, `boundedListPopup`, `contextMenu`, `tooltip`,
`layoutSlotSizes`, and `mouse`. Refs and Computeds unwrap in the resolver, so
a path never contains `.value`.

- `await app.get('workspaceSet.active.editor.viewport.firstVisible')` — mode
  'now': one consistent event-loop read (possibly a between-frames transient).
- `app.waitFor(path, value)` — the condition is PARKED IN THE APP and
  evaluated at frame-settle boundaries (the projection's own boundary), so a
  graph wait never observes a state no completed frame had. One request buys
  every sample.
- `GraphClient.Class.awaitTransition(...)` — subscribing verb for BLINKS
  only (a value that never survives to a frame). It adds an edge to the
  reactive graph and reports mid-update states: reach for awaitValue first,
  always. It never fires on the value already held.
- `await app.set(path, value)` — EXPERIMENT ONLY (user decision 2026-08-02):
  bypasses the user's input path, so it never appears in verification;
  smokes and gates drive real gestures. `reactive: false` in the answer
  means a plain-field write — nothing repaints, by design.
- **Misses are teachers.** A wrong path fails loudly with the dead node,
  did-you-mean, and everything addressable there. Explore the app by poking:
  `app.get('nope')` prints the root namespace.
- Contributor state starts at paths such as
  `contributors.file-tree.activeWorkspace.rowCount` and
  `contributors.git.activeWorkspace.changedCount`.

The status projection and graph answer different questions. Use
`waitForStatus` and `show` for status-only fields such as `renderQuiescent`.
Use `waitFor` for a frame-settled graph condition. Use `get` for an immediate
graph question. The projection is an atomic bulk snapshot. The graph reaches
state that the projection does not publish.

Smokes use the same protocol through `GraphClient.Class.awaitValue(statusPath,
path, value)` — one client, shared with DriveSession; never fork it.

## The wait discipline (the census in one paragraph)

Ask of every wait: **is this condition FALSE right now?** A wait on text
painted both before and after the change (chrome, headers, labels) is
pre-satisfied: it returns a stale frame and the next gesture acts on dead
geometry — the #464 gate red, ~125 instances found in one census, and it goes
GREEN most of the time. Wait on the thing that CHANGED, prefer the graph for
sequencing, keep the final assertion on the screen (graph is blind to paint —
a model-only smoke goes green while the screen is broken). `screen()` returns
the last COMPLETED frame: after unawaited input, `waitForRepaint()` before
reading, or you read the past. Never invent expected values — measure first,
express relatively.

## Interaction truths (each learned by a failed drive)

- A chord sent while a terminal pane holds focus is EATEN by the shell —
  click into the editor before Ctrl+P.
- Quick Open's top match may be the test file; assert
  `quickOpen.matches[0].path` before Enter when it matters.
- Popups open on PRESS at the anchor; a text-wait for the popup title of the
  panel add popup is 'Add Terminal'/'Add Database' by active space kind.
- Wheel coordinates are cells like any other; the SGR encoding is 1-based
  but HarnessInput converts — you always pass 0-based.
- The status projection remains the ATOMIC bulk observation; the graph is
  for questions nobody pre-published. Both survive.
