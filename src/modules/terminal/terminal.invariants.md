# Terminal — Invariants

Load-bearing rules for `src/modules/terminal/` (the integrated terminal) and its composable-pane
mount (`src/modules/ui/PaneContent.interface.ts`, `src/modules/ui/PanelHost.ts`). Stands on
`project.invariants.md` (one-way data flow, cost tracks the observed set) and the ui rendering
records. Tier S scope: one interactive terminal in a switchable bottom panel slot.

## Reality-based invariants

### The emulator is the single source of terminal screen state

**Invariant:** If a byte stream defines a terminal screen (ANSI/VT semantics), then the rows×cols
cell grid is a pure function of that stream fed to ONE emulator; the renderer and everything above it
PULL the grid from that emulator and never maintain a parallel screen model. A second parser or a
hand-tracked screen would diverge from the real VT state (wrap, scrollback, alt-screen, SGR).

**Scope:** `TerminalEmulator` (the sole `@xterm/headless` parser), `TerminalInstance` (which owns it),
and `TerminalPaneRenderer` (which reads it). Not the child process, which only produces bytes.

**Mechanism:** `TerminalEmulator` wraps exactly one `@xterm/headless` `Terminal`; child bytes reach it
only through `write()`, and the cell grid is read only through `cell(row, column)` (a flyweight
viewport-pull reusing one xterm cell object). `TerminalPaneRenderer` builds a `StyledText` purely from
those pulled cells each frame. No component keeps its own characters/colors/cursor.

**Generates:** correct VT rendering (wrap, colors, cursor, alt-screen) for free; a renderer that is
stateless and cannot drift from the emulator.

**Evidence:** `src/modules/terminal/TerminalInstance.test.ts` — scripted ANSI (plain text, an SGR
color, and a cursor-position move) feeds the emulator via `MockBackend` and the exact addressed cells
carry the expected character, color, and cursor coordinates; `scripts/smoke-terminal.sh` drives a real
shell and asserts `echo hello` renders `hello` in the panel cells.

**Impossible if true:** a terminal renderer holding its own character/color buffer; a screen cell that
disagrees with what the emulator parsed; two VT parsers for one terminal.

**Verification:** `bun test src/modules/terminal/TerminalInstance.test.ts && bash scripts/smoke-terminal.sh`

**Status:** provisional

**Last refined:** 2026-07-23

## Chosen invariants

### Terminal emulator behavior is specified by byte fixtures

**Invariant:** If `TerminalEmulator` parses or projects a terminal sequence, then a deterministic
input-byte fixture specifies its expected cells, cursor, metadata, or mode state, and every new
capability or `@xterm/headless` upgrade lands with the corresponding fixture.

**Scope:** `TerminalEmulator`, `TerminalEmulatorConformance.test.ts`, and the recorded fixtures in
`src/modules/terminal/fixtures/`. The corpus specifies the OpenTUI dialect Invar uses, not every
historical VT sequence.

**Components:**
- Grid semantics — SGR colors and attributes, cursor movement, erase, scroll, insertion, deletion,
  wide cells, astral characters, and combining marks have hand-authored expected cells.
- Stateful protocols — OSC title and cwd plus DEC synchronized output, bracketed paste, mouse,
  origin, and alternate-screen modes have explicit expected state.
- Chunk boundaries — representative ESC, CSI, OSC, DCS, APC, DEC private-mode, CJK, astral, and
  combining sequences are split at every byte boundary across two writes.
- Recorded dialect — real 80x24 OpenTUI boot, F1 keypress-diff, and light-theme streams pin every
  text row, cursor position, and one cell for every distinct style signature; a real shimmed Bash
  stream pins OSC 133 A/B/C/D command metadata and exit status.
- Documented gaps — OSC 52 clipboard, OSC 10/11 color, OSC 99 notification, OSC 1337 capability,
  and OSC 66 shell-integration requests are not implemented; XTGETTCAP DCS, Kitty keyboard and
  graphics probes, CSI version/pixel/modify-other-keys probes, sixel, and DEC modes 2027/2031 are
  ignored. DECRQM status replies pass back to the child without changing the grid. Cursor shape and
  OSC 8 hyperlink targets are not projected, although hyperlink underline styling remains visible.

