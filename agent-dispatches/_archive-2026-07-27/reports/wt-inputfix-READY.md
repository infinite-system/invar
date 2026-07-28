# Input correctness pack — READY

Branch: `fix-input-correctness-pack`

Tip: `9fdb9d3181de6253a71a55287fbcdc5c13bc11f7`

Rebase: `git fetch origin main && git rebase origin/main` reported the branch up to date.

## A — Grapheme-safe staged typing

Root cause: command cadence iterated Unicode code points while
`TerminalCommandController.typeCharacter` indexed UTF-16 code units. Astral characters could
therefore be split into lone surrogates, and the cadence and writer disagreed about command length.
The sanitizer's unknown-escape fallback could also consume one UTF-16 code unit after ESC.

Fix:

- Added the stateless `TextSegmentation` authority backed by `Intl.Segmenter` with grapheme
  granularity.
- `TerminalCommandTyping.plan` produces one shared grapheme array and its aligned delay array.
  Animated writes send each complete grapheme in one write; fast-forward joins remaining graphemes.
- Editor coordinate segmentation now uses the same authority.
- The sanitizer's unknown-escape fallback consumes only an ASCII byte, so an adjacent astral
  character cannot lose one surrogate.
- Agent composer character admission now accepts one complete printable grapheme rather than
  requiring one UTF-16 code unit.

Real-path proof: the terminal-stage harness stages `echo "test — with emoji 🦊✨"`, waits for the
complete readline buffer, performs a mid-line caret edit, and verifies the executed output contains
the intended em dash, fox, and sparkle graphemes without the command text.

## B — Copy and paste on the terminal boundary

Root cause: terminal-pane selection/copy did not exist, and clipboard copy preferred a local
xclip/wl-copy-style process or `/dev/tty`. That route is not the app's observable output boundary
under a remote VM/SSH/cmux session. The existing internal clipboard assertions therefore did not
prove that the host terminal received anything.

Fix:

- Terminal-pane mouse selection reconstructs grapheme/display-cell-safe text from visible emulator
  rows, paints the selected spans, and routes Ctrl+C/Cmd+C through the shared clipboard capability.
- Clipboard copy emits OSC 52 through `process.stdout` first, then attempts a local system clipboard
  tool as a companion path and retains the internal buffer for in-app paste.
- Transcript and composer selection use the same stdout OSC 52 path.
- Bracketed paste remains focus-routed to the terminal child PTY or agent composer. The paste harness
  now drives terminal paste while idle, after staging completes, and during active animation.

OSC 52 design: copy writes the raw sequence `ESC ] 52 ; c ; <base64 UTF-8> BEL` to the app's stdout.
The enclosing host terminal (including cmux/remote arrangements) can therefore own the clipboard.
The harness records app output and decodes that exact sequence; it does not infer success from the
internal clipboard buffer or a status message.

## C — Word operations on both input surfaces

Root cause: composer word-edit methods existed but were not represented consistently in the
focus-scoped binding dispatch, while terminal modifier events could be consumed without being
translated to Readline meta bytes.

Fix:

- Canonical agent and terminal bindings cover Alt+Left/Alt+B, Alt+Right/Alt+F, and Alt+Backspace.
- Agent actions invoke the existing composer word-edit seam.
- Terminal actions pass through `TerminalKeys`, which emits `ESC b`, `ESC f`, and `ESC DEL`.
- Terminal copy intercepts Ctrl+C only while a selection exists; otherwise Ctrl+C still reaches the
  shell as SIGINT.

The paste and agent-pane harnesses drive multi-word buffers and assert cursor movement, insertion at
the moved cursor, and previous-word deletion on the painted user path.

## D — Read and replace terminal input tools

Root cause: neither backend exposed the controller's current-line observation or a safe way for an
agent to correct an already-typed user command while retaining human execution authority.

Fix:

- `readTerminalInput` returns up to 40 recent emulator-buffer lines plus the current prompt input
  line. Its manual teaches the read-then-replace flow.
- `replaceTerminalInput(command)` records the old line, writes exactly one Ctrl+U, and submits the
  sanitized replacement through the existing grapheme-safe staging controller with no Enter.
- Read is observation tier; stage and replace are stage tier; autonomous run remains available only
  in bypass mode. One `AgentTerminalTools` registry generates both the SDK and Codex app-server tool
  definitions.
- A `replaced-then-staged` transcript event records old and new commands as a minus/plus diff.

Real-path proof: the terminal-stage harness types `printf BROKN_COMMAND` as the user, invokes the
echo backend's read tool, expands and observes the live readline value, invokes replace, verifies
that the old and new commands are not concatenated and that no output file exists, then presses
human Enter and verifies the exact file content and replacement event.

## Commits

| Commit | Purpose |
|---|---|
| `a623413` | Grapheme authority, safe staged typing, sanitizer audit, terminal read/replace tools |
| `13e1272` | Focus-scoped copy/paste and word-edit routing |
| `9fdb9d3` | Real-PTY ratchets and terminal/agent invariant contracts |

All commits used `SKIP_GATE=1`; the prohibited merge gate was not run.

## Final verification

The PTY campaigns started only after the machine-quiet check found no merge-gate process, no other
fleet Codex process, and no other smoke process.

| Check | Result |
|---|---|
| `bunx tsc --noEmit` | PASS |
| `bun test` | PASS — 1,046 tests, 0 failures, 14,531 assertions |
| `bash scripts/conventions-gate.sh` | PASS |
| invariant checker `--all --refs` | PASS — 550 annotations, 39 lattice links, 0 problems |
| `smoke-terminal-stage-harness.ts` | PASS 5/5 |
| `smoke-paste-harness.ts` | PASS 5/5 |
| `smoke-agent-pane-ux-harness.ts` | PASS 5/5 |

The repository worktree is clean except for the conductor-provided untracked `TASK.md`.
