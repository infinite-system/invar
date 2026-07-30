# Diagnostic instruments — optional tooling, and how to know it exists

These are NOT run by the merge gate. They are on-demand instruments for answering a specific
question with numbers instead of opinion. **This file exists because an instrument nobody knows about
is nobody's instrument** — three separate builders tonight rebuilt measurement machinery that already
existed. Before writing a new measurement script, look here first, and when you build one that
outlives its task, ADD IT HERE.

## When to reach for one

The rule that earned this file: **a structural read produces a hypothesis; only a measurement
produces a mechanism.** Four confident diagnoses were overturned by measurement in one night — a
"missing watcher" that was transitively tracked, a "bypassed momentum generator" that was a retired
test discriminator, a "narrowed code body" that was a stale log line, and a "scroll regression" that
was six commits of flat numbers. Reach for an instrument BEFORE briefing a cause.

## The instruments

### `bun .invar/tasks/in-progress/313-child-owns-its-io-bundle/313-child-io-diagnostic-probe.ts [columns] [rows]`
Real nested-child mouse and color fingerprint through `PtyTestDriver` and FrameProbe. The child
enables SGR mouse mode, paints default, ANSI, and truecolor controls, and records one real click.
`clickBytes=none` means Invar swallowed the click. Exact press and release bytes prove routing and
child-local coordinates. Each color line prints FrameProbe's four RGBA lanes for one child cell.
USE IT WHEN: changing terminal mouse routing, pane padding, terminal default colors, ANSI palette
mapping, or child-color isolation. Drive at 100×30 and 160×50 for geometry parity.
KNOWN RESULT (2026-07-29): before the child-cell route, both geometries printed `clickBytes=none`.
After the route, both print `ESC[<0;4;1M ESC[<0;4;1m`. Before color isolation, default foreground
and background were the dark Invar theme lanes `169,177,214,255` and `22,22,30,255`, while ANSI
white, ANSI black, and truecolor controls stayed exact.

### `bun .invar/tasks/*/282-scrollbar-drag-broken-and-horizontal-thickness/282-scrollbar-drag-history-probe.ts [repository-root] [line-count] [theme] [focus-click]`
Real PTY press-move-release fingerprints for the editor's horizontal and vertical thumbs and the
structure right-dock thumb. It builds a bounded fixture with 500 structure symbols and extends it
with comment rows for a requested document scale. Each sequence reports the starting scroll offset
and the offsets after three pressed-pointer moves. A growing sequence means the thumb handled every
move; a flat sequence means visible paint did not receive the gesture. The paint fingerprint counts
lower-half and full-block cells and lists their foreground colours. Pass another worktree as
`repository-root` to compare the same gesture across history.
USE IT WHEN: a scrollbar is visible but dragging feels inert, a pointer-order change may cover a
bar, or horizontal paint changes shape. Use 500 and 100000 lines for scale parity.
KNOWN RESULT (2026-07-29): commit `bb7ce7bb` moved the editor horizontal position
`0→13→11→25` and vertical position `0→48→97→145`; commit `ce748915` made both sequences flat.
The repaired 500-line path moves `0→23→47→70` and `0→48→97→145`; the 100,000-line path moves
`0→25→50→75` and `0→10341→20683→31024`.
Pass `filter-input` as the fourth argument to drive the structure filter on the same generated
fixture. It prints unselected-copy count, selected-copy count, and the text left by
Alt+Backspace. Compare 500 and 100000 lines for input scale parity without creating another
fixture generator.