**Mechanism:** The table-driven corpus writes bytes only through `TerminalEmulator.write`, flushes
the real asynchronous parser, and asserts the public flattened-cell seam. Recorded fixtures are
captured through `PtyTestDriver`, so the corpus also fails when OpenTUI begins emitting a dialect the
hand-authored cases do not cover.

**Generates:** a millisecond blocking oracle proof in every `bun test`; fixture-required emulator
changes; retirement of the statistical tmux sentinel ring from the normal merge gate.

**Rejected alternatives:** Keep the tmux sentinel ring as the oracle check — it samples a second
emulator through timed end-to-end drives and adds minutes without specifying which bytes must produce
which cells.

**Evidence:** `src/modules/terminal/TerminalEmulatorConformance.test.ts` (219 tests, including
every-byte-boundary OSC 133 cases and 4 recorded-real streams);
`scripts/harness/record-terminal-emulator-fixtures.ts`;
`src/modules/terminal/fixtures/`.

**Impossible if true:** an emulator capability changing without an expected byte fixture; a parser
state bug that appears only when a control or UTF-8 sequence crosses a write boundary; an OpenTUI
dialect change silently redefining the harness oracle; the normal merge gate needing a tmux
cross-oracle sample.

**Verification:** `bun test src/modules/terminal/TerminalEmulatorConformance.test.ts`

**Status:** established

**Last refined:** 2026-07-25

### Observation never writes to the PTY

**Invariant:** If `TerminalObserver` observes terminal activity, then it receives parsed emulator
events only and has no capability that can write bytes to `TerminalBackend` or the PTY.

**Scope:** `TerminalObserver` construction, OSC 133 and heuristic boundary detection, redaction,
payload assembly, and ring buffering. Existing command staging and user input paths remain the only
terminal write authorities and are outside observation.

**Mechanism:** `TerminalObserver` depends only on `TerminalEmulator` read and subscription methods.
The class has no `TerminalBackend`, file descriptor, `sendInput`, or `write` dependency; its absence
anchor sits at the observer declaration where any future write capability would first be introduced.

**Generates:** A one-way stream tap; observer failure isolation in `TerminalEmulator`; terminal
observation that cannot alter shell input or execution.

**Evidence:** `src/modules/terminal/TerminalObserver.ts`;
`src/modules/terminal/TerminalObserver.test.ts` `the observer seam exposes no backend or PTY write
capability`.

**Impossible if true:** Enabling or constructing an observer changes bytes received by the child;
observer code calls a backend write; an observer callback exception stops terminal parsing.

**Verification:** `bun test src/modules/terminal/TerminalObserver.test.ts`

**Status:** provisional

**Last refined:** 2026-07-25

### Observation payloads are bounded and self describing

**Invariant:** If `TerminalObserver` buffers a command completion, then the event declares
`headLines`, `tailLines`, `totalLines`, `truncated`, and `byteCap`; output content stays within the
declared byte cap, and the ring stays within 100 events and 256 KB by evicting oldest events.

**Scope:** OSC 133 and heuristic `command-completed` events built and retained by
`TerminalObserver`. Later MCP delivery, wake policy, and transcript insertion are outside this wave.

**Mechanism:** The observer redacts each command and output line before retaining it, counts every
line, keeps only bounded head and tail candidates, applies the UTF-8 byte cap while assembling the
payload, then evicts entries from the front until both ring bounds hold.

**Generates:** Fixed observation memory; newest-last snapshots; declared line and byte truncation;
no unredacted event payload in the buffer.

**Evidence:** `src/modules/terminal/TerminalObserver.ts`;
`src/modules/terminal/TerminalObserver.test.ts` head-tail, UTF-8 byte-cap, redaction-table, and
count/byte eviction cases.

**Impossible if true:** An event silently omits output without `truncated: true`; retained output
exceeds its `byteCap`; the ring contains more than 100 events or exceeds 256 KB; a buffered event
contains a password prompt or secret-shaped assignment value.

**Verification:** `bun test src/modules/terminal/TerminalObserver.test.ts`

**Status:** provisional

**Last refined:** 2026-07-25

### Agent terminal reads are redacted

