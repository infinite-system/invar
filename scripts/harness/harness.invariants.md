# PTY test harness invariants

Load-bearing rules for `scripts/harness/`: a byte-level driver that replaces tmux as the immediate
terminal while preserving tmux smokes as an independent verification ring. Stands on
`src/modules/terminal/terminal.invariants.md` and the project rule that seams are drawn at their
shared generator.

## Reality-based invariants

### Synchronized end markers bound complete frames

**Invariant:** If OpenTUI emits a frame between DEC private mode 2026 begin and end markers, then the
matching end marker is the first byte boundary at which that synchronized frame is complete.

**Scope:** Raw Invar output bytes received by `PtyTestDriver` while OpenTUI continues to emit
`ESC[?2026h` and `ESC[?2026l`. Process startup before the first marker and a future renderer that
stops emitting mode 2026 are outside the marker guarantee.

**Renegotiable at:** OpenTUI renderer output protocol — a renderer upgrade requires a recorded-stream
test and an explicit replacement quiescence mechanism.

**Mechanism:** `SynchronizedOutputQuiescence` scans raw chunks across chunk boundaries, tracks nesting,
and advances `completedFrameCount` only for an end marker paired with an observed begin marker. It
records the end-marker byte-arrival timestamp before the PTY callback feeds `TerminalEmulator`.
`PtyTestDriver.awaitQuiescence` separately flushes `TerminalEmulator`, so the snapshot includes every
byte through that completed frame.

**Generates:** deterministic frame waits without settle sleeps; byte-arrival timestamps; marker-silence
assertions; chunk-boundary tests for the marker detector; a fail-loud timeout when no completed frame
arrives.

**Evidence:** A raw PTY capture on 2026-07-24 recorded three matched mode-2026 frame pairs;
`scripts/harness/SynchronizedOutputQuiescence.test.ts` preserves the observed marker shape, timestamp,
silence, and chunk-boundary cases.

**Impossible if true:** `awaitQuiescence` resolving in the middle of a synchronized frame; a marker
split across PTY chunks being missed; a fixed sleep being the condition that declares a frame stable;
a silence assertion passing after a complete frame arrived during its interval.

**Verification:** `bun test scripts/harness/SynchronizedOutputQuiescence.test.ts`

**Status:** provisional

**Last refined:** 2026-07-24

## Chosen invariants

### Harness input and output use the real PTY

**Invariant:** If a harness smoke drives Invar, then it spawns the real `src/main.ts` entry on an
`OpenPty` slave, sends terminal-encoded key, mouse, and paste bytes through the master, and observes
only bytes returned through that same master.

**Scope:** `PtyTestDriver` and every `scripts/harness/smoke-*-harness.ts` proof-of-concept smoke.
Unit tests of byte encoders and recorded-stream quiescence are intentionally process-free.

**Mechanism:** `PtyTestDriver` role-inverts the shared `OpenPty` allocator: the harness owns the master
as the terminal and Invar owns the slave as its stdin, stdout, and stderr. The child environment
declares `TERM=xterm-256color` and `COLORTERM=truecolor`; no harness-only app behavior is enabled.

**Generates:** real termios and terminal-protocol behavior; named key encoding; SGR mouse input;
bracketed paste; resize through the same PTY generator as the integrated terminal.

**Evidence:** `scripts/harness/PtyTestDriver.ts`; the three `smoke-*-harness.ts` files.

**Impossible if true:** a smoke calling an app model directly; bytes bypassing the PTY; a test-only
input or rendering hook inside Invar.