### `bun scripts/harness/measure-scroll-smoothness.ts`
Per-frame glide behaviour on the real app through the PTY. Generates 2k, 26,635, and 100k-line
fixtures at run time (nothing large is committed), then measures both the bare editor and side-by-side
diff. Reports, per surface and gesture: moving frame count, total distance,
input-write-to-first-frame latency, max/mean frame delta, peak velocity, whole-glide fps,
sustained-fast fps, and bytes per frame. Reads the lowest visible fixture line out of every completed
synchronized frame, so each sample IS that frame's scrollTop with no publish race. Timing fields are
diagnostic; blocking consumers use ordering and counts. `SMOOTHNESS_LINE_COUNTS`,
`SMOOTHNESS_SURFACES`,
`SMOOTHNESS_FIXTURES` (`flat` / `fold-dense`), `SMOOTHNESS_CODE_FOLDING` (`on` / `off`),
`SMOOTHNESS_VERSION_CONTROL_MARKS` (`on` by default / `off` as an isolator),
`SMOOTHNESS_GESTURES`, and `SMOOTHNESS_NOTCHES` narrow or deepen an investigation. The nested-JSON
editor case initializes a repository by default and verifies that
version-control marks, indent guides, and fold controls are present together.
Every case also reports the applied-impulse count and visible row travel for
its one-notch preflight, including cap settings whose settled travel is zero.
`SMOOTHNESS_BURST_DURATIONS` switches to sustained-input measurement: it
reports completed-frame counts in each `SMOOTHNESS_BURST_WINDOW`, the gap
sequence, longest starvation, events sent, impulses applied, projection
passes, and rows travelled while `SMOOTHNESS_BURST_NOTCHES` keep arriving per
window. A 6 ms window with one notch requests an individual-event trackpad
burst above 150 events/second and measures about 144 events/second through the
loaded app; the older 100/200 ms multi-notch shapes are
batched PTY writes, not equivalent input-boundary pressure.
`SMOOTHNESS_REQUIRE_FRAME_PROGRESS=1` makes a zero-frame window fail.
`SMOOTHNESS_REQUIRE_INPUT_COALESCING=1` requires exact event-to-impulse
preservation, fewer projection passes than input events, and exact 2k/100k
row-travel parity within one maximum animation integration step on editor and
diff. The step bound is
`ceil(verticalFlingCeiling * maximumAnimationDeltaTimeSeconds)`, not
`ceil(verticalFlingCeiling / targetFramesPerSecond)`: target FPS is a cadence
goal, while Bootstrap permits a delayed integration step up to 100
milliseconds. Burst reports include the delivered input duration, per-frame
row-crossing sequence, and maximum row crossing. Continuation probes place
their follow-on input after observed live one-row motion beyond a declared
moving-frame count; the delivered delay is reported but never controls
placement.
For flat editor runs, it also reports cumulative document-line reads,
fold/wrap projection lookups, and layout computations. The behavioral
contract drives the same gesture at 2k and 100k lines and compares the
integer counts per attributed frame by exact rational equality. One diff and
one fold-dense editor FPS floor remain secondary report-only wall-clock
canaries. The
fold-dense checkpoint keeps folding, indent guides, and version-control
gutter marks on, direct-jumps to line 75,000, settles on observed scroll state
and frame quiescence, excludes jump frames, and measures a fresh 1,000-row
real wheel drive.
USE IT WHEN: scrolling "feels" wrong. It distinguishes the two failures that feel identical —
choppiness (few frames, big steps) from low velocity (fewer rows for the same gesture).
KNOWN RESULTS: before the 2026-07-26 cadence and gesture-gain repair, a fling ran 19-23 whole-glide
fps and the same gesture yielded ~48 rows from idle but ~36 after a previous fling. The scale
investigation then found fold lookup/filter rebuilds and a whole-document status join in editor
frames, plus whole-change-set ruler and active-block scans in diff frames. After caching/indexing
those document aggregates, the six-case 2k/26,635/100k editor+diff matrix sustains 29.8-32.4 FPS;
100k editor and diff measured 29.8 and 31.5 FPS respectively.
The 2026-07-27 load-invariance contract measured 65 document-line reads, 33
fold lookups, two wrap lookups, and one layout computation per attributed
frame at both 2k and 100k lines: every ratio was exactly 1. Its planted
one-read-per-100-lines loop failed at ratio 12.395349.
The 2026-07-26 fold-density axis found 26k/100k flat text at about 30 FPS but nested JSON at
13.5-13.7 FPS, unchanged when folding or indent guides were disabled. Temporary frame attribution
named `BracketMatch.findInDocument`: the cursor on the root `{` rescanned and syntax-classified up
to 100,000 cells per frame. Its revision/cursor/language snapshot restored the 26k nested case to
30.1-30.3 FPS with folding both on and off.
The depth-sampled follow-up measured the 100k flat fixture at
30.0/30.0/30.0 FPS and the fold-dense fixture, with indent guides and
version-control gutter marks enabled, at 30.0/30.0/30.0 FPS for depths
0/50k/75k. Every drive travelled 1,000-1,006 rows; the lowest depth-zero ratio
was 0.998.
The 2026-07-27 sustained-input probe found no seconds-long freeze: all
200-millisecond windows emitted frames on fold-dense editor and diff surfaces
at 2k and 100k. One-, three-, and five-second bursts did not develop growing
starvation.
CAUTION: send a gesture as ONE PTY write. Split across 12 writes the identical gesture lands on one
of three quantized outcomes ±35%, because the chunk boundary decides whether one physical gesture
straddles input frames. Whole-glide fps includes the slow tail, where sub-two-row movement naturally
produces unchanged render ticks on a cell grid; use sustained-fast fps for renderer cadence.

