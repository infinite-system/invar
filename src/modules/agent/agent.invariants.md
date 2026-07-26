# Agent Harness — Invariants

Load-bearing rules for `src/modules/agent/` (the native AI-agent pane) and its composable-pane mount
(`src/modules/ui/PaneContent.interface.ts`, `src/modules/ui/PanelHost.ts`). Stands on `project.invariants.md`
(one-way data flow, cost tracks the observed set) and deliberately mirrors `terminal.invariants.md`
(backend-seam + single-source-of-truth patterns). This is the *second* agent integration; the PTY
guest path (Claude Code inside the terminal pane) stays valid and untouched. Tier-S scope: one
session, a transcript pane, a composer line, a local echo backend — the deterministic skeleton the
real subscription-billed backend drops into.

Full design + tier plan: `project.agent-harness.md`.

## Reality-based invariants

### An agent session is a structured event stream, not a screen

**Invariant:** If an agent integration consumes rendered output (terminal cells, ANSI), it can only
replay what the agent chose to draw; if it consumes the agent's STRUCTURED events (text deltas,
tool-use requests, tool results, lifecycle), the host can project them into ANY surface and compose
them with its own capabilities. Composition requires the event stream; pixels are a dead end.

**Scope:** the whole `agent/` module. Does not apply to the PTY guest path, which is knowingly the
pixels path and stays a plain terminal citizen.

**Mechanism:** `AgentBackend` yields typed `AgentEvent`s (`AgentEvents.interface.ts`): text-delta, tool-use,
tool-result, error, session lifecycle. `AgentSession` folds those into model state. No ANSI parsing
exists anywhere in the module.

**Generates:** clickable file references; diffs rendered in the git panel's diff view; transcript
folding/search; policy-gated approvals; multi-session dashboards; headless runs — none possible
against a screen.

**Impossible if true:** any code path that regex-parses terminal cells to "understand" the agent; a
native feature that only works by injecting keystrokes into a guest TUI; `agent/` importing
`terminal/`.

**Evidence:** `src/modules/agent/AgentSession.test.ts` scripts an event sequence through
`MockAgentBackend` and asserts `AgentSession` state after each event; `scripts/smoke-agent.sh` drives
the pane and asserts transcript cells, with zero PTY involvement. Conventions check: `src/modules/agent/`
must not import from `src/modules/terminal/`.

**Verification:** `bun test src/modules/agent/AgentSession.test.ts && bash scripts/smoke-agent.sh`

**Status:** provisional

**Last refined:** 2026-07-23

### The transcript is the single source of agent session truth

**Invariant:** If a session produced an event, it lives in ONE append-only transcript owned by
`AgentSession`; every surface (pane renderer, title, future badges/persistence) is a PURE projection
of that transcript, and none maintains a parallel history. Mirrors the terminal's "emulator is the
single source of screen state" — a second history would diverge from the real one.

**Scope:** `AgentSession` and everything that displays or persists it.

**Mechanism:** `AgentSession` owns one `TranscriptEntry[]`, mutated only by its own `fold()`/`send()`;
`transcript` exposes a read-only view. Each fold bumps `renderRevision`, the single reactive paint
pulse the frame effect observes (an idle session bumps nothing → idle quiescence holds).
`AgentPaneRenderer` builds a `StyledText` purely from the pulled transcript each frame; it holds no
history. Assistant text-deltas accumulate into the trailing assistant entry; any other event closes
that turn.

**Generates:** a renderer that is stateless and cannot drift from the session; replay/persistence for
free later (serialize the one transcript); derived status (`idle`/`streaming`/`awaiting-tool`) as a
pure function of the folded stream.

**Impossible if true:** a renderer holding its own copy of the messages; a badge counting events from
a separate tally; two histories for one session.

**Evidence:** `src/modules/agent/AgentSession.test.ts` — after a scripted stream, `session.transcript`
holds exactly the expected entries (deltas coalesced, tool-use/result paired) and `status` matches;
the renderer reads only `session.transcript`.

**Verification:** `bun test src/modules/agent/AgentSession.test.ts`

**Status:** provisional

**Last refined:** 2026-07-23

### Process exit and stream closure are independent

**Invariant:** If an agent child process exits, then its stdout or stderr iterator may remain open,
so process exit must complete the turn without waiting for stream closure.