**Verification:** `bun scripts/harness/smoke-wrap-harness.ts && bun scripts/harness/smoke-selection-harness.ts && bun scripts/harness/smoke-scrollbars-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-24

### Latency measurements name their observation boundary

**Invariant:** If the PTY harness reports a latency, then the metric names its start and end
observations, and a byte-arrival metric ends at the DEC 2026 end-marker timestamp captured before
terminal emulation.

**Scope:** `PtyTestDriver.sendKeysAndAwaitFrameByteArrival`,
`scripts/harness/measure-input-byte-flush.ts`, and performance documentation derived from them.
Settled-screen smokes still use `PtyTestDriver.awaitQuiescence`.

**Mechanism:** `SynchronizedOutputQuiescence.observeByte` timestamps the matching end marker inside the
PTY callback. The callback feeds `TerminalEmulator` only after that observation; callers use the
recorded timestamp for byte arrival and await `TerminalEmulator.flush()` only for the separately
named settled-snapshot boundary.

**Generates:** input-write-to-byte-arrival timing; marker-arrival-to-oracle-ready timing; reports that
cannot silently include emulator work in an application byte-flush number.

**Rejected alternatives:** Time the return from `awaitQuiescence` as byte flush — the async
continuation resumes only after synchronous emulator work and therefore crosses two boundaries.

**Evidence:** `scripts/harness/SynchronizedOutputQuiescence.ts`;
`scripts/harness/PtyTestDriver.ts`; the recorded-stream boundary test in
`scripts/harness/SynchronizedOutputQuiescence.test.ts`; `scripts/harness/measure-input-byte-flush.ts`.

**Impossible if true:** A number labeled byte-arrival latency that includes
`TerminalEmulator.write` or `TerminalEmulator.flush`; a latency report with no named start and end
observations.

**Verification:** `bun test scripts/harness/SynchronizedOutputQuiescence.test.ts && bun
scripts/harness/measure-input-byte-flush.ts`

**Status:** established

**Last refined:** 2026-07-24

### The terminal emulator is the harness screen oracle

**Invariant:** If the harness asserts screen text, colors, or attributes, then it parses the app byte
stream with `TerminalEmulator` and reads immutable cell snapshots; it never implements another ANSI
parser or infers styling from glyphs.

**Scope:** Byte-level visual assertions in `scripts/harness/`. Semantic state assertions may still use
the existing `StatusChannel` or `FrameProbe`, but the proof-of-concept ports prefer PTY cells.

**Mechanism:** Every master-output chunk is fed unchanged to the production `TerminalEmulator`.
`HarnessSnapshot` copies its visible cell grid after a synchronized frame and exposes text-row helpers
plus the full foreground, background, and attribute record per cell.

**Generates:** one VT interpretation shared by production terminal panes and the harness; exact
truecolor background-run assertions; no tmux color re-encoding or glyph remapping in this ring.

**Evidence:** `src/modules/terminal/TerminalEmulator.ts`; `scripts/harness/HarnessSnapshot.ts`;
`scripts/harness/smoke-scrollbars-harness.ts`.

**Impossible if true:** a harness-local ANSI state machine; a background-fill assertion that searches
for a block glyph; a snapshot cell lacking the emulator color mode or SGR attributes.

**Verification:** `bun test scripts/harness/PtyTestDriver.test.ts && bun scripts/harness/smoke-scrollbars-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-24

### Tmux smokes remain an independent verification ring

**Invariant:** If a behavior is ported to the PTY harness, then its original tmux smoke remains
registered and unchanged as an independent terminal-emulator cross-check.

**Scope:** `smoke-wrap`, `smoke-selection`, and `smoke-scrollbars` plus their additive harness ports in
`scripts/merge-gate.sh`. Future ports follow the same rule until a separate decision replaces the
independent ring.

**Mechanism:** The harness trusts the same `TerminalEmulator` used by the integrated terminal, so a
shared emulator defect can fool both production and the harness. Keeping the original tmux path
preserves a structurally different emulator and observation stack that can expose that common-mode
failure.

**Generates:** additive merge-gate entries; cross-oracle disagreement as a visible failure; migration
without deleting prior evidence.

**Rejected alternatives:** Replace each tmux smoke as soon as it is ported — removes the only
independent screen parser and makes emulator defects self-confirming.

**Evidence:** `scripts/merge-gate.sh`; `scripts/smoke-wrap.sh`; `scripts/smoke-selection.sh`;
`scripts/smoke-scrollbars.sh`.

**Impossible if true:** a harness port deleting or deregistering its tmux original; both verification
rings depending on `TerminalEmulator`; a common emulator bug passing without an independent check.

**Verification:** `rg "smoke: (wrap|selection|scrollbars)" scripts/merge-gate.sh`

**Status:** provisional

**Last refined:** 2026-07-24