**Invariant:** If terminal text reaches an agent through `readTerminalInput` or
`readTerminalScrollback`, then every returned line and current input value has passed through the
same `TerminalObserver` redactor before crossing the agent tool port.

**Scope:** `TerminalInstance.readTerminalInput`, `TerminalInstance.readTerminalScrollback`,
`TerminalObserver.redactTextLine`, and the `AgentTerminalTools` read definitions. Direct terminal
rendering for the user is outside this rule.

**Mechanism:** `TerminalInstance` owns one `TerminalObserver` for its emulator and applies that
observer's redaction methods to both read paths. `TerminalEmulator.scrollbackText` can select the
default newest 40 lines, an explicit newest count, or a 1-based inclusive range over all retained
lines, but only the redacted `TerminalInstance` projection reaches the agent port.

**Generates:** One redaction authority for event delivery and pull reads; explicit reads beyond the
default bound; no direct emulator-text path in `AgentTerminalTools`.

**Evidence:** `src/modules/terminal/TerminalInstance.ts`;
`src/modules/terminal/TerminalInstance.test.ts` `scrollback reads reach beyond the default and redact
every agent read path`; `src/modules/agent/AgentTerminalTools.test.ts`.

**Impossible if true:** A password-prompt line or secret-shaped assignment value returned by either
agent read tool; `readTerminalScrollback` returning fewer than an available requested line count; an
agent tool reading `TerminalEmulator` directly.

**Verification:** `bun test src/modules/terminal/TerminalInstance.test.ts src/modules/agent/AgentTerminalTools.test.ts`

**Status:** provisional

**Last refined:** 2026-07-25

### One openpty allocator serves both PTY roles

**Invariant:** If Invar or its byte-level test harness needs a pseudo-terminal, then both allocate,
resize, read, write, and close it through `OpenPty`; neither consumer owns a second `openpty` FFI
implementation.

**Scope:** `OpenPty`, `OpenPtyBackend`, and `scripts/harness/PtyTestDriver.ts`. Child command choice,
environment, and lifecycle policy remain consumer-owned because the integrated terminal hosts a shell
while the harness hosts Invar.

**Mechanism:** `OpenPty` is the one plain stateful resource that loads `openpty`, `ioctl`, and `write`,
owns the master and slave file descriptors, exposes master-byte callbacks, and applies `TIOCSWINSZ`.
`OpenPtyBackend` and `PtyTestDriver` each compose that allocator and only choose which child receives
the slave descriptor.

**Generates:** one FFI maintenance point; role inversion without copied PTY code; identical byte and
resize behavior for the integrated terminal and the harness.

**Rejected alternatives:** Copy the FFI declarations into the harness — two allocators can drift in
window sizing, descriptor ownership, or platform fallback.

**Evidence:** `src/modules/terminal/OpenPty.ts`; `src/modules/terminal/OpenPtyBackend.ts`;
`scripts/harness/PtyTestDriver.ts`; `scripts/harness/PtyTestDriver.test.ts`.

**Impossible if true:** a second `openpty` symbol declaration in the harness; a harness resize that
does not use the same `TIOCSWINSZ` path as the integrated terminal; either consumer closing a
descriptor that the shared allocator does not own.

**Verification:** `bun test scripts/harness/PtyTestDriver.test.ts && rg "openpty:" src/modules scripts/harness -g "*.ts"`

**Status:** provisional

**Last refined:** 2026-07-24

### A controlling PTY resize reaches the renderer

**Invariant:** If the controlling PTY accepts a positive rows-by-columns window change, then Invar
accepts the same columns and rows from OpenTUI's renderer resize seam. Published status and the next
layout projection agree on that viewport.

**Scope:** `OpenPty.resize`, the OpenTUI renderer resize event, Bootstrap's resize projection, and
`RootView`'s viewport input. Resize policy inside an integrated terminal pane remains owned by
`TerminalInstance`.

**Mechanism:** `OpenPty.resize` checks the `TIOCSWINSZ` result and throws with `errno` on failure. On
success, the kernel updates the controlling PTY and OpenTUI emits its renderer resize event.
Bootstrap publishes the renderer's accepted dimensions. `RootView` resolves its one layout geometry
from those live renderer dimensions. It never prefers a positive Yoga canvas size, because that size
still describes the previous frame during a terminal resize.

