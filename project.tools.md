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

### `bun scripts/harness/measure-scroll-smoothness.ts`
Per-frame glide behaviour on the real app through the PTY. Generates 2k, 26,635, and 100k-line
fixtures at run time (nothing large is committed), then measures both the bare editor and side-by-side
diff. Reports, per surface and gesture: moving frame count, total distance,
input-write-to-first-frame latency, max/mean frame delta, peak velocity, whole-glide fps,
sustained-fast fps, and bytes per frame. Reads the lowest visible fixture line out of every completed
synchronized frame, so each sample IS that frame's scrollTop with no publish race. Runs under the
machine-wide quiet-exclusive lock. `SMOOTHNESS_LINE_COUNTS`, `SMOOTHNESS_SURFACES`,
`SMOOTHNESS_FIXTURES` (`flat` / `fold-dense`), `SMOOTHNESS_CODE_FOLDING` (`on` / `off`),
`SMOOTHNESS_VERSION_CONTROL_MARKS` (`on` by default / `off` as an isolator),
`SMOOTHNESS_GESTURES`, and `SMOOTHNESS_NOTCHES` narrow or deepen an investigation. The nested-JSON
editor case initializes a repository by default and verifies that
version-control marks, indent guides, and fold controls are present together.
The behavioral contract takes the flat 100k editor's top-of-file cadence as
the current-run reference, then supplies it through
`SMOOTHNESS_DEPTH_REFERENCE_FPS` to one fold-dense checkpoint. That checkpoint
keeps folding, indent guides, and version-control gutter marks on,
direct-jumps to line 75,000, settles on observed scroll state and frame
quiescence, excludes jump frames, and measures a fresh 1,000-row real wheel
drive. The report gives actual start, rows travelled, FPS, and ratio to the
flat 100k top cadence, and fails the checkpoint below 28 FPS.
USE IT WHEN: scrolling "feels" wrong. It distinguishes the two failures that feel identical —
choppiness (few frames, big steps) from low velocity (fewer rows for the same gesture).
KNOWN RESULTS: before the 2026-07-26 cadence and gesture-gain repair, a fling ran 19-23 whole-glide
fps and the same gesture yielded ~48 rows from idle but ~36 after a previous fling. The scale
investigation then found fold lookup/filter rebuilds and a whole-document status join in editor
frames, plus whole-change-set ruler and active-block scans in diff frames. After caching/indexing
those document aggregates, the six-case 2k/26,635/100k editor+diff matrix sustains 29.8-32.4 FPS;
100k editor and diff measured 29.8 and 31.5 FPS respectively.
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

### `bun scripts/check-reactive-observation.ts`
AST census of live `Ref` reads, `shallowRef` payload reads, `Reactive()` classes and version-signalled
plain fields, plus three report-only categories for construction-captured or module-scope reactive
reads. Refuses to run unless its positive-control fixture flags every category.
USE IT WHEN: a value looks stale, or after moving state between owners.

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
