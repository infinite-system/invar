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

## Chosen invariants

### Agent text wraps at word boundaries

**Invariant:** If transcript or composer text exceeds its display width, then both surfaces wrap
through `AgentWordWrap` at whitespace, use an existing hyphen only for an over-width hyphenated
token, and hard-break an unbreakable token by whole graphemes only as the overflow fallback.

**Scope:** Agent transcript bodies and the editable composer. The composer reserves two blank display
columns at its right edge in addition to its two-column prompt gutter. Collapsed one-line tool and
permission summaries remain clipped chrome rather than wrapped prose.

**Mechanism:** `AgentWordWrap` consumes `TextSegmentation.words` and grapheme clusters while measuring
every candidate with the existing `WrapText` display-cell authority. `AgentTranscriptProjection` and
`AgentComposer` both call that seam; the composer retains its source grapheme ranges for caret,
selection, and editing geometry while its protected static right-padding getter reduces the wrap
budget by two columns.

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

### Composer word edits share one seam

**Invariant:** If the agent composer moves or deletes by word, then it uses the shared
`TextEditing.wordLeft`, `TextEditing.wordRight`, and `TextEditing.deletePreviousWord` boundaries.

**Scope:** Agent composer word-left, word-right, and Alt-Backspace behavior.

**Mechanism:** Agent-context keybindings resolve word intents, `Bootstrap` routes those intents to
`AgentPaneContent`, and `AgentComposer` delegates every boundary calculation to `TextEditing`.

**Generates:** Composer parity with editor and search text inputs without a second word parser.

**Evidence:** `src/modules/agent/AgentComposer.test.ts`;
`scripts/harness/smoke-agent-pane-ux-harness.ts`.

**Impossible if true:** Composer word deletion disagreeing with editor word deletion for the same
text; Alt-Backspace being swallowed; word motion splitting a grapheme.

**Verification:** `bun test src/modules/agent/AgentComposer.test.ts && bun scripts/harness/smoke-agent-pane-ux-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-24

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

**Invariant:** If a terminal command completion reaches `AgentTerminalFollow`, then the follow mode
read at that command boundary alone determines delivery: `follow-all` requests a response,
`on-error` requests one only for a known nonzero exit, `on-request` adds silent context, and `off`
delivers nothing.

**Scope:** `AgentTerminalFollow`, `AgentSession` external context and response methods, the agent
footer control, `agentTerminalFollowMode` setting, `agent.cycleTerminalFollowMode` command and
keybinding, and the status projection. Terminal event construction and redaction remain governed by
`terminal.invariants.md`.

**Components:**
- Live boundary read — mode changes affect the next completed command without rebuilding the session.
- Known failure — `on-error` requires `exitCode !== 0 && exitCode !== null`, so heuristic boundaries
  never trigger it.
- One mode cell — footer clicks, F6, the command palette, Settings, delivery, and status all read or
  mutate `Settings.agentTerminalFollowMode`.

**Mechanism:** `AgentTerminalFollow` subscribes once to the terminal observation port and reads the
mode ref inside each event callback. It calls `AgentSession.requestExternalResponse` for response
modes and `AgentSession.ingestContext` for `on-request`; the footer port and every command path cycle
the same setting ref.

**Generates:** Activity-paced agent turns; silent on-request context; a visible footer indicator;
mouse, keybinding, palette, and Settings parity; follow mode and event-count probe fields.

**Evidence:** `src/modules/agent/AgentTerminalFollow.ts`;
`src/modules/agent/AgentTerminalFollow.test.ts`; `src/modules/agent/AgentPaneContent.test.ts`;
`scripts/harness/smoke-terminal-follow-harness.ts`.

**Impossible if true:** `on-error` responding to exit code zero or null; `on-request` starting an
agent turn; `off` adding context or transcript entries; footer, Settings, and status reporting
different modes.

**Verification:** `bun test src/modules/agent/AgentTerminalFollow.test.ts src/modules/agent/AgentPaneContent.test.ts && bun scripts/harness/smoke-terminal-follow-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-25

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