**Scope:** `CliStreamBackend`, `CodexStreamBackend`, and every future child-process
`AgentBackend`. `SdkStreamBackend` and long-lived app-server turn interruption are covered by
their own abort completion paths.

**Mechanism:** Each child backend observes `child.exited` as soon as the child is spawned and
settles the matching turn from that promise. Stream pumps only translate output; they do not own
turn completion.

**Generates:** Exit listeners independent of stream iteration; child-identity guards; a
process-death test whose stdout iterator never closes.

**Evidence:** `src/modules/agent/CliStreamBackend.test.ts`;
`src/modules/agent/CodexStreamBackend.test.ts`; `scripts/harness/smoke-agent-cancel-harness.ts`.

**Impossible if true:** An exited child leaving `agentTurnState` running or stalled because its
stdout iterator did not close.

**Verification:** `bun test src/modules/agent/CliStreamBackend.test.ts src/modules/agent/CodexStreamBackend.test.ts && bun scripts/harness/smoke-agent-cancel-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-25

## Chosen invariants

### Every agent turn reaches a terminal state

**Invariant:** If an agent turn starts, then backend completion, backend failure, process exit, or
user cancellation moves it out of running or stalled and leaves the composer usable.

**Scope:** `AgentSession`, every `AgentBackend`, the focused agent pane Escape action, and
`agentTurnState`.

**Mechanism:** `AgentSession` owns one turn state machine. Every backend termination path emits one
`session-end`; Escape records `canceled` immediately and calls the backend interruption seam, while
late events from that canceled turn cannot revive it.

**Generates:** Escape cancellation; transcript cancellation records; backend process cleanup;
running, stalled, canceled, and idle probe states.

**Evidence:** `src/modules/agent/AgentSession.test.ts`;
`src/modules/agent/AgentPaneContent.test.ts`; `scripts/harness/smoke-agent-cancel-harness.ts`.

**Impossible if true:** A dead or canceled backend leaving `agentBusy` true; Escape closing an
agent turn while an input overlay is open; a canceled turn consuming later composer input.

**Verification:** `bun test src/modules/agent/AgentSession.test.ts src/modules/agent/AgentPaneContent.test.ts && bun scripts/harness/smoke-agent-cancel-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-25

### Stream inactivity is visible and non-destructive

**Invariant:** If an in-flight agent turn emits no backend event for the inactivity threshold,
then its state becomes stalled and remains alive until an event arrives or the user cancels it.

**Scope:** The `AgentSession` inactivity watchdog, the spinner line, and `agentTurnState`.

**Mechanism:** Every backend event resets one turn-owned timer. Expiry changes only the projected
state and render revision; it never calls `AgentBackend.interrupt`.

**Generates:** The `stalled — esc to cancel` spinner state; a 120-second production threshold; a
short injected threshold for deterministic tests and the driven harness.

**Evidence:** `src/modules/agent/AgentSession.test.ts`;
`src/modules/agent/AgentPaneContent.test.ts`; `scripts/harness/smoke-agent-cancel-harness.ts`.

**Impossible if true:** Watchdog expiry killing a child or aborting a stream; a silent turn
remaining visually indistinguishable from an active turn after the threshold.