### `bun scripts/harness/measure-completion-list-latency.ts`
Keystroke-to-visible and wheel-to-visible latency for the completion popup at 10 / 1,000 / 5,000
items, plus provider request counts and popup match-preparation counts.
USE IT WHEN: a list feels slow, or when changing popup filtering/painting.
KNOWN RESULTS: key latency ~14 ms and wheel ~85 ms, both FLAT in item count. The counts are the part
people forget — they prove zero language-server requests and zero re-filters during movement.

### `bun scripts/harness/measure-editor-edit-path.ts`
Mid-document single-character insertion cost through the cumulative
document-line-to-visual-row index at 2k / 20k / 100k / 500k lines, with word
wrap both off and on. It reports every ordered sample, separates
`TextDocument.setLine` mutation time from `EditorWrap` sync time, and records
the 1 / 5 / 15-minute load averages beside each number. The entry point
requires an acquired machine-wide quiet lock and refuses to publish
measurements after lock degradation. Its positive control supplies a fresh,
out-of-document fold range on every edit: the projection is unchanged, but
the existing folded-range identity guard must take the full-rebuild branch,
and the control fails unless every forced sync is slower than every
incremental sync. A second control restores the sole widest line to the
shared fixture width and requires that forced maximum-width rescan mutation
to be slower than every incremental 20k mutation. The same run measures
visual-row-count hit rates over uniform line-length phases, exact wrap
boundaries, and mid-row controls. Its operational counter also drives
collapse and expansion of the shared 138,621-line body at both nested-fixture
sizes.
USE IT WHEN: considering a change to `EditorWrap.syncWrapIndex` or claiming
that cumulative-index edit work is user-visible.
KNOWN RESULT (2026-07-28): incremental sync was 1.327–3.763 ms at 100k
lines and 6.837–9.124 ms at 500k. The 20k positive control moved
0.342–0.685 ms incremental syncs to 51.284–53.824 ms forced full rebuilds.
Uniform wrap phases changed row count on 4/320 insertions (1.25%); exact
boundaries changed on 4/4 and mid-row controls on 0/4. The same run exposed a
separate `TextDocument` maximum-width-champion rescan. After replacements
could inherit that championship before a rescan, 500k mutation measured
0.007–0.045 ms and sync measured 7.015–11.488 ms; the 20k mutation control
forced the legitimate shrink/rescan path to 4.272–4.496 ms.
The nested fold-toggle counter measured identical collapse and expansion at
554,490 and 970,356 lines: 138,621 visible-line writes, 138,621 row writes,
34 block writes, and zero index-array allocations.
CAUTION: the named boundary ends when `totalVisualRows` returns. It excludes
PTY input, undo capture, reactive painting, and terminal output; use the
input-byte-flush instrument for keypress-to-frame claims.

