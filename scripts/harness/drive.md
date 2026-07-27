# Drive Invar in two minutes

Run the real app in the PTY harness, wait for a settled synchronized frame,
and print its numbered terminal grid plus every published status/probe key:

```sh
bun run drive
```

Use `--open PATH` for a file or workspace, `--geometry 100x30` for the
terminal size, and `--size 100000` for a generated large-file fixture under
`tmp/`. Input flags run in order and reprint after each action:

File input is copied into a disposable single-file workspace, so exploratory
edits cannot touch the source. Directory input drives that workspace in place.

```sh
bun run drive --size 100000 --key End --wheel down --click 60,20
```

`--key`, `--wheel`, and `--click` are repeatable. Key names use the existing
harness vocabulary (`Down`, `Control+g`, `Escape`); wheel directions are
`up`, `down`, `left`, or `right`; click coordinates are zero-based.

Each grid row is `row │cells│`; the heading reports geometry and the native
cursor. Below it, `name=JSON value` lines are the live status/probe
publication. Search that list for the surface you are investigating, then
drive again. For example, the session's one-row diff-ruler bug was reproduced
in a dirty Git workspace with:

```sh
bun run drive --open /path/to/dirty/worktree --key Control+g --key o
```

The final grid showed the diff, while
`diffOverviewRulerGeometry={"top":...,"left":...,"height":1}` named the bad
published rectangle. A healthy ruler publishes the visible track height, so
the grid and key together separate bad geometry from bad paint.
