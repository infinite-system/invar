# Drive Invar in two minutes

Run the real app in the PTY harness, wait for a settled synchronized frame,
and print its numbered terminal grid plus every published status/probe key:

```sh
bun run drive
```

Use `--open PATH` for a file or workspace, `--geometry 100x30` for the
terminal size, and `--size 100000` for a generated large-file fixture in the
system temporary directory. Input flags run in order and reprint after each
action:

File input is copied into a disposable single-file workspace, so exploratory
edits cannot touch the source. Directory input drives that workspace in place.

```sh
bun run drive --size 100000 --key End --wheel down --click 60,20
```

`--key`, `--wheel`, and `--click` are repeatable. Attach a status or text wait
to the input that causes it. Compose longer drives from `DriveSession`'s
primitive keys, text, coordinates, and published-state waits. Neither front
door defines app-specific gestures.

Useful observation flags are:

- `--cells ROW,C1-C2` (repeatable) prints characters plus bg/fg colors for a
  cell range with every observation — the color evidence a text grid hides.
- `--home DIR` uses a persistent home directory and keeps it after the run.
  State (session restore, settings) carries across runs — this is how you
  drive restart behavior: run twice with the same `--home` and compare.
- `--env KEY=VALUE` (repeatable) sets an extra app environment variable.
  Example: `--env INVAR_TEST_SUPPRESS_FOLDER_OPEN_TASKS=0` re-enables
  folder-open task launching, which the harness suppresses by default.

```sh
bun run drive --open ~/dev/realized --home /tmp/drive-home \
  --env INVAR_TEST_SUPPRESS_FOLDER_OPEN_TASKS=0
```

Color-dump example:

```sh
bun run drive --geometry 120x40 \
  --key Control+j --wait-for-status 'panelVisible=true' \
  --cells 22,33-44 --cells 23,100-119
```

 Key names use the existing
harness vocabulary (`Down`, `Control+g`, `Escape`); wheel directions are
`up`, `down`, `left`, or `right`.

Every action carries one completion rule. Ordinary actions wait for a changed
screen or native caret. Canonical multi-step chord prefixes are declared
frame-silent from the keybinding data, so this sends the two-step fold gesture
without waiting for the prefix to paint:

```sh
bun run drive --key Control+k --key '['
```

Use `--frame-silent` after another legitimate no-paint action. When a
published state and its repaint are both the result, attach a named status
condition to the preceding action. The action completes only after the status
matches and the changed screen is observable:

```sh
bun run drive \
  --key Control+p --wait-for-text 'Go to File' \
  --key Escape --wait-for-status 'quickOpenOpen=false'
```

Status values use JSON, including quotes around strings. A named condition
that is already true before its action is rejected instead of laundering a
no-op into a successful drive.

Clicks should name the visible element. `text=...` clicks the first cell of
the visible text. `fold-control=...` finds the fold glyph on the same row
through the theme vocabulary:

```sh
bun run drive --open scripts/harness/BracketedPasteInput.ts \
  --click 'fold-control=class $BracketedPasteInput {'
```

These targets resolve against the current grid immediately before the click,
so width and dock changes may move them safely. Raw zero-based `COLUMN,ROW`
coordinates remain available for genuine geometry tests:

```sh
bun run drive --click 60,20
```

Each grid row is `row │cells│`; the heading reports geometry and the native
cursor. Below it, `name=JSON value` lines are the live status/probe
publication. Search that list for the surface you are investigating, then
drive again.

The `settled boot` observation also waits for the drive's declared quiescence
registry. An active Markdown preview must finish parsing its current buffer
revision. An installed structure pane must finish its first refresh for the
active file. Missing plugin keys do not hold the drive open.

For example, the session's one-row diff-ruler bug was reproduced in a dirty
Git workspace with:

```sh
bun run drive --open /path/to/dirty/worktree --key Control+g --key o
```

The final grid showed the diff, while
`diffOverviewRulerGeometry={"top":...,"left":...,"height":1}` named the bad
published rectangle. A healthy ruler publishes the visible track height, so
the grid and key together separate bad geometry from bad paint.