### `INPUT_BYTE_FLUSH_MODE=scale-edit bun scripts/harness/measure-input-byte-flush.ts`
Editing-input-write to the first complete DEC 2026 frame visibly containing
that cumulative edit, through the real app and PTY at 2k / 20k / 100k / 500k
/ 1M lines. It types 30-character bursts in the middle and, at 500k/1M, at
the shared widest-line champion; reports every ordered sample, launch to
first content, frames until edit, and launch-to-first-content peak resident
memory (sampled before excluded target navigation). Every edit sample carries
its contemporaneous 1 / 5 / 15-minute load averages. Set
`INPUT_BYTE_FLUSH_REPOSITORY_ROOT` to launch another worktree through the same
instrument when interleaving before/after arms. It
requires the quiet lock, refuses any live `tsgo`, and forces the former
full-wrap-index rebuild at 500k as a positive control that must move the
median by at least 10x.
USE IT WHEN: claiming that large-file editing feels scale-independent, or
changing input, undo, document-index, reactive paint, or frame-emission work.
CAUTION: the boundary excludes fixture generation, target navigation, save,
terminal display after bytes reach the PTY master, and language-server work
(the isolated fixture sets a 1 KB suppression limit). The component
`measure-editor-edit-path.ts` does not answer this end-to-end question.
KNOWN RESULT (2026-07-28): the interleaved `b11100a`/`2dff07b` comparison
found no settled flat typing regression at 1M (middle p50 8.069/7.861 ms,
widest-line p50 9.066/8.418 ms), but found an eager fold-discovery load
regression: first paint 634–636 ms became 2,417–2,526 ms and peak RSS
704–708 MB became 1.28–1.31 GB. The load-invariant currency was gutter
document reads: 30 at both 2k and 1M before, versus 4,000 and 2,000,000 after.
Sparse observed-range discovery restored 30 reads, 1M first paint to
645–649 ms, and peak RSS to 665–666 MB while retaining 23 ms nested collapse.

### `INPUT_BYTE_FLUSH_MODE=nested-fold-edit bun scripts/harness/measure-input-byte-flush.ts`
The same editing-input-write to first complete DEC 2026 frame boundary across
the shared 554,490- and 970,356-line nested JSON fixtures, both unfolded and
with the 138,622-line first top-level group collapsed. Every ordered latency
sample carries the contemporaneous 1 / 5 / 15-minute load averages. Its
positive control preloads the removed per-revision full document rebuild and
requires that defect to move the 554,490-line folded median by at least 10x.
Folded sessions also measure collapse and expansion from the first chord byte
to the first complete frame showing the requested state.
USE IT WHEN: changing fold snapshot identity, the fold projection, or the
folded cumulative wrap index and claiming the real editing path stays flat.
CAUTION: initial file load and fold toggles are excluded from the editing
latency boundary; toggles use their separately named chord-to-frame boundary.
The component instrument separately reports the typed visible-line
identity-fill duration and its share of alternating fold-toggle time. The app
and PTY path itself is real.

### `INVAR_REAL_CODEX_INLINE_REWRITE=1 bun scripts/harness/measure-inline-rewrite-codex.ts`
One billed, real-Codex inline-rewrite drive through the PTY. It reports request-now-chord-to-visible
latency and writes `artifacts/inline-rewrite-codex-latency.json`. A 350 ms mock run happens first as
the positive control: the instrument refuses to trust a latency meter that cannot observe that known
delay.
USE IT WHEN: changing the rewrite prompt, Codex CLI flags, model choice, cancellation, or proposal
arrival plumbing. It proves the installed Codex CLI reaches the same provider-neutral editor path as
the gate's deterministic mock.
KNOWN RESULT (2026-07-26): Spark at low effort produced a visible proposal in 5,439.8 ms from the
request-now chord; the injected 350 ms positive control measured 1,607.9 ms over the same full-app
boundary.
CAUTION: it consumes Codex quota and can take up to three minutes. It is deliberately opt-in and is
never registered in the merge gate.

