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

### Harness output history stays bounded

**Invariant:** If `PtyTestDriver` retains application output, then its default history stays bounded
while clipboard emissions and registered output-sequence counts accumulate across the full stream.

**Scope:** `PtyTestDriver` output retention, `TerminalOutputAudit`, and harness consumers of
`clipboardEmissions` or `outputSequenceCount`. Fixture recorders that explicitly set
`retainFullOutput: true` are outside the default retention bound.

**Components:**
- *Retained bytes stay bounded* — `recordedOutput()` returns at most the latest 4 MB by default.
- *Derived facts survive trimming* — clipboard emissions and registered sequence counts accumulate
  as chunks arrive instead of being re-derived from retained history.

**Mechanism:** `PtyTestDriver` head-trims `observedOutput` after each decoded PTY chunk while one
stateful `TerminalOutputAudit` consumes that chunk and registered counters scan it with
cross-chunk carry. A first sequence query after overflow throws instead of returning a partial count.

**Generates:** bounded default harness retention; absolute clipboard-emission offsets; split-sequence
counting; explicit full-stream retention for fixture recorders; loud late-registration failures.

**Rejected alternatives:** Re-scan the retained tail for derived facts — trimming silently loses
earlier clipboard emissions and sequence matches.

**Evidence:** `scripts/harness/PtyTestDriver.ts`; `scripts/harness/TerminalOutputAudit.ts`;
`scripts/harness/PtyTestDriver.test.ts`; `scripts/harness/TerminalOutputAudit.test.ts`.

**Impossible if true:** A default driver retaining more than 4 MB of output; a registered sequence
count decreasing after trimming; a clipboard emission disappearing from the audit after trimming; a
first sequence query after overflow returning a partial count.

**Verification:** `bun test scripts/harness/PtyTestDriver.test.ts
scripts/harness/TerminalOutputAudit.test.ts`

**Status:** provisional

**Last refined:** 2026-07-25

### The conformance corpus replaces the tmux ring

**Invariant:** If the PTY harness uses `TerminalEmulator` as its screen oracle, then the blocking
`bun test` phase proves that oracle directly from byte fixtures, while tmux originals run only in
explicit `INVAR_FULL_TMUX=1` audits and never in the normal merge gate.

**Scope:** Post-corpus (2026-07-24, user-approved after the 42/42 port campaign and sentinel-ring
demotion): `TerminalEmulatorConformance.test.ts` is the normal-gate oracle proof. Every original tmux
smoke stays registered through `full_tmux_step` for weekly or requested audits; originals are never
edited to manufacture harness parity.

**Mechanism:** The corpus feeds exact bytes into the same `TerminalEmulator` used by the harness and
asserts hand-authored expected grids, metadata, modes, write-boundary behavior, and recorded OpenTUI
streams. This specifies the common dependency deterministically; a statistical second-emulator sample
is no longer needed on every commit.

**Generates:** a blocking sub-second oracle proof in `bun test`; no tmux sentinel time or flake in the
normal gate; unchanged tmux originals available for explicit cross-stack audits.

**Rejected alternatives:** Keep four non-blocking tmux sentinels — a red non-verdict adds time and
indeterminism while the byte corpus states the expected result directly.

**Evidence:** `src/modules/terminal/TerminalEmulatorConformance.test.ts`;
`src/modules/terminal/terminal.invariants.md` `Terminal emulator behavior is specified by byte
fixtures`; `scripts/merge-gate.sh` has no `ring_step` and keeps tmux smokes behind
`full_tmux_step`.

**Impossible if true:** the normal merge gate launching a tmux smoke; an emulator change bypassing
the blocking byte corpus; deleting the original tmux audit paths.

**Verification:** `bun test src/modules/terminal/TerminalEmulatorConformance.test.ts && ! rg
"ring_step" scripts/merge-gate.sh && rg "full_tmux_step .*smoke: (wrap|git-log|agent-pane-ux|terminal)"
scripts/merge-gate.sh`

**Status:** established

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
condition or synchronized-output quiescence, never from a target frame ordinal. If it asserts a
visual outcome after an action, then a named grid condition first waits for the asserted content;
sampling after synchronized-output quiescence alone is not sufficient when the action can span
frames.