**Verification:** `bun test src/modules/agent/AgentSession.test.ts src/modules/agent/AgentPaneContent.test.ts && bun scripts/harness/smoke-agent-cancel-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-25

### Thinking indicator follows turn state

**Invariant:** If an agent pane is visible, then its thinking indicator is running if and only if
`AgentSession.turnInFlight` is true.

**Scope:** `AgentSession.turnInFlight`, `AgentSpinner`, and the thinking-indicator projection in
`AgentPaneContent`. Hidden panes do not animate even when their session has a turn in flight; hiding
changes projection cost, not session state.

**Mechanism:** `AgentSession.turnInFlight` derives only from `turnState`. `AgentPaneContent` passes
`session.turnInFlight && paneVisible` to `AgentSpinner`, whose `running` member is a plain getter over
that source and whose timer watcher only maintains the derived animation resource. The pane renders
`AgentThinkingIndicator` from the same `turnInFlight` predicate. No caller can start or stop the
indicator imperatively.

**Generates:** One turn-liveness predicate for titles, indicator projection, and timer ownership;
immediate indicator teardown at every terminal turn state; hidden-pane idle quiescence.

**Rejected alternatives:** Start at send and stop in completion handlers — every new completion,
cancellation, replacement, or injection path becomes another place that can forget teardown.

**Evidence:** `src/modules/agent/AgentSpinner.ts`;
`src/modules/agent/AgentSpinner.test.ts`; `src/modules/agent/AgentPaneContent.ts`;
`src/modules/agent/AgentPaneContent.test.ts`;
`scripts/harness/smoke-terminal-follow-harness.ts`.

**Impossible if true:** No sequence of injected, user, cancelled, superseded, or failed turns can
leave the indicator running with no turn in flight.

**Verification:** `bun test src/modules/agent/AgentSpinner.test.ts
src/modules/agent/AgentPaneContent.test.ts src/modules/agent/AgentSession.test.ts && bun
scripts/harness/smoke-terminal-follow-harness.ts && bash scripts/behavioral-contracts.sh`

**Status:** provisional

**Last refined:** 2026-07-26

### Queued agent messages preserve order

**Invariant:** If the user submits messages while an agent turn is active, then those messages
remain visible in transcript order and reach the backend in that order as turns settle.

**Scope:** User messages submitted from `AgentPaneContent`; terminal-follow external prompts retain
their existing queue and are outside this user-controlled hold contract.

**Mechanism:** `AgentSession` owns queued delivery state on the transcript entries themselves.
Normal completion dispatches the head; cancellation holds the queue until empty Enter or a queued
message click explicitly releases the head.

**Generates:** Editable composer during turns; queued transcript affordances;
`queuedMessageCount`; ordered automatic dispatch; cancellation hold and explicit release.

**Evidence:** `src/modules/agent/AgentSession.test.ts`;
`src/modules/agent/AgentPaneContent.test.ts`; `scripts/harness/smoke-agent-cancel-harness.ts`.

**Impossible if true:** A later queued message reaching the backend before an earlier one; queued
text existing only in the composer; cancellation automatically sending the queue.

**Verification:** `bun test src/modules/agent/AgentSession.test.ts src/modules/agent/AgentPaneContent.test.ts && bun scripts/harness/smoke-agent-cancel-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-25

### Agent text wraps at word boundaries

**Invariant:** If transcript or composer text exceeds its display width, then both surfaces wrap
through `AgentWordWrap` at whitespace, use an existing hyphen only for an over-width hyphenated
token, and hard-break an unbreakable token by whole graphemes only as the overflow fallback.

**Scope:** Agent transcript bodies and the editable composer. The composer reserves two blank display
columns at its right edge in addition to its two-column prompt gutter. Collapsed one-line tool and
permission summaries remain clipped chrome rather than wrapped prose.

**Mechanism:** `AgentWordWrap` consumes `TextSegmentation` word and grapheme segments and asks
`WrapBreakOpportunity` for prose-profile whitespace classification and hyphen boundaries while
measuring every candidate with the existing `WrapText` display-cell authority.
`AgentTranscriptProjection` and `AgentComposer` both call that seam; the composer retains its
source grapheme ranges for caret, selection, and editing geometry while its protected static
right-padding getter reduces the wrap budget by two columns.

**Generates:** Whole ordinary words on rendered rows; hyphen-first fallback for over-width compounds;
grapheme-safe hard fallback for CJK, emoji, and unbreakable tokens; matching transcript and composer
wrap behavior; a visible two-column composer right gap.

**Evidence:** `src/modules/agent/AgentWordWrap.test.ts`;
`src/modules/agent/AgentComposer.test.ts`; `src/modules/agent/AgentTranscriptProjection.test.ts`;
`scripts/harness/smoke-agent-pane-ux-harness.ts`.

**Impossible if true:** An ordinary word split across two agent rows while it fits the row width; a
hyphenated over-width word hard-split before a usable hyphen; a grapheme split into invalid text; the
composer painting typed text in either of its two reserved right-edge columns.