### `bun scripts/report-graphics-capabilities.ts`
What OpenTUI reports about the CURRENT terminal, the tier Invar derives from it, and — critically —
whether any capability reply arrived at all. Writes `/tmp/invar-graphics-report.txt` as well as
printing, because the renderer's teardown restores the screen and erases anything printed inside it.
USE IT WHEN: images render at the wrong tier. Silence and a negative answer are different failures
with different fixes, and only this distinguishes them.
CAUTION: capabilities belong to the LIVE terminal. Running it in a different shell than the one with
the problem answers a different question.

### `bun .invar/tasks/in-progress/339-demo-supersampled-graphics-tier-resolution/339-software-scene-resolution-measurement.ts`
Per-frame `SoftwareScene.render` cost for cube and torus at the current 1×2-pixel cell grid and at
2×, 4×, and 8× supersampling. It measures a 100×24-cell pane, prints 20 samples after five warmup
frames, and reports mean, median, p95, maximum, and fit against the current 15 FPS budget.
USE IT WHEN: changing the software renderer, its framebuffer resolution, or the demo frame rate.
KNOWN RESULT (2026-07-30): 8× renders 800×384 pixels. Cube p95 was 25.002 ms. Torus p95 was
27.770 ms. Both fit the 66.667 ms frame budget.

### `bun scripts/check-reactive-observation.ts`
AST census of live `Ref` reads, `shallowRef` payload reads, `Reactive()` classes and version-signalled
plain fields, plus three report-only categories for construction-captured or module-scope reactive
reads. Refuses to run unless its positive-control fixture flags every category.
USE IT WHEN: a value looks stale, or after moving state between owners.

### `bash scripts/perf-baselines.sh`
On-demand memory, idle CPU, lifecycle, startup, and input-latency report. The
script takes the machine-wide quiet lock itself and records target misses
without making them blocking verdicts. It is deliberately outside
`scripts/merge-gate.sh`: its results are soft, while the corresponding
load-bearing idle and input-ordering contracts remain in the blocking gate.
USE IT WHEN: changing resource lifetime, startup, rendering, or input-path
costs, and in scheduled nightly performance runs.

### `bun scripts/check-coverage-ratchet.ts` · `bun scripts/check-harness-wait-observation.ts`
Gate checkers, but runnable alone while iterating. The ratchet verifies DECLARED counts against
actual ones, so run it before assuming a decrease is disclosed.

## The rule every instrument here obeys

**A check that can only fail toward "pass" is a decoration.** Each of these has a positive control —
a known-bad input it must flag before its silence about real input is trusted. That rule was written
after a gate guard called `rg` (not installed), swallowed the error, and printed OK for 14 runs while
inspecting nothing; the same defect was later found in a second script. If you add an instrument here,
add its control.

## `scripts/harness/stress-openpty-descriptors.ts` — does a PTY descriptor get stolen?

**Question it answers:** are `OpenPty` instances corrupting each other's file descriptors? Keeps a
window of instances alive, disposes the oldest while constructing a new one, and requires every
survivor's descriptor to still be usable.

`bun scripts/harness/stress-openpty-descriptors.ts <treeRoot> [rounds] [liveCount]`

**Known results (2026-07-26, Bun 1.3.14 Linux arm64).** Against the unfixed tree: **8 failures in
400 rounds** — `F_SETFL errno 9`, `F_GETFL errno 9`, and one `openpty failed (result=-1)`. After
giving the read stream a private `dup()`: **0 in 400 and 0 in 800.**

**Why it is an instrument and not a gate test:** detection is PROBABILISTIC — roughly 2% of rounds
hit on broken code, so a short run can pass while the defect is present. A gate test with that
property could only fail toward "pass", which is the decoration class. Run it deliberately when
touching descriptor lifetime, and read the COUNT rather than the exit code.

**Gotcha:** the victim is a *different* instance than the one being disposed, so a probe that
constructs and closes one instance at a time finds nothing. The overlap is the whole experiment —
`liveCount` must stay above 1. It takes `<treeRoot>` so the same probe can measure two trees
back to back, which is how the before/after pair above was produced.