**Scope:** `PtyTestDriver`, every `scripts/harness/smoke-*-harness.ts` port, and shared harness
helpers. Frame counts may diagnose output volume, but they never identify the state a waiter expects.
A WAIT MUST BE A CONDITION, and three shapes fail that requirement, not just the frame-ordinal one:
(a) a target frame ordinal; (b) a predicate the PRE-ACTION state already satisfies — existence and type
checks like `typeof status.field === 'number'` or `field !== undefined`, since a field that exists before
the action still exists after it; (c) a fixed sleep between an action and an assertion, which is a wait
with no predicate at all. Legitimate exceptions, both narrow: at BOOT an existence check is a real
`undefined -> value` transition, and a short sleep INSIDE a polling loop that has its own deadline is
that loop's poll interval.

**Mechanism:** `PtyTestDriver.awaitGridCondition` flushes and checks the current emulator grid first,
then checks again after each future synchronized-frame completion event. `awaitQuiescence` waits on a
completion event associated with pending input, without calculating a target frame number. Harness
ports use `awaitGridCondition` on the visual assertion predicate before sampling the returned
snapshot.

**Generates:** already-satisfied fast paths; transition waits named for visible outcomes; timeout
errors containing the predicate description and final relevant grid region; frame coalescing and
zero-frame actions that cannot strand a condition already visible; visual assertions that cannot
race a later paint from the action they verify.

**Rejected alternatives:** Wait for frame N — repaint coalescing changes frame ordinals under load,
and an action whose target is already rendered may emit no frame.

**Evidence:** `scripts/harness/PtyTestDriver.ts`; the recorded-stream cases in
`scripts/harness/PtyTestDriver.test.ts`; `scripts/harness/smoke-goto-definition-harness.ts`;
`scripts/harness/smoke-agent-pane-ux-harness.ts`. The COST of the two shapes this record did not
originally forbid, measured 2026-07-25: both produced ~50% flakes that `retry-once-on-timeout` then hid,
so the gate reported green for a full day while degrading. `smoke-editor-harness` waited on
`typeof status.pendingCloseTab === 'number'`, which the "nothing pending" sentinel already satisfied —
sampling stale skipped a confirmation keystroke and then waited forever for a tab count that could not
drop (fixed: 6-of-6 green against 3 failures in 4 attempts). `smoke-pixel-preview` still carries fixed
sleeps of 250 ms and 750 ms and took a timeout retry under load 3.5. The principle here was already
correct; its impossibility set was too narrow to make either mistake unwritable, which is how a true
invariant with a thin negative space protects nothing.

**Impossible if true:** A transition timeout that names a target frame ordinal; a satisfied grid
predicate waiting for another frame; two coalesced invalidations requiring two completed frames; a
visual assertion sampling the grid after only status publication or output quiescence; a post-action
wait whose predicate the pre-action state already satisfied (so the wait returns immediately and the
next step races); a bare `Bun.sleep` standing between a drive and the assertion that verifies it.


**Verification:** `bun test scripts/harness/PtyTestDriver.test.ts
scripts/harness/SynchronizedOutputQuiescence.test.ts`

**Status:** established

**Last refined:** 2026-07-24

### Async-published state is always awaited

**Invariant:** If a harness verdict depends on state published asynchronously through the status
file, then the harness polls that file independently until its semantic predicate holds; it never
samples `readStatus` or `statusField` once after a grid wait, and a grid predicate never reads status.

**Scope:** Every `scripts/harness/smoke-*-harness.ts` semantic assertion. Values read from the
`HarnessStatus` or `StatusSnapshot` returned by a completed status wait are already awaited.

**Mechanism:** `HarnessSmoke.awaitStatus` and `HarnessSmoke.awaitStatusWithoutFrame` re-read status
while using frame arrival or bounded frame silence only as progress opportunities.
`HarnessSmokeSupport.awaitStatusPublication` polls every 5 milliseconds without depending on a
frame. Visual and semantic transitions are awaited separately, so a status-only publication cannot
strand a frame-driven predicate.

**Generates:** Polling status assertions; returned awaited snapshots for baselines; separate grid and
status waits when a transition has both visual and semantic outcomes.

