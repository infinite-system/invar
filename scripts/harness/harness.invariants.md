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

**Scope:** `PtyTestDriver` and every `scripts/harness/smoke-*-harness.ts` smoke. Unit tests of byte
encoders and recorded-stream quiescence are intentionally process-free.

**Mechanism:** `PtyTestDriver` role-inverts the shared `OpenPty` allocator: the harness owns the master
as the terminal and Invar owns the slave as its stdin, stdout, and stderr. The child environment
declares `TERM=xterm-256color` and `COLORTERM=truecolor`; no harness-only app behavior is enabled.

**Generates:** real termios and terminal-protocol behavior; named key encoding; SGR mouse input;
bracketed paste; resize through the same PTY generator as the integrated terminal.

**Evidence:** `scripts/harness/PtyTestDriver.ts`; the fourteen `smoke-*-harness.ts` files.

**Impossible if true:** a smoke calling an app model directly; bytes bypassing the PTY; a test-only
input or rendering hook inside Invar.

**Verification:** `for smoke in editor find comment-styling bracket-match indent-guides move-line
word-delete paste tabs workspace-tabs mode-coherence wrap selection scrollbars; do bun
"scripts/harness/smoke-${smoke}-harness.ts" || exit; done`

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

**Scope:** The fourteen tmux smokes with additive harness ports in `scripts/merge-gate.sh`: editor,
find, comment-styling, bracket-match, indent-guides, move-line, word-delete, paste, tabs,
workspace-tabs, mode-coherence, wrap, selection, and scrollbars. Future ports follow the same rule
until a separate decision replaces the independent ring.

**Mechanism:** The harness trusts the same `TerminalEmulator` used by the integrated terminal, so a
shared emulator defect can fool both production and the harness. Keeping the original tmux path
preserves a structurally different emulator and observation stack that can expose that common-mode
failure.

**Generates:** additive merge-gate entries; cross-oracle disagreement as a visible failure; migration
without deleting prior evidence.

**Rejected alternatives:** Replace each tmux smoke as soon as it is ported — removes the only
independent screen parser and makes emulator defects self-confirming.

**Evidence:** `scripts/merge-gate.sh`; the fourteen matching `scripts/smoke-*.sh` and
`scripts/harness/smoke-*-harness.ts` pairs named in Scope.

**Impossible if true:** a harness port deleting or deregistering its tmux original; both verification
rings depending on `TerminalEmulator`; a common emulator bug passing without an independent check.

**Verification:** `for smoke in editor find comment-styling bracket-match indent-guides move-line
word-delete paste tabs workspace-tabs mode-coherence wrap selection scrollbars; do rg -q "smoke:
${smoke//-/[ -]}" scripts/merge-gate.sh && test -f "scripts/smoke-${smoke}.sh" && test -f
"scripts/harness/smoke-${smoke}-harness.ts" || exit; done`

**Status:** provisional

**Last refined:** 2026-07-24

### Input byte latency uses a reviewed gate baseline

**Invariant:** If the merge gate measures input byte flush latency, then it runs five independent
sessions, records their median p50 and p95 at the named byte-arrival boundary, appends the result to
ignored NDJSON history, warns above the reviewed p50 baseline times 1.3, and fails above baseline
times 2.

**Scope:** `scripts/harness/input-byte-flush-gate.ts`, its unskipped `scripts/merge-gate.sh` step,
the machine-readable block in `project.performance-baselines.md`, and
`.perf-history/input-byte-flush.ndjson`. The broader soft performance suite remains outside this
hard latency check.

**Mechanism:** `input-byte-flush-gate.ts` launches
`scripts/harness/measure-input-byte-flush.ts` five times, rejects a boundary mismatch, takes the
median of session p50 and p95 values, reads thresholds from the reviewed JSON block, appends one
history object, and returns non-zero above the failure threshold. `reporting_step` preserves its
successful p50, p95, and boundary output in the merge-gate log.

**Generates:** an always-run latency regression signal under `SKIP_PERF` and `FAST`; commit-addressed
history; a non-blocking warning band; an explicit landing diff whenever the baseline changes.