**Verification:** `bun test src/modules/agent/AgentWordWrap.test.ts src/modules/agent/AgentComposer.test.ts src/modules/agent/AgentTranscriptProjection.test.ts && bun scripts/harness/smoke-agent-pane-ux-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-25

### Composer editing uses the input model

**Invariant:** If the agent composer edits or moves within its logical line, then its text and
grapheme caret operations come from `TextInputModel`.

**Scope:** Agent composer insertion, backspace, forward delete, previous-word and next-word delete,
line delete, Left and Right movement, word movement, Home, and End. Wrapping, selection, pointer
mapping, transcript scrolling, and send history remain `AgentComposer` responsibilities.

**Mechanism:** `AgentComposer` owns one `TextInputModel` and delegates its editing core while keeping
its existing `AgentWordWrap` and `TextSelectionModel` composition. `TextInputModel` delegates word
boundaries to `TextEditing`; the shared input keybinding table reaches it through
`AgentPaneContent.applyComposerInputAction`.

**Generates:** Composer parity with every search input; grapheme-safe middle insertion and deletion;
Alt-Delete next-word deletion without a composer-local implementation.

**Evidence:** `src/modules/agent/AgentComposer.test.ts`;
`src/modules/editor/TextInputModel.test.ts`;
`scripts/harness/smoke-agent-pane-ux-harness.ts`.

**Impossible if true:** `AgentComposer` storing a second editable buffer or caret; composer word
deletion disagreeing with the editor for the same text; movement or deletion splitting a grapheme.

**Verification:** `bun test src/modules/agent/AgentComposer.test.ts src/modules/editor/TextInputModel.test.ts && bun scripts/harness/smoke-agent-pane-ux-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-25

### Agent transcript scroll extent is position independent

**Invariant:** For a fixed projected transcript and viewport geometry, every completed scroll frame
uses the same total visual-row count and viewport-row count; changing `scrollTop` can move the thumb
but cannot change its painted extent.

**Scope:** `AgentTranscriptProjection`, `AgentPaneContent` transcript layout,
`ScrollableTextViewport`, `ScrollbarGeometry`, and the agent path in the permanent scrollbar
harness. Streaming, expansion, resizing, or a provider switch may legitimately change the projected
total; mere scrolling may not.

**Mechanism:** `AgentPaneContent.render` projects the complete transcript at the current text width,
records `lines.length` as `contentLineCount`, and only then slices the visible window from
`scrollTop`. The shared viewport reads that full count and `viewportRows` once per paint for clamping
and scrollbar geometry. `SolidThumbScrollBar` rounds the position-independent virtual thumb size
once and clamps only its start, so half-cell start parity cannot alter the whole-cell length.

**Generates:** Stable agent thumb size during momentum; wrap-derived totals that do not breathe with
position; one exact input probe reusable for future transcript projections.

**Evidence:** `scripts/harness/smoke-scrollbars-harness.ts` creates a long wrapped echo transcript
and records every completed synchronized scroll frame. The driven run held
`viewportRows=14` and `contentRows=181` while `scrollTop` moved through 20 positions from 158 to 112;
the painted thumb remained exactly 2 rows in all 20 frames.

**Impossible if true:** Scrolling a fixed transcript changes its total visual-row count; the agent
thumb alternates between lengths while viewport and content inputs stay fixed; visible-window
slicing becomes the scrollbar's content extent.