**Generates:** Loud PTY window-size failures; status dimensions that name the renderer viewport;
renderer-owned layout inputs; terminal-shrink layout without an input-event handshake.

**Rejected alternatives:** Add a stdout-to-renderer compatibility bridge — removing that bridge
twice left the real smoke green, so it did not control the defect. Send a harness-only resize
message — real terminals would stay broken. Prefer `layoutCanvas.width` and `height` when positive —
those values are one layout frame old during shrink.

**Evidence:** `src/modules/terminal/OpenPty.ts`;
`src/modules/app/Bootstrap.ts`; `src/modules/ui/RootView.ts`;
`src/modules/terminal/OpenPty.test.ts` (`a failed PTY window resize names the ioctl and errno`);
`scripts/harness/smoke-markdown-harness.ts` (120 by 40 to 60 by 25 at 10 and 100,000 lines).

**Impossible if true:** `TIOCSWINSZ` failing silently; the harness emulator showing 60 columns while
published width remains 120; published width becoming 60 while layout still uses 120 columns; a
mouse or keyboard byte being required before renderer geometry changes.

**Verification:** `bun test src/modules/terminal/OpenPty.test.ts`; `bun
scripts/harness/smoke-markdown-harness.ts`; restore the old positive-canvas preference in
`synchronizeLayoutGeometry` and confirm that published width reaches 60 while the smoke times out
with the preview still running past column 60.

**Status:** established

**Last refined:** 2026-07-29

### Shared PTY writes never block the event loop

**Invariant:** If `OpenPty.write` accepts bytes for a PTY master descriptor, then delivery never
blocks the JavaScript event loop that must also read the descriptor and render the resulting output,
and never costs a timer turn for bytes the descriptor can accept immediately.

**Scope:** The shared `OpenPty` master descriptor and write path used by `OpenPtyBackend` and
`PtyTestDriver`. Child read policy and application output generation are outside this rule.

**Mechanism:** `OpenPty` preserves the descriptor status flags, applies `O_NONBLOCK` with `fcntl`
before each write drain, and restores the blocking state needed by Bun's async PTY read stream after
the drain. `write` copies bytes into one ordered queue and drains it inline; the drain writes at most
16 KB per turn, so an accepting descriptor takes the bytes in the calling tick and a saturated one
reports `EAGAIN` without waiting. A partial write advances the queue, `EAGAIN` or `EWOULDBLOCK`
schedules a later retry, and every other errno is rethrown on a later turn so a keystroke never
receives a write failure it cannot handle. A drain already scheduled owns the queue, so an inline
drain defers to it and chunk order is preserved. A drain timer exists only while queued bytes remain
and is cleared on close; a read restart is scheduled only if a read races the non-blocking write
window and reports `EAGAIN`.

**Generates:** Responsive large terminal paste into a stopped or slow child; deadlock-free harness
input while Invar renders output; ordered chunk delivery; idle quiescence with no write polling at
rest; integrated-terminal and harness keystrokes that reach the descriptor without a timer clamp.

**Evidence:** `src/modules/terminal/OpenPty.ts`; `src/modules/terminal/OpenPty.test.ts` `a saturated
PTY write leaves the event loop responsive`, `a genuine asynchronous PTY write failure names its
errno`, and `a keystroke write needs no timer turn`;
`scripts/harness/smoke-terminal-backpressure-harness.ts`.

**Impossible if true:** A large master write preventing a scheduled timer or UI keystroke from
running; the harness and application each waiting for the other to drain the same PTY; an
`EAGAIN`/`EWOULDBLOCK` being raised as a terminal failure; a write retry timer firing while the queue
is empty; a keystroke-sized payload still queued when `write` returns.

**Verification:** `bun test src/modules/terminal/OpenPty.test.ts && bun
scripts/harness/smoke-terminal-backpressure-harness.ts && bash scripts/behavioral-contracts.sh`

**Status:** provisional

**Last refined:** 2026-07-26

### Terminal bytes cross exactly one backend seam