**Rejected alternatives:** Update the baseline from measurement history — lets the tested commit
move its own threshold and makes regressions self-ratifying.

**Evidence:** `scripts/harness/input-byte-flush-gate.ts`; `scripts/merge-gate.sh`;
`project.performance-baselines.md` `Input byte flush merge-gate baseline`.

**Impossible if true:** `SKIP_PERF=1` bypassing the latency check; a p50 above baseline times 2
leaving the gate green; a history line without sha, timestamp, p50, p95, and boundary; a successful
gate log omitting the measurement boundary.

**Verification:** `bun scripts/harness/input-byte-flush-gate.ts &&
(INPUT_BYTE_FLUSH_BASELINE_P50_MILLISECONDS=0 bun scripts/harness/input-byte-flush-gate.ts; test $?
-ne 0)`

**Status:** provisional

**Last refined:** 2026-07-24

### Harness waits observe conditions not frame ordinals

**Invariant:** If a harness waits for a user-visible transition, then it resolves from a named grid
condition or synchronized-output quiescence, never from a target frame ordinal.

**Scope:** `PtyTestDriver`, every `scripts/harness/smoke-*-harness.ts` port, and shared harness
helpers. Frame counts may diagnose output volume, but they never identify the state a waiter expects.

**Mechanism:** `PtyTestDriver.awaitGridCondition` flushes and checks the current emulator grid first,
then checks again after each future synchronized-frame completion event. `awaitQuiescence` waits on a
completion event associated with pending input, without calculating a target frame number.

**Generates:** already-satisfied fast paths; transition waits named for visible outcomes; timeout
errors containing the predicate description and final relevant grid region; frame coalescing and
zero-frame actions that cannot strand a condition already visible.

**Rejected alternatives:** Wait for frame N — repaint coalescing changes frame ordinals under load,
and an action whose target is already rendered may emit no frame.

**Evidence:** `scripts/harness/PtyTestDriver.ts`; the recorded-stream cases in
`scripts/harness/PtyTestDriver.test.ts`; `scripts/harness/smoke-goto-definition-harness.ts`.

**Impossible if true:** A transition timeout that names a target frame ordinal; a satisfied grid
predicate waiting for another frame; two coalesced invalidations requiring two completed frames.

**Verification:** `bun test scripts/harness/PtyTestDriver.test.ts
scripts/harness/SynchronizedOutputQuiescence.test.ts`

**Status:** established

**Last refined:** 2026-07-24

### Shared seam changes verify every consumer

**Invariant:** If a shared harness seam changes behavior, then verification covers every registered
consumer of that seam before the change is complete.

**Scope:** `PtyTestDriver`, `HarnessSmoke`, `HarnessSmokeSupport`, and every registered
`scripts/harness/smoke-*-harness.ts` consumer. A change confined to one smoke without changing shared
behavior is outside this rule.

**Mechanism:** Shared wait, input, status, and screen-oracle helpers generate behavior for all harness
ports. `scripts/merge-gate.sh` is the authoritative consumer registry, so running every registered
harness smoke exposes both direct regressions and consumer assumptions that unit tests of the seam
cannot observe.

**Generates:** Full registered-consumer verification for shared harness changes; per-consumer
diagnoses when semantics move; focused repetition only after the complete consumer set passes once.

**Rejected alternatives:** Verify only the smokes changed in the same commit — a shared seam can
break an unchanged consumer whose prior assumption was never encoded in the seam's unit tests.

**Evidence:** The `PtyTestDriver.awaitQuiescence` and status-wait change in commit `32a843d` passed its
three focused smokes but regressed seven previously green registered harness ports.

**Impossible if true:** A shared harness change called complete after only a selected subset of its
registered consumers passes; an unchanged registered smoke regression first discovered by a later
full gate.

**Verification:** Run every `smoke-*-harness.ts` registered in `scripts/merge-gate.sh` once and
require every exit status to be zero.

**Status:** established

**Last refined:** 2026-07-24