**Verification:** `bun scripts/harness/smoke-scrollbars-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-25

### Terminal tools have explicit permission tiers

**Invariant:** If an agent backend registers terminal tools, then `readTerminalInput` is observation
tier, `readTerminalScrollback` is observation tier, `stageTerminalCommand` and
`replaceTerminalInput` are stage tier, and
`runTerminalCommand` exists only in bypass mode.

**Scope:** `AgentTerminalTools`, `SdkStreamBackend`, `CodexAppServerBackend`, and
`EchoAgentBackend`.

**Mechanism:** One `AgentTerminalTools.definitions` registry generates both backend tool lists.
Both read definitions, stage, and replace exist in every permission mode and auto-pass the SDK
permission gate; run is added only when live permission resolution says bypass.

**Generates:** The read-fix-retype loop on Claude and Codex; one permission ladder for every backend;
tool descriptions teach the safe flow.

**Evidence:** `src/modules/agent/AgentTerminalTools.test.ts`;
`src/modules/agent/EchoAgentBackend.test.ts`; `scripts/harness/smoke-terminal-stage-harness.ts`.

**Impossible if true:** `runTerminalCommand` appearing in ask mode; either read prompting for
execution permission; one backend missing scrollback read or replace while another exposes it.

**Verification:** `bun test src/modules/agent/AgentTerminalTools.test.ts src/modules/agent/EchoAgentBackend.test.ts`

**Status:** provisional

**Last refined:** 2026-07-25

### Terminal follow obeys the live user mode

**Invariant:** If a terminal command completion reaches `AgentTerminalFollow` while the terminal is
alive, then the follow mode read at that command boundary alone determines delivery: `follow-all`
requests a response, `on-error` requests one only for a known nonzero exit, `on-request` adds silent
context, and `off` delivers nothing; if the terminal has exited before delivery, no turn is sent.

**Scope:** `AgentTerminalFollow`, `AgentSession` external context and response methods, the agent
footer control, `agentTerminalFollowMode` setting, `agent.cycleTerminalFollowMode` command and
keybinding, and the status projection. Terminal event construction and redaction remain governed by
`terminal.invariants.md`. A command completion delivered before a later terminal exit remains
truthful at its own boundary.

**Components:**
- Live boundary read — mode changes affect the next completed command without rebuilding the session.
- Known failure — `on-error` requires `exitCode !== 0 && exitCode !== null`, so heuristic boundaries
  never trigger it.
- Live terminal — `terminalExited` is read at delivery, so buffered output parsed after process death
  starts no observation turn.
- One mode cell — footer clicks, Ctrl+Shift+M, the command palette, Settings, delivery, and status all read or
  mutate `Settings.agentTerminalFollowMode`.

**Mechanism:** `AgentTerminalFollow` subscribes once to the terminal observation port and reads the
mode ref inside each event callback. It calls `AgentSession.requestExternalResponse` for response
modes and `AgentSession.ingestContext` for `on-request`; the footer port and every command path cycle
the same setting ref. Before either delivery path, the controller reads
`AgentTerminalObservationPort.terminalExited`; an exited terminal makes the event non-deliverable.

**Generates:** Activity-paced agent turns; silent on-request context; a visible footer indicator;
mouse, keybinding, palette, and Settings parity; follow mode and event-count probe fields; no
misleading turn from output that arrives after terminal death.

**Evidence:** `src/modules/agent/AgentTerminalFollow.ts`;
`src/modules/agent/AgentTerminalFollow.test.ts`; `src/modules/agent/AgentPaneContent.test.ts`;
`scripts/harness/smoke-terminal-follow-harness.ts`.

**Impossible if true:** `on-error` responding to exit code zero or null; `on-request` starting an
agent turn; `off` adding context or transcript entries; a command observation starting a turn after
the terminal reports exited; footer, Settings, and status reporting different modes.

**Verification:** `bun test src/modules/agent/AgentTerminalFollow.test.ts src/modules/agent/AgentPaneContent.test.ts && bun scripts/harness/smoke-terminal-follow-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-26

### Agent events cross exactly one backend seam

**Invariant:** Every agent event enters the module through the single `AgentBackend` interface, and
nothing above the seam knows which implementation produced it. The scripted `MockAgentBackend`, the
local `EchoAgentBackend`, and the future `CliStreamBackend`/`ClaudeSdkBackend` are interchangeable
with zero change to `AgentSession` or the pane. Parallel to the terminal's `TerminalBackend`.

**Scope:** `AgentBackend` and its implementations; `AgentSession` (the sole consumer).

**Mechanism:** `AgentBackend` is `send`/`onEvent`/`interrupt`/`dispose`. `AgentSession` wires
`backend.onEvent → fold` once in its constructor and calls `backend.send` on a turn. `AgentFactory`
(Static, overridable) picks the default backend by auto-detection — real `CliStreamBackend` when
`claude` is on PATH, `EchoAgentBackend` otherwise, `EchoAgentBackend` forced by
`INVAR_AGENT_BACKEND=echo`; tests/hosts swap it via `create({ backend })`.

**Generates:** hermetic tests (Mock), an offline fallback (Echo), and real subscription-billed agents
— `CliStreamBackend` (Claude, `claude -p --output-format stream-json`) and `CodexStreamBackend` (Codex,
`codex exec --json`) — all behind one seam, so AgentSession/the pane never change when the backend
does. Provider selection + the neutral `agentSkipPermissions`/`agentModel` intent live in AgentFactory;
each backend translates the neutral options to its own CLI flags (skip-permissions →
`--dangerously-skip-permissions` for Claude, `--dangerously-bypass-approvals-and-sandbox` for Codex).
Adding a third engine is one new backend + mapping + one `AgentProvider` enum value.