**Invariant:** Every byte to or from the child process passes through the `TerminalBackend` interface
(`write` out, `onData` in, `resize`, `kill`, `onExit`); the emulator and `TerminalInstance` never touch
a file descriptor or spawn a process directly. So `OpenPtyBackend` (a real PTY shell) and `MockBackend`
(scripted bytes) are interchangeable with zero change above the seam — the swap seam, parallel to the
LSP `LanguageProvider`.

**Scope:** `TerminalBackend`, `OpenPtyBackend`, `MockBackend`, `TerminalInstance`, `TerminalFactory`.

**Mechanism:** `TerminalInstance` is constructed with a `TerminalBackend` and a `TerminalEmulator` and
wires them once: `backend.onData → emulator.write`, `emulator.onReply → backend.write`,
`backend.onExit → exit state`. `sendInput`/`resize` call only backend methods. `TerminalFactory.create`
builds the real backend behind an overridable `createBackend` seam; a test passes a `MockBackend`
instead and asserts the exact bytes written / sizes pushed.

**Generates:** deterministic shell-free tests (scripted ANSI in, asserted bytes out); a single place to
add a remote/ssh/container backend later; a terminal core that has no PTY knowledge.

**Evidence:** `src/modules/terminal/TerminalInstance.test.ts` (input reaches `backend.writes`, device
reports round-trip back through it, resize reaches `backend.resizes`, exit stops input);
`src/modules/terminal/OpenPtyBackend.ts` is the only file that opens an fd or spawns a process.

**Impossible if true:** the emulator or instance reading a file descriptor or spawning a child; a test
of terminal behavior that needs a real shell; a second byte path around the backend.

**Verification:** `bun test src/modules/terminal/TerminalInstance.test.ts`; review — only
`OpenPtyBackend` imports `bun:ffi`/`node:fs`/`Bun.spawn`.

**Status:** provisional

**Last refined:** 2026-07-23

### Child terminal modes own wheel input

**Invariant:** A wheel over a terminal scrolls host scrollback only while the primary screen is
active and child mouse tracking is disabled. If either the alternate screen is active or any child
mouse-tracking mode is enabled, the same gesture is encoded as an SGR mouse wheel event and written
to the child; it never changes host scrollback.

**Scope:** `TerminalEmulator` mode state, `TerminalInstance`, `TerminalPaneContent`, the optional
scroll projection on `PaneContent`, and the panel cell wheel route in `RootView`.

**Mechanism:** `TerminalInstance.forwardsWheelToChild` reads the emulator's active buffer and mouse
tracking mode. `TerminalPaneContent.onWheel` chooses exactly one regime: child ownership writes one
SGR event with pane-local coordinates and modifiers; host ownership feeds the settings-normalized
row impulse into `Momentum`, whose progressive gain, deterministic contrary-direction restart,
one-row floor, decay, and stop threshold are shared with every scrolling surface. The emulator owns
`viewportY`; the generic pane scroll projection paints a `SolidThumbScrollBar` from that same
position and extent. Fresh child output halts a glide and returns the viewport to `baseY`.

**Generates:** Smooth terminal scrollback over multiple cell frames; immediate reversal; a visible
solid thumb; bottom-follow on new output; full-screen and mouse-aware child applications receiving
their own wheel input without a competing host scroll.

**Evidence:** `src/modules/terminal/TerminalPaneContent.test.ts` independently drives primary,
mouse-tracking, and alternate-screen byte cases; `src/modules/terminal/TerminalInstance.test.ts`
proves fresh output returns a manually scrolled viewport to the live bottom;
`scripts/harness/smoke-terminal-harness.ts` drives a real long Bash scrollback through five
synchronized positions, reverses it with a contrary notch, observes the solid thumb, returns to the
bottom on fresh output, then launches an alternate-screen mouse-tracking child that receives the
exact SGR wheel bytes while host position and extent remain unchanged.

**Impossible if true:** A full-screen child and host scrollback both moving for one wheel gesture; a
mouse-tracking child receiving no wheel bytes; a terminal wheel jumping without shared momentum; new
shell output remaining off-screen; an overflowing terminal with no thumb.

