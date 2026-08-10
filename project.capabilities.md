# Invar capabilities — the one-page map

What the app can do today, in plain words. One entry per landed
capability: what it does, how you reach it, one example. This file is a
LIVING map: every landing that adds or changes a user-facing capability
updates its entry in the same action (acceptance protocol, RULE THREE).
History lives in git and `.invar/tasks/` — this page is only the present.

Last full refresh: 2026-08-07.

## Editing

- **Editor with delta undo.** Every edit — typing, structural line moves,
  bulk replaces — records small deltas, never file snapshots. One
  `Ctrl+Z` undoes one step exactly. Example: Replace All across a
  100,000-line file, then one `Ctrl+Z` restores every byte.
- **In-file Find/Replace.** `Ctrl+F` opens the inline find bar (input,
  `↑`/`↓` match navigation, `Aa` case, `ab` whole word, `.*` regex —
  also `Alt+C`/`Alt+W`/`Alt+R`). Replace All shows a counted consent
  dialog and lands as one undo step. Example: `Ctrl+F`, type `foo`,
  `.*` on, Replace All → "Replace N items in file?" → confirm.
- **Go to File.** `Ctrl+P` opens Quick Open; exact basenames rank above
  fuzzy paths. Works from any focused surface except panes that consume
  raw keys (terminal, agent).

## Workspace Search and Replace

- **Search panel.** `Ctrl+Shift+F` or the `⌕` activity icon opens the
  left-dock panel: Search, Replace, Files-to-include, Files-to-exclude
  fields plus an options row (`Aa  ab  .*  Use ignores`). Results
  stream live, grouped by file with previews; clicking a match opens
  the file at that line. Powered by ripgrep (install it; without it
  the panel says so and names the remedy). Caps at 20,000 matches;
  unsaved buffer edits overlay disk results.
- **Workspace Replace.** Per-match `⟳` replaces one; `Replace All`
  (panel foot) shows counted consent ("Replace N items across M
  files?", safe focus on Cancel). Undo/Redo controls — or `Ctrl+Z` in
  the editor — restore every file through one transaction, with
  per-item drift detection: a file changed after the search is named
  and skipped, never silently clobbered. `Ctrl+Shift+R` focuses
  Replace; `Alt+I` toggles ignores; `Alt+D` dismisses a match.

## Files

- **File tree.** Left dock, first activity item. `↥` opens the Open
  picker (native dialog on graphical sessions, in-app picker headless);
  `⊙` reveals the active file in the tree.
- **Drag and drop.** Drop a file onto the window: the focused
  terminal/agent pane receives its PATH as a bracketed paste (not the
  content). Example: drop an image onto a Claude pane and the agent
  gets a usable local path.

## Terminal and agents

- **Bottom panel.** `Ctrl+J` selects the terminal, creating one lazily
  if none exists; the status-bar `❯` control toggles panel visibility
  and never creates anything. Instance rows show controls on hover
  (overlay grammar: text truncates, icons appear); `+ Terminal` adds.
  Tasks within a terminal show a task glyph; clicking it opens
  `invar/tasks.json`.
- **Agent panes.** `Ctrl+Shift+A` toggles a real Claude/Codex session
  in a pane (skip-permissions plumbing built in). Drops paste paths
  into it like any terminal.

## Tasks

- **Tasks pane.** `Ctrl+Shift+T` opens the right-dock pane — pixel
  parity with `bun run tasks:watch`: same rows, tones, phase glyphs,
  60fps motion, one shared renderer. Header is a segmented
  `LIVE ACTIVE DONE` control plus cycle `▷`. Hover a task group for
  actions (attach, open task file, brief, report). The CLI and pane
  derive phases from the same pure helper — they can never disagree.

## Remote (iv ssh)

- **`iv ssh <host>`.** Runs Invar ON the remote host through one
  OpenSSH control master; your local terminal paints it. A second,
  invisible channel (`iv --channel-server`, framed IVCH protocol)
  carries your LOCAL resources into the remote app: drag a local file
  onto the window and it uploads to the remote
  `~/.cache/invar/dropzone/`, then pastes as a real remote path.
  Works against stock sshd — no server config. (Inverse mode — local
  Invar over remote fs/pty — is reserved protocol ground, not built.)
- **A dead remote channel names its cause.** When the remote cannot
  start Invar, the error quotes the remote's stderr and the remedy
  (install `iv`, or set `INVAR_REMOTE_IV_COMMAND` to an absolute
  path) — never a bare "Remote channel closed".

## Platforms

- **Linux and macOS, one behavior.** The full app — editor, integrated
  terminal, agents, tasks, `iv ssh` (client and server side), monitoring
  pane — runs on both. On macOS the PTY layer is Bun's native terminal
  (`NativeTerminalPty`); on Linux the FFI `openpty` allocator; nothing
  above the backend seam knows which. One-command setup:
  `bash scripts/install.sh`. Windows is not supported (WSL2 works).
- **The dev loop runs on macOS too.** `bun run drive`, the PTY harness,
  and the smokes run on darwin; the full merge gate runs remotely with
  `bash scripts/gate-remote.sh` (its orchestration is Linux-only).

## Other surfaces

- **Git.** Comparison view per change, blame segment in the status
  bar, changed-file counts in the activity bar.
- **Extensions.** Install/uninstall plugins from the Extensions list;
  uninstall fully withdraws panes and spaces (a surviving pane takes
  selection).
- **Structure navigator.** Symbol outline pane per document.
- **Markdown preview, image/media viewer, database pane, diff view,
  LSP/diagnostics, inline rewrite.** Each opens from its file type or
  activity item; all obey the shared UI doctrine below.

## Everywhere rules (the doctrine, ui-design skill)

- Any visible text can be selected (mouse drag, edge autoscroll) and
  copied — `Ctrl+C` reaches your real clipboard through OSC 52, with a
  "Copied N chars" flash.
- All confirmations use one overlay dialog family: counted copy, safe
  focus on the non-destructive action, Escape always cancels cleanly.
- Every text field shares one input model: word movements
  (`Alt+arrows`), word deletes, home/end, selection — identical in
  find bar, search fields, pickers.
- Scroll areas share one physics: momentum, contrary-input restart,
  thumbs that agree with content.
- Global chords work on any read-only surface; only terminal/agent
  panes (which feed a child process) own their keys.

## For agents and tooling (not user-facing)

- **Drive layer.** `bun run drive` (DriveSession): real-PTY gestures +
  a warm app server (`--serve`/`--attach`) + `--mirror` for watching an
  agent drive live. Doc: `.claude/skills/drive-pty/SKILL.md`.
- **GraphChannel.** Harness-only endpoint answering path queries
  against the live ivue object graph (`app.get('panelHost.visible')`).
  Disabled in shipped binaries.
- **Task system.** `.invar/tasks/` folders + `bun scripts/tasks/tasks-status.ts`;
  the tasks pane and `tasks:watch` read the same projection.