**Rejected alternatives:** Read status once after a matching frame — status publication is
asynchronous and can lag that frame. Read status inside a grid predicate — a status-only publication
does not produce another frame to re-evaluate the predicate.

**Evidence:** `scripts/harness/HarnessSmoke.ts`; `scripts/harness/HarnessSmokeSupport.ts`; every
registered `scripts/harness/smoke-*-harness.ts` consumer.

**Impossible if true:** A smoke failing because the expected status was published just after its
one-time read; a status-only transition timing out because no later synchronized frame re-ran a grid
predicate.

**Verification:** Run a TypeScript AST walk over `scripts/harness/smoke-*.ts` and require zero
`readStatus` or `statusField` calls outside `awaitStatus` or `awaitStatusPublication` predicates and
zero such reads inside `awaitSnapshot` predicates; then run every registered harness smoke once.

**Status:** provisional

**Last refined:** 2026-07-25

### Every wait names itself

**Invariant:** If a harness condition wait can time out, then its caller supplies a description that
identifies the condition, and the timeout reports that description with the relevant status path or
grid region.

**Scope:** Status waits in `HarnessSmoke` and `HarnessSmokeSupport`, plus grid-condition waits in
`PtyTestDriver`. Quiescence and fixed-duration silence observations have no target condition and are
outside this rule.

**Mechanism:** `awaitStatus`, `awaitStatusWithoutFrame`, and `awaitStatusPublication` require a
description argument and throw `Timed out waiting for <description> at <path>`.
`PtyTestDriver.awaitGridCondition` already requires `predicateDescription` and includes it with the
final relevant grid region.

**Generates:** Field-specific status timeout messages; transition-specific grid timeout messages;
call sites whose awaited outcome is reviewable without opening the helper.

**Rejected alternatives:** Report only the status path or predicate text synthesized by a helper —
one file serves many unrelated waits, and generated function text is not a stable user-step name.

**Evidence:** `scripts/harness/HarnessSmoke.ts`; `scripts/harness/HarnessSmokeSupport.ts`;
`scripts/harness/PtyTestDriver.ts`; labeled calls in every registered harness smoke.

**Impossible if true:** `Timed out waiting for status publication at <path>` with no condition name;
two different waits in one smoke producing indistinguishable timeout headings; an empty grid
condition description.

**Verification:** TypeScript requires the description parameter at every status-wait call; run
`bun test scripts/harness/HarnessSmoke.test.ts` and a TypeScript AST walk that requires a non-empty
description argument at every status-wait call.

**Status:** provisional

**Last refined:** 2026-07-25

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

### Timing-sensitive gate jobs run in a quiet serial tail

**Invariant:** If a registered gate job measures latency, performance, frame absence, or momentum
timing, then it runs alone after the parallel-safe smoke pool has fully drained.

**Scope:** `scripts/merge-gate.sh`, `scripts/behavioral-contracts.sh`,
`scripts/perf-baselines.sh`, `scripts/harness/input-byte-flush-gate.ts`, every registered smoke
source containing `assertNoCompleteFrameEmittedFor` or `awaitFrameSilence`, and every registered
smoke with a momentum or glide assertion.

**Mechanism:** `parallel_safe_smoke` and `quiet_serial_smoke` form the explicit registry.
`run_parallel_smoke_pool` waits for every worker process before `run_quiet_serial_smokes`, the
input-byte-flush gate, and performance baselines begin.

**Generates:** A bounded worker pool for timing-insensitive smokes; a fully drained phase boundary;
serial absence, momentum, latency, and performance observations.

**Rejected alternatives:** Run absence assertions under shared load — a violating frame can arrive
after the observation window and make the assertion false-green.

**Evidence:** `scripts/merge-gate.sh`; `rg -l
"assertNoCompleteFrameEmittedFor|awaitFrameSilence|[Mm]omentum|glide"
scripts/behavioral-contracts.sh scripts/harness/smoke-*-harness.ts scripts/smoke-*.sh`.

**Impossible if true:** A parallel worker remaining live while a quiet-tail job starts; two
quiet-tail jobs overlapping; a smoke containing either absence-window method running in the
parallel-safe pool.

**Verification:** `bash -n scripts/merge-gate.sh && bash scripts/merge-gate.sh`

**Status:** provisional

**Last refined:** 2026-07-25