**Impossible if true:** `AgentSession` branching on backend type; a second entry path for events that
bypasses `onEvent`.

**Evidence:** `AgentSession.test.ts` drives the session entirely through a `MockAgentBackend`;
`AgentFactory` defaults to `EchoAgentBackend` with no session change.

**Verification:** `bun test src/modules/agent/AgentSession.test.ts`

**Status:** provisional

**Last refined:** 2026-07-23

### The agent pane is a PaneContent citizen, not a special case

**Invariant:** The agent session mounts as a generic `PaneContent` in the same `PanelHost` slot the
terminal uses, and when both are visible the agent owns a separate headed region with the same
`render`/`handleKey`/`caret`/`renderRevision`/`dispose` shape and zero host rewiring.

**Scope:** `AgentPaneContent`, its mount in `PanelHost`, and the Bootstrap toggle that registers it.

**Mechanism:** `AgentPaneContent implements PaneContent`: `render()` delegates to `AgentPaneRenderer`;
`handleKey()` edits the composer (printable → append, Backspace → delete, Enter → send); `caret()`
pins to the composer; `renderRevision` fuses the session pulse with composer edits so both repaint
through the one frame effect. Bootstrap lazily creates it on first toggle (idle cost zero).

**Generates:** the agent pane composes with splits, focus, z-order, and pane-presence controls for
free; the same seam hosts multi-session regions later.

**Impossible if true:** a bespoke agent-only render/input path outside `PaneContent`; the host
special-casing the agent pane; agent content rendering under the terminal heading.

**Evidence:** `scripts/harness/smoke-agent-harness.ts` toggles the pane through the normal panel path,
types a prompt, and asserts the echoed reply renders; `scripts/harness/smoke-panel-split-harness.ts`
asserts terminal and agent headings over separate regions.