**Verification:** `bun test src/modules/terminal/TerminalPaneContent.test.ts
src/modules/terminal/TerminalInstance.test.ts && bun
scripts/harness/smoke-terminal-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-25

### Animated agent commands stay visible and inert

**Invariant:** If Invar animates an agent command into an idle terminal prompt, then every sanitized
character becomes plain terminal input, staging emits no submission byte on its own, and any run or
human-Enter submission occurs only after the complete sanitized command has been written.

**Scope:** `TerminalCommandSanitizer`, `TerminalCommandController`, and the real Bash terminal path
driven by `scripts/harness/smoke-terminal-stage-harness.ts`. Reduced-motion commands use one plain
write instead of an animated cadence but retain the same sanitize-before-write and submission rules.

**Components:**
- Visible typing — absent user acceleration, animated commands use plain per-character writes at the
  configured cadence, so Readline echoes each prefix immediately instead of buffering the animation
  inside one bracketed paste.
- Grapheme-complete writes — `TextSegmentation` is the one `Intl.Segmenter` authority, and one
  `TerminalCommandTyping.plan` supplies the same grapheme array to delay calculation, timed writes,
  and early-Enter fast-forwarding.
- Inert staging — the complete command is sanitized before the first write, all CR, LF, C0, C1, and
  escape-sequence bytes are removed, and stage mode never calls the submission seam.
- Complete execution — run mode calls the submission seam only after every sanitized character is
  written; human Enter during animation first writes the sanitized remainder, then submits the
  complete staged buffer exactly once.

**Mechanism:** `TerminalCommandController.request` sanitizes the whole command before
`typeRequest` can write. `TerminalCommandTyping.plan` segments once through `TextSegmentation`;
`typeCharacter` sends one complete grapheme per timer step and
`completeActiveTypingImmediately` joins the remaining graphemes before an early Enter can
reach Readline; `finishRequest` leaves staged input in Readline or calls `submit` once for run mode.
A complete bracketed-paste wrapper cannot provide visible animation because Readline inserts its
buffered payload only at the closing marker.

**Generates:** visible human-cadence agent typing; reviewable commands that remain inert until human
Enter; one explicit autonomous-submit boundary after complete run-mode typing.

**Rejected alternatives:** Wrap the complete animation in bracketed paste — Readline buffers the
payload and makes every intermediate typing frame invisible.

**Evidence:** `src/modules/terminal/TerminalCommandController.test.ts` asserts per-grapheme animated
writes, sanitize-before-write, no staged Enter, final run-mode Enter, and early human Enter
fast-forwarding the complete command; `scripts/harness/smoke-terminal-stage-harness.ts` stages and
mid-line edits `echo "test — with emoji 🦊✨"` in real Bash, asserts its exact output, requires
reduced motion to paint the complete command in its first visible typing frame, and requires the
slow configured typing speed to span more completed frames than the fast speed.

**Impossible if true:** a surrogate pair, variation selector, combining mark, or joiner sequence
written in separate timer steps; an animated command appearing all at once only after its final character; a
staged command executing before human Enter; an embedded newline or escape sequence reaching
Readline; run mode submitting a partial command.

**Verification:** `bun test src/modules/terminal/TerminalCommandController.test.ts && bun
scripts/harness/smoke-terminal-stage-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-24

### Terminal word operations reach readline

**Invariant:** If the terminal pane is focused and the user invokes word-left, word-right, or
word-delete, then the child receives exactly `ESC b`, `ESC f`, or `ESC DEL`.

**Scope:** Terminal-context keybinding data, `Bootstrap` terminal routing, and `TerminalKeys`.

**Mechanism:** Terminal-context bindings resolve the intent before the pane default; the handlers
forward the original key to `TerminalPaneContent`, and `TerminalKeys` normalizes legacy meta and
modifier-aware option events to Readline bytes.

**Generates:** Shell-native word editing without stealing editor bindings; identical behavior for
Option-arrow and legacy ESC-b or ESC-f encodings.

**Evidence:** `src/modules/terminal/TerminalKeys.test.ts`;
`scripts/harness/smoke-paste-harness.ts`.

**Impossible if true:** Alt-Left reaching Readline as a plain left arrow; Alt-Backspace being consumed
by Invar or forwarded as plain DEL; a terminal word operation mutating the editor beneath.