**Verification:** `bun scripts/harness/smoke-agent-harness.ts && bun
scripts/harness/smoke-panel-split-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-25

### Transcript search is a projection of the transcript

**Invariant:** Searching the transcript derives EVERYTHING from projections of the one append-only
transcript: the searchable text is exactly the projected visual lines the pane paints (so a collapsed
tool row is searched by its human summary and its hidden raw JSON is out of scope by construction —
what you see is what is searchable), and matches/count/current-match live only in the shared FindBar
engine bound to the transcript target. No search-side copy of the session history exists, and the
search UX is the ONE find vocabulary every searchable pane shares (the same bar, count, cycling, case
toggle) — never a second pane-local search input.

**Scope:** `AgentTranscriptSearch`, the search-mirror document and find-target seam in
`AgentPaneContent`, the search-highlight painting in `AgentPaneRenderer`, and the Ctrl+F routing for
the focused agent pane in `Bootstrap`. It also covers the themed search icon and its hit-zone in the
agent mode line.

**Mechanism:** `Bootstrap.openAgentTranscriptSearch` is the one overlay-coordinated action called by
both Ctrl+F and `AgentPaneContent.onPointerDown` for the mode-line search button. The button glyph
comes from the shared `ThemeIcons.findIconsFor` ladder, and `modeLineSegments` records its hit-zone
while emitting the same segment. The action opens the shared `FindBar` for a `FindBarTarget`
(`agent-transcript`, `replaceAllowed: false` — the markdown preview's read-only shape), upholding
[No action requires a memorized motion](../../../project.invariants.md#no-action-requires-a-memorized-motion).
The target's document is a MIRROR: `AgentPaneContent.synchronizeTranscriptSearch()` rebuilds it inside
`render()` from the same `AgentTranscriptProjection` lines the frame paints, re-running the engine only
when the projected text changed. `AgentTranscriptSearch` converts the engine's grapheme-column matches
to per-row DISPLAY-CELL spans (shared `EditorCoordinates`/`WrapText` seams — never UTF-16 slicing); the
renderer paints them per row, current match as a selection, others with the editor's find-match
background. Reveal scrolls the existing transcript scroll port; Esc closes the bar and the keys fall
back to the composer. Matching inside a COLLAPSED tool row's full JSON is deliberately out of scope —
expanding the row makes its body visible and therefore searchable.

**Generates:** live match count + highlights over a streaming transcript for free (the mirror refresh
rides the frames the stream already causes); retained per-target query/matches when focus moves
between the editor and the transcript (FindBar's engine map); search over any FUTURE projection change
(new row kinds are searchable the moment they project) with zero search-side code; keyboard and mouse
access through one action.

**Impossible if true:** a search-owned copy of transcript entries that can drift from the session; a
second search input/keymap vocabulary local to the pane; matches found in text the pane does not
display (collapsed JSON); a highlight positioned by UTF-16 offsets; transcript search reachable only
through Ctrl+F; the search icon opening a different target or bypassing overlay coordination.

**Evidence:** `src/modules/agent/AgentTranscriptSearch.test.ts` drives the real pipeline (entries →
projection → mirror document → FindInBuffer → display-cell spans): collapsed summary matches while
the hidden JSON does not until expanded; CJK-prefixed matches land on display cells;
`scripts/smoke-agent-search.sh` clicks the themed mode-line icon through mouse injection, then drives
Ctrl+F in the live pane and asserts both bind the same transcript target; it also asserts the count, the
painted highlight cells (FrameProbe), next-match viewport follow, Esc returning keys to the composer,
and idle quiescence with the bar open.

**Verification:** `bun test src/modules/agent/AgentTranscriptSearch.test.ts && bash scripts/smoke-agent-search.sh`

**Status:** provisional

**Last refined:** 2026-07-24

### One session is one Reactive instance

**Invariant:** A session's state (`transcript`, `status`, `renderRevision`) is exactly one `Reactive`
`AgentSession`; UI is optional and additive. The session runs and folds events whether or not a pane
is mounted, so headless/fleet use is the same object with no renderer attached.

**Scope:** `AgentSession` lifecycle and ownership.

**Mechanism:** `AgentSession` is `Reactive($AgentSession)`; the pane holds a reference but the session
owns the backend and the transcript. `dispose()` tears down the backend.

**Generates:** headless sessions (cron/fleet) reuse the same class with no pane; multi-session tabs
are N instances in the host.

**Impossible if true:** session state living in the renderer; a session that cannot exist without a
mounted pane.

**Evidence:** `AgentSession.test.ts` constructs and drives a session with NO pane and asserts full
transcript/status behavior.

**Verification:** `bun test src/modules/agent/AgentSession.test.ts`

**Status:** provisional

**Last refined:** 2026-07-23

### Agent instructions match the workspace

**Invariant:** If an agent turn starts in a workspace, then its instruction environment includes
that workspace's agent guidance and a leading project skill or command resolves to the same
instruction body before any backend receives the turn.

**Scope:** `AgentPromptResolver`, `AgentSession`, `SdkStreamBackend`, Claude CLI, and Codex turns.
Claude loads user and project setting sources; Codex natively reads `AGENTS.md`, not
`.claude/skills`. Resolver expansion is prompt text shared by every backend and does not imply
native Codex skill support.

**Mechanism:** `SdkStreamBackend` explicitly passes `settingSources: ["user", "project"]`.
`AgentSession.startBackendTurn` runs `AgentPromptResolver` before the one `AgentBackend.send` seam.
The resolver confines lookups through `Files` and tries
`.claude/skills/<name>/SKILL.md` before `.claude/commands/<name>.md`; a miss returns the original
prompt unchanged.

**Generates:** Project `CLAUDE.md`, settings, skills, and commands in Claude SDK sessions;
backend-independent slash expansion; skill precedence over a same-named command; honest Codex
guidance through `AGENTS.md` plus textual expansion only.

**Rejected alternatives:** Rely on provider-native slash parsing — behavior changes with the
installed CLI or SDK version and leaves other backends inconsistent.

**Evidence:** `src/modules/agent/AgentPromptResolver.test.ts`;
`scripts/harness/smoke-agent-cancel-harness.ts`; `src/modules/agent/SdkStreamBackend.ts`.

**Impossible if true:** A found project skill reaching one backend as an unresolved slash token;
an unknown slash turn being swallowed or rewritten; a resolver lookup escaping `.claude/skills`
or `.claude/commands`; Codex being described as natively loading Claude project skills.

**Verification:** `bun test src/modules/agent/AgentPromptResolver.test.ts && bun
scripts/harness/smoke-agent-cancel-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-25