**Verification:** `bun test src/modules/terminal/TerminalKeys.test.ts && bun scripts/harness/smoke-paste-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-24

### Terminal replacement preserves human execution

**Invariant:** If an agent replaces the current terminal input, then exactly one Ctrl-U clears the
old Readline line, the sanitized replacement follows the existing grapheme-safe staging path, and no
Enter is sent.

**Scope:** `TerminalCommandController.replaceTerminalInput`, `TerminalInstance`, and
`replaceTerminalInput` agent tool wiring.

**Mechanism:** The controller observes `currentInputLine`, writes one `0x15`, queues the replacement
through its existing stage request until the prompt parses empty, then emits one
`replaced-then-staged` event carrying the old and new commands.

**Generates:** The read-fix-retype loop; a transcript old/new diff; human Enter remains the execution
grant.

**Evidence:** `src/modules/terminal/TerminalCommandController.test.ts`;
`scripts/harness/smoke-terminal-stage-harness.ts`.

**Impossible if true:** Replacement executing without human Enter; more than one Ctrl-U write; the
old and new command concatenating; a replacement bypassing sanitization or grapheme segmentation.

**Verification:** `bun test src/modules/terminal/TerminalCommandController.test.ts && bun scripts/harness/smoke-terminal-stage-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-24

### The terminal is a runtime plugin

**Invariant:** If Invar hosts a terminal, then it does so through `TerminalPlugin` — a contributed
runtime registered in `DefaultPlugins` — and no file under `src/modules/{app,workspace,ui}` imports
`src/modules/terminal/` or names its record. Shell choice, prompt theming, clean-prompt policy,
instance registry, command-note wording, terminal keybindings, and terminal status all live inside
this module.

**Scope:** `TerminalPlugin`, `TerminalFactory`, `TerminalPaneContent`'s capability and
keybinding-context surface, `TerminalCommandNote`, and the terminal entry in `DefaultPlugins`. The
byte, emulator, and observation contracts above are unchanged by the extraction.

**Components:**
- Registered as a runtime — `activateApplication` calls `registerPaneRuntime(this)` and nothing
  else registers the `terminal` kind.
- Contributed keybindings — the six `terminal` context bindings ship in the plugin's manifest, not
  in the host's canonical keybinding layer.
- Contributed status — terminal status keys reach probes through `StatusProjectionContributions`;
  the host holds no terminal status default.
- Capability-resolved ports — `terminal-commands`, `terminal-observation`, and `text-selection` are
  resolved by identifier through `PaneContent.capability`, so the agent's tools and follow
  controller reach the terminal without either side importing the other's class.
- Declined actions — `claimsContextAction` returns false for `terminal.copy` without a selection, so
  Ctrl+C still reaches the child as SIGINT without the host special-casing the pane.

**Mechanism:** `TerminalPlugin` reads `settings.terminalCleanPrompt`, `theme.palette.terminalPrompt`,
`settings.agentTypingSpeed`, and `settings.reducedMotion` itself and passes them to
`TerminalFactory.create`; a request carrying a declared `process` is launched with its own prompt
instead. The plugin keeps its own map of the panes it created and resolves "the current terminal"
only as the host-reported pane in the active workspace world. A hidden workspace terminal never
projects status or answers an active-workspace consumer.

**Generates:** a host that can be read end to end without learning what a PTY is; an uninstallable
terminal; a terminal profile (a CLI agent in a pane) expressible as a request rather than a new
host concept.

**Evidence:** `src/modules/terminal/TerminalPlugin.ts`;
`src/modules/terminal/TerminalPlugin.test.ts`; `src/modules/plugins/DefaultPlugins.ts`;
`scripts/harness/smoke-terminal-harness.ts`; `scripts/harness/smoke-terminal-stage-harness.ts`;
`scripts/harness/smoke-panel-split-harness.ts`;
`scripts/harness/smoke-plugin-manifest-harness.ts`.

**Impossible if true:** a host file importing `../terminal/…`; a terminal keybinding resolving with
the plugin uninstalled; terminal status keys surviving uninstall; the host reading a terminal
command event.

**Verification:** `bun test src/modules/terminal/TerminalPlugin.test.ts && grep -rln
"modules/terminal/" --include='*.ts' src/modules/app src/modules/workspace src/modules/ui`

**Status:** provisional

**Last refined:** 2026-07-29
