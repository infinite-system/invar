# READY #90: the test-isolation census, and a per-run diagnostic log with a provenance guard

State: READY
Engine: claude (opus-5)
Branch: `fleet/90-harness-diagnostic-provenance-guard`
Commit: `ffe98e9d` (branch only, not pushed)
Gate: `GATE_EXIT=0` on attempt 1, tree clean

## The task numbers this report uses

Each number is named once here, so later mentions are handles and not lookups.

| number | what it is |
|---|---|
| #90 | harness diagnostic provenance guard and the test-isolation census (this task) |
| #337 | plugin-manifest structure scrollbar settled-geometry intermittent, which measured the defect |
| #244 | the SDK leak that filled the disk twice, cited for the filesystem-watch rule |
| #214 | panel-chrome, a pre-existing gate flake named by the brief |
| #359 | panel-split starvation, a pre-existing gate flake named by the brief |
| #362 | markdown preview clipping, a pre-existing gate flake named by the brief |

## Verdict in one paragraph

The census found ONE shared write that can flip a gate verdict, and it is the one the brief
named: `artifacts/tui.log`. Every other shared path in the verification surface is either
isolated in practice, shared on purpose and excluded by contract, or shared but report-only.
The tui.log defect reproduced on the first attempt in all three of its shapes: a line planted
before any boot satisfied the reader, a line planted during a run replaced the reader's answer,
and two concurrent boots interleaved six indistinguishable geometry lines under two `Boot start`
markers in one slice. The fix gives each run its own log path AND stamps every line with a
writing-instance identity, then reads through one guarded seam. Both halves are needed: the path
stops the interleaving, the identity lets a reader reject a leftover the path cannot prevent.

## 1. Reproduce by driving

Two real Invar instances, booted concurrently from this working tree with `TUI_DEBUG_BARS=1`,
each opening its own overflowing document. One stale line was planted BEFORE either boot. One
foreign line was planted DURING the run. The reader rule applied is the one that shipped: the
last line of `artifacts/tui.log` containing `bar editor-scrollbar-v:`.

```
STALE-BEFORE-BOOT legacy reader returns:
  2026-07-30T13:26:04.808Z [info] bar editor-scrollbar-v: scrollSize=777777 ...
shared file: 26 lines, 2 'Boot start' markers
plugin-manifest rule slice (last 'Boot start' onward): 4 bar lines
lines carrying an instance identity: 0
PLANT legacy reader returns:
  2026-07-30T13:26:05.147Z [info] bar editor-scrollbar-v: scrollSize=999999 ...
```

The file itself is the whole argument. Six real geometry lines from two instances, in one slice,
with nothing to tell them apart:

```
13:26:05.003Z [info] Boot start                       <- the second instance
13:26:05.131Z bar editor-scrollbar-v: ... laidH=1     <- which instance?
13:26:05.135Z bar editor-scrollbar-v: ... laidH=22
13:26:05.137Z bar editor-scrollbar-v: ... laidH=22
13:26:05.143Z bar editor-scrollbar-v: ... laidH=1     <- which instance?
13:26:05.147Z bar editor-scrollbar-v: ... laidH=22
13:26:05.149Z bar editor-scrollbar-v: ... laidH=22
```

Both polarities are present in that one capture, and they are opposite failures:

- **False green.** The stale `777777` line satisfied the reader before any application had
  started. A wait of the shape `height > 1` reading the last line can be satisfied by a value no
  live instance ever published.
- **False red.** Line `13:26:05.143` is an unsettled `laidH=1` sitting AFTER a settled `laidH=22`.
  If those two lines belong to different instances, the reader of the settled instance is dragged
  back to an unsettled value it never produced, and its wait cannot progress. This is the exact
  shape #337 recorded as its remaining hypothesis for the `#335`, `#339`, and `#342` sightings.

The plugin-manifest reader sliced the file at the LAST `Boot start`. The capture shows two such
markers 7 milliseconds apart, so a concurrent boot moves the slice boundary. That reader's own
instance can end up entirely above its own slice.

## 2. The census

Method: [census-90-shared-mutable-paths.ts](census-90-shared-mutable-paths.ts)
scans every `.ts` and `.sh` file under `scripts/` and `src/` for path expressions that carry no
per-run token, then each hit is judged by hand for its reader and its verdict power. The script
has a self-test, which is its positive control: every rule must report a known shared example and
must stay silent on a known per-run example. A rule that can only pass is not an instrument.

```
$ bun .../census-90-shared-mutable-paths.ts --self-test
SELF-TEST PASS  fixed-tmp-path reports a shared path (/tmp/invar-shared-report.txt)
SELF-TEST PASS  fixed-tmp-path stays silent on a per-run path
... (10 checks, 5 rules x 2 polarities)
census-90 self-test: every rule can report and can stay silent

$ bun .../census-90-shared-mutable-paths.ts
  fixed-tmp-path: 17
  fixed-tmp-name-without-a-disk-verb: 80
  repository-relative-artifact: 3
  repository-relative-history: 1
  fixed-network-port: 0
shared path expressions: 100 (over 806 scanned files)
```

The `fixed-tmp-name-without-a-disk-verb` bucket is deliberately separate and is NOT a finding:
79 of its 80 hits are `*.test.ts` in-memory document identifiers (`document.loadFromText(text,
'/tmp/observed.ts')`) or argument-vector fixtures, which no process writes. The bucket exists so
that this judgement is visible and countable instead of being silently dropped by a filter.

### The table

Verdict power is stated as observed, not as assumed.

| path | who writes | who reads | isolated? | can pollution flip a verdict? |
|---|---|---|---|---|
| `artifacts/tui.log` | every Invar process, through `Logging` (`Bootstrap` boot lines; `ScrollbarSync` and `DiffView` under `TUI_DEBUG_BARS`) | `smoke-scrollbars-harness.ts`, `smoke-plugin-manifest-harness.ts` | **was SHARED per working tree; now per-run and identity-stamped** | **YES, both polarities, measured. FIXED in this task** |
| `artifacts/status.json` (default) | the app when `TUI_OBSERVE=1` and no `TUI_STATUS_PATH` | nothing reads it without an explicit path | isolated in practice: `PtyTestDriver` drops inherited `TUI_STATUS_PATH` and `TUI_OBSERVE`, every harness smoke declares its own path under its own `mkdtemp` home, and `tui-harness.sh` uses `artifacts/status-<session>.json` with pid-scoped session names | no. No registered smoke can reach the default |
| `artifacts/frame.json` (default) | the app when `TUI_FRAME_DUMP=1` and no `TUI_FRAME_PATH` | no gate step | shared, and the file is TRACKED (`.gitignore` re-admits it) | no gate reader. A developer run overwrites a tracked file, which a later `git add -A` can carry into a commit. Report-only, NOT FIXED |
| `.perf-history/input-byte-flush.ndjson` | `input-byte-flush-gate.ts`, per worktree | `InputByteFlushTrend` in the same script | shared between two concurrent gates in ONE worktree | no. Verified by reading the script: the trend result reaches `console.warn` only, and no `process.exit` depends on it. Pollution produces a false warning or hides a true one |
| `.perf-history/gate-retries.ndjson` | `merge-gate.sh`, per worktree | the `RETRY TALLY` line, and humans | shared between two concurrent gates in ONE worktree | no. #337 recorded 7 records for 5 gates after a stray concurrent gate. Report-only |
| `/tmp/invar-quiet.lock`, `/tmp/invar-quiet-lock.journal` | `quiet-lock.sh`, machine-wide | `perf-baselines.sh` | shared BY DESIGN | excluded by contract. *Soft duration reports use a machine-wide quiet lock* forbids any blocking step from acquiring or waiting for it |
| `/tmp/merge-gate-binary-build/iv` | the binary-build step of EVERY gate on the machine | nobody; the verdict is the build exit code | **shared across worktrees** | not observed. 5 concurrent pairs, both exit codes 0 every time. See the honesty note below |
| `/tmp/merge-gate-failures` | every gate on the machine, as a symlink to its own failure directory | humans and agents diagnosing a red | shared across worktrees | no verdict. It can point a diagnosis at the wrong gate's logs. Report-only |
| `/tmp/merge-gate.<root-slug>.pid` | `merge-gate.sh`, `stop-merge-gate.sh` | the same | keyed by the gate root, so per worktree | no |
| `/tmp/ivue-cart-dark.png` | nothing in this repository | `smoke-image-preview.sh`, `smoke-pixel-preview.sh`, and both harness twins | shared read-only INPUT | a run cannot pollute it. An external overwrite or deletion turns every image smoke red at once. Both smokes assert its existence first, so the failure is named. Report-only |
| `$ROOT/artifacts/home` | any direct `scripts/tui-harness.sh launch` with no `INVAR_HARNESS_HOME` | the next such launch, through a persisted `settings.json` | `behavioral-contracts.sh` exports a run-scoped `INVAR_HARNESS_HOME`, so the gate path IS isolated | yes for a direct manual launch, and this already happened once: `smoke-voice-picker.sh:19` records the prior false result. Not gate-reachable. Report-only, legacy tmux tier |
| `/tmp/fleet-watch-gates`, `/tmp/fleet-watch.heartbeat`, `/tmp/fleet-watch-report-*.seen` | fleet tooling | `fleet-watch.sh`, `dispatch.sh`, `tasks-status.ts` | machine-wide by design | no gate verdict. Conductor tooling |
| `/tmp/invar-graphics-report.txt`, `/tmp/invar-terminal-observer-fixture` | `report-graphics-capabilities.ts`, `record-terminal-observer-fixture.ts` | the same, on demand | fixed names, shared | neither runs in the gate. Two concurrent invocations would overwrite each other. Report-only |
| every smoke fixture root, HOME, status path, frame path, raw log | each smoke | itself | per run: `mkdtemp`, `mktemp -d`, or `$$` in every case found | no |
| fifos, sockets, ports | `FfmpegVideoSource` creates one fifo | itself | the fifo lives under a `mkdtemp` directory | no. The census `fixed-network-port` rule reports 0 hits, so this repository binds no fixed port |

Two classes the brief listed and the census found EMPTY, stated so the negative is on the record:
there is no fixed port and no fixed socket anywhere in `scripts/` or `src/`, and every smoke HOME
in the PTY tier is `mkdtemp`-allocated. The only shared-HOME survivor is the legacy tmux
fallback in the table above.

**Honesty note on the binary-build row.** The five concurrent pairs all exited 0, so I record a
bounded negative result and not a proof. I could not build a positive control for that check: the
one I tried, an unwritable outfile, was refused by the sandbox. A check with no demonstrated red
is not an instrument, so this row says "not observed", never "safe".

## 3. The fix

Three files carry it, and the two halves are separate on purpose.

**Half one, isolation.** [src/modules/system/Logging.ts](../../../../src/modules/system/Logging.ts) now resolves its path from
`TUI_LOG_PATH` and keeps `artifacts/tui.log` only as the default. [scripts/harness/PtyTestDriver.ts](../../../../scripts/harness/PtyTestDriver.ts)
allocates that path inside the run's own home (or its own `mkdtemp` directory when a smoke
supplies no home), and drops `TUI_LOG_PATH` and `TUI_LOG_INSTANCE` when they arrive from the
caller's environment, exactly as it already drops `TUI_STATUS_PATH`. This is the same treatment
the homes already had, so the log now travels with the home instead of beside it.

**Half two, provenance.** `Logging` stamps every line with a writing-instance identity, declared
through `TUI_LOG_INSTANCE` or generated per process from the pid and four random bytes:

```
2026-07-30T13:47:02.118Z [info] [instance=harness-f46307506577] bar editor-scrollbar-v: ...
```

Isolation alone would not have been enough. A per-run path does not stop a LEFTOVER: the smoke's
own file can already hold lines when it is reused, and the pre-task log in any developer tree
holds thousands of unstamped ones. The identity is what makes a leftover rejectable.

**The reader seam.** [scripts/harness/DiagnosticLog.ts](../../../../scripts/harness/DiagnosticLog.ts) is the one place a harness reads that
log. `read` returns the instance's own lines and a count of everything it rejected;
`latestLineContaining` answers from the instance's own lines or answers null. It never answers
with a foreign value.

Both readers migrated. In [scripts/harness/smoke-plugin-manifest-harness.ts](../../../../scripts/harness/smoke-plugin-manifest-harness.ts) the `Boot start`
slice is GONE, because the capture in section 1 shows a concurrent boot moves that marker; the
instance identity supersedes it and is exact. In [scripts/harness/smoke-scrollbars-harness.ts](../../../../scripts/harness/smoke-scrollbars-harness.ts)
the `repositoryRoot` argument threaded through `collectVerticalThumbFrames` is gone too, because
the log path no longer derives from the repository root.

No product behaviour changed. `Logging.write` still swallows every IO error, so *Observability
never crashes the app* is untouched.

## 4. Positive controls

Four, at three levels, and each one has been seen RED.

**Control 1: the guard, planted foreign line.** [scripts/harness/DiagnosticLog.test.ts](../../../../scripts/harness/DiagnosticLog.test.ts) plants a
concurrent instance's line as the NEWEST match, and separately plants an unstamped leftover as
the newest match. Both must be rejected, and a log holding only foreign lines must answer null.

**Control 1 seen red.** I removed the identity filter (`if (line.includes(marker))` became
unconditional) and ran the file:

```
(fail) a concurrent instance line is rejected even when it is the newest match
(fail) an unstamped leftover line is rejected
(fail) a log holding only foreign lines answers null, never a foreign value
   Received: "2026-07-29T00:00:00.000Z [info] bar editor-scrollbar-v: scrollSize=777777"
 2 pass, 3 fail
```

The filter was restored immediately. The received value is the point: with the guard gone, the
reader returns the planted number.

**Control 2: the driven probe.**
[probe-90-diagnostic-log-provenance.ts](probe-90-diagnostic-log-provenance.ts)
boots two real instances concurrently through the real PTY, drives each to an overflowing
document, then plants both kinds of foreign line inside the FIRST instance's own file:

```
  first  harness-f46307506577 -> /tmp/probe-90-first-home-X3fEsp/tui.log
  second harness-fd70c661e7dd -> /tmp/probe-90-second-home-ubOD2e/tui.log
PASS  two concurrent instances own two log paths
PASS  two concurrent instances publish two identities
PASS  the shared .../artifacts/tui.log gained no byte from either instance
PASS  the first instance publishes 13 own line(s)
PASS  the second instance publishes 13 own line(s)
PASS  neither isolated log holds a foreign line before the plant
PASS  the first instance publishes its own vertical scrollbar geometry
PASS  positive control: both planted lines really are in the file
PASS  the guard counts both planted lines as foreign (2)
PASS  the planted lines do not change the answer the reader gives
PASS  no planted value reaches the reader
probe-90: all checks pass
```

Two of those checks exist only to keep the probe honest. "both planted lines really are in the
file" fails if the plant silently wrote nothing, and "the shared artifacts/tui.log gained no
byte" is a size comparison across the whole run, not an absence of a string.

**Control 3: the census self-test**, quoted in section 2. Ten checks, five rules, both polarities
each.

**Control 4: the real smokes.** Both readers were driven end to end on the fixed tree.

```
scripts/harness/smoke-scrollbars-harness.ts   131 PASS  ALL-PASS  EXIT=0
  wrap-off viewportRows 20, totalRows 502, 69 scroll positions
  wrap-on  viewportRows 20, totalRows 504, 69 scroll positions
  diff     viewportRows 20, totalRows 501, 72 scroll positions
scripts/smoke-plugin-manifest.sh               58 PASS  EXIT=0
  the overflowing structure outline publishes right-dock scrollbar geometry
  the overflowing structure outline projects a live right-dock scrollbar
```

The wrap-off `502` and wrap-on `504` totals are worth naming: those are the two values this
task's own outline recorded as MIXING between parallel copies of the scrollbars smoke. They now
come from each instance's own file.

## 5. Gate chain

**`GATE_EXIT=0`. Commit `ffe98e9d`. Tree clean. Branch not pushed.**

```
merge-gate: ALL-PASS
GATE_EXIT=0
pre-commit: merge-gate GREEN — commit allowed.
COMMIT_EXIT=0
merge-gate timing: total 3m43s
```

The commit ran the pre-commit hook, which runs the full `scripts/merge-gate.sh`. I never ran
`merge-gate.sh` by hand and never used `SKIP_GATE`. The green came on the first attempt. The
`GATE_EXIT=0` line above is read from the gate's own log, not from a wrapper's exit code.

The two steps that exercise this change:

```
merge-gate timing:    2. 0m24.861s — smoke: scrollbars harness        OK
merge-gate timing: serial step 1m50.657s — behavioral-contracts       OK
```

`behavioral-contracts` is the step that runs the plugin-manifest drive. `PtyTestDriver` is a
shared seam, so *Shared seam changes verify every consumer* required the whole registered set:
the parallel pool ran 65 jobs on 6 workers and every registered `smoke-*-harness.ts` passed.

**One retry, a pre-existing class.**

```
RETRY TALLY: 1 step(s) PASSED ONLY ON RETRY
RETRY TALLY:   smoke: panel-split harness
```

That is #359 (panel-split starvation), which the brief names as a known pre-existing flake. It is
off-diff: `smoke-panel-split-harness.ts` reads no diagnostic log and imports nothing this change
touched. Named as the brief instructs, not chased. #214 (panel-chrome) and #362 (markdown preview
clipping) did not appear.

Verification also run by hand, once each:

```
bunx tsc --noEmit                                                   TSC=0
bun test                                                            2048 pass, 0 fail
node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs
  1219 annotation(s) resolved, 223 lattice link(s) resolved, 0 problem(s)
bash scripts/conventions-gate.sh                                    PASS
bun run drive --size 10                                             exit 0
```

The annotation count rose from #337's 1217 to 1219. Both new resolutions are mine: the
`PtyTestDriver` constructor and `DiagnosticLog.ts` each cite *Harness app homes are complete and
isolated*, the record this commit extended.

**A correction worth recording.** My first commit attempt passed `-c core.hooksPath=.githooks`,
a directory that does not exist, which silently DISABLED the hook. The commit landed with no gate
at all. I reset it (`git reset --soft HEAD~1`) and re-committed through the real hook, which is
the run quoted above. A wrapper flag that turns the gate off without saying so is the same class
as reading a wrapper's exit code instead of the gate's own verdict.

## 6. Invariants in scope, record by record

### [scripts/harness/harness.invariants.md](../../../../scripts/harness/harness.invariants.md)

| record | verdict |
|---|---|
| Synchronized end markers bound complete frames | upheld, untouched |
| Declared harness geometry reaches Invar | not in scope (tmux ring), untouched |
| Harness app homes are complete and isolated | **was incomplete; REFINED in this commit** (below) |
| Harness teardown bypasses product quit confirmation only when declared | upheld. The new environment variables are set before a smoke's own overrides, in the same block |
| Harness input and output use the real PTY | upheld. Nothing moved into or out of the PTY |
| Latency measurements name their observation boundary | upheld, untouched |
| The terminal emulator is the harness screen oracle | **needs refinement, wording proposed** (below). Not edited |
| Harness output history stays bounded | upheld, untouched |
| The conformance corpus replaces the tmux ring | upheld, untouched |
| Smoke boots do not extract agent binaries | upheld. It is the model this task copied: it refuses to count a shared `/tmp` population and isolates instead |
| Input byte latency uses a reviewed gate baseline | upheld. Its `.perf-history` appender is in the census as report-only |
| Harness waits observe conditions not frame ordinals | upheld, and it is the record this defect sits BESIDE (below) |
| Drive clicks resolve from roles and text | upheld, untouched |
| Drive settled observations include declared debounced work | upheld, untouched |
| Async-published state is always awaited | upheld. The diagnostic log is a third asynchronous source and this record does not cover it (below) |
| Every wait names itself | upheld. Both migrated waits keep their descriptions unchanged |
| Shared seam changes verify every consumer | **triggered, and satisfied.** `PtyTestDriver` is a shared seam and every registered consumer ran in the gate |
| Stable regions stay byte-identical across actions | upheld, untouched |
| Blocking gate verdicts use ordering and counts | upheld. No timeout widened, no duration threshold added |
| Soft duration reports use a machine-wide quiet lock | upheld. The census confirms the quiet lock is the one deliberate machine-wide shared path and that no blocking step touches it |

**Refined in this commit: Harness app homes are complete and isolated.** The record promised a
run "owns a fresh user home with config, data, state, and cache directories" and said nothing
about the diagnostic log, which the same run wrote to a repository-relative path every other
instance also wrote to. That is not a new promise; it is the promise the record already made,
stated for the one directory it had missed. The Invariant, Mechanism, Generates, Evidence,
Impossible-if-true, and Verification sections were extended, and `DiagnosticLog.ts` carries the
annotation. I edited this record rather than proposing it because the code I wrote now carries
its annotation, and an annotation whose record does not describe it is exactly the comment drift
the bycatch taxonomy names.

**Needs refinement, NOT edited: The terminal emulator is the harness screen oracle.** #337 drafted
this and the brief asks for wording. Its Scope says visual assertions parse the byte stream and
that "semantic state assertions may still use the existing `StatusChannel` or `FrameProbe`". The
diagnostic log is a THIRD source that the record names nowhere. This task made that source safe
but did not make it named. Proposed Scope addition, for the contract owner to accept or reject:

> A third source exists: the application diagnostic log, read through
> `scripts/harness/DiagnosticLog.ts`. It is admissible only for facts the grid cannot show, such
> as the layout inputs behind a painted scrollbar, and only through that seam, which returns
> lines carrying the reading driver's own instance identity. A harness never tails
> `artifacts/tui.log`, and never accepts a diagnostic line whose writing instance is unknown.

Proposed Impossible-if-true addition:

> a harness verdict computed from a diagnostic line another instance wrote; a diagnostic source
> read without an instance identity.

Evidence to cite: two concurrent boots on 2026-07-30 put six geometry lines and two `Boot start`
markers in one reader's slice with no way to separate them.

**Beside, not inside: Harness waits observe conditions not frame ordinals.** The failing wait was
correct by that record. It named its condition, it polled, it used no sleep and no ordinal. The
defect was in the SOURCE the predicate read, not in the wait's shape. The record governs how a
wait is written; nothing governed whether its evidence belonged to the waiter. That gap is what
the oracle-record refinement above closes, which is why I propose it there and not here.

### Records the brief's list missed

- [src/modules/system/system.invariants.md](../../../../src/modules/system/system.invariants.md) *Observability never crashes the app*. Its
  Scope names `Logging.write`, which this task rewrote. Upheld: the write is still wrapped, and
  the path resolution and identity generation cannot throw on a missing environment variable. The
  checker reports that no annotation in the tree references this record; see bycatch 4.
- [src/modules/ui/scroll.invariants.md](../../../../src/modules/ui/scroll.invariants.md). Both migrated readers feed scrollbar geometry
  assertions, which is the scroll family's subject. Upheld by the two passing smokes; no scroll
  code changed.
- [project.invariants.md](../../../../project.invariants.md) *Seams are drawn at the shared generator*. Two readers had
  near-copies of "tail the diagnostic log for the newest matching line". The shared generator is
  that one sentence, and it is now one seam with both consumers wired in. Upheld, and improved.

## Bycatch

1. **`artifacts/frame.json` is a TRACKED file that a run can overwrite.** `.gitignore` ignores
   `artifacts/*.json` and then re-admits `!artifacts/frame.json`. `Bootstrap` derives the frame
   path from `TUI_FRAME_PATH` or, failing that, from the status path, which defaults to
   `artifacts/frame.json`. So `TUI_FRAME_DUMP=1 bun run src/main.ts` in a checkout overwrites a
   tracked fixture. No gate step reaches this, because `PtyTestDriver` drops both variables from
   the inherited environment and the tmux ring always passes a per-session frame path. NOT FIXED:
   deciding whether that fixture should be tracked at all is not mine to make. Static finding,
   not driven.

2. **`/tmp/merge-gate-binary-build/iv` is one path for every gate on the machine.** Five
   concurrent pairs both exited 0, so no verdict flip was observed, and I could not build a
   positive control for the check. The comment above the step says the scratch path exists so the
   gate never clobbers a developer's `dist/iv`, which it achieves; it does not address a second
   gate. A per-worktree suffix would cost one string. Reproduced: 5 of 5 pairs green, which is
   evidence of absence only as far as 5 pairs reach.

3. **`/tmp/merge-gate-failures` is a machine-wide symlink to the newest gate's failure
   directory.** Two gates on one machine leave it pointing at whichever started later, so a
   builder reading it can diagnose another builder's red. Not a verdict, but a wrong diagnosis is
   expensive, and this is the class the "read the verdict, not the wrapper" lesson already cost
   the fleet once. Static finding.

4. **Contract-layer: `Observability never crashes the app` has no annotation anywhere.** The
   invariants checker prints it under the coverage line for
   [src/modules/system/system.invariants.md](../../../../src/modules/system/system.invariants.md). Its
   Scope names `StatusChannel.flush`/`settle` and `Logging.write`, and all three still uphold it,
   but no load-bearing line cites it, so a future edit that removes a `try` block would pass the
   checker. I did not annotate it: adding coverage to a record outside this task's subject is a
   separate decision, and the same report lists five other records in the same state.

5. **`scripts/tui-harness.sh` still falls back to a persisted shared `$ROOT/artifacts/home`.**
   `behavioral-contracts.sh` exports a run-scoped `INVAR_HARNESS_HOME`, so the gate is safe, but a
   direct manual launch persists `settings.json` between runs. `smoke-voice-picker.sh:19` already
   documents a false result this produced. This is the recorded smoke-isolate-persisted-HOME
   class, still live in the legacy tier. NOT FIXED, off-diff.

6. **Distillation possibility, now partly resolved and worth naming.** Before this task two
   smokes each had their own "read the newest matching diagnostic line" implementation with
   different slicing rules: one sliced at `Boot start`, one did not slice at all. They produced
   the same effect from the same generator and disagreed about staleness. `DiagnosticLog` is now
   that generator. No further sites were found by the census.

7. **The `laidH=1` transient is confirmed as a real published state, not an artifact of
   interleaving.** #337 measured 9 such lines in 1088 and could not decide whether they were one
   instance's transient or two instances mixing. The capture in section 1 shows both instances
   publish `laidH=1` first and `laidH=22` second, about 4 milliseconds apart, so the transient is
   genuine per-instance behaviour. That does NOT make it harmless: a wait of the shape
   `height > 1` that reads only the newest line can still stall if the app quiesces on the
   transient. With the provenance fix the reader can no longer be dragged onto a FOREIGN
   transient, which removes one of the two ways that wait could hang. The single-instance
   quiescence hypothesis survives untested; I could not force it in this task's runs either.

8. **Plain nonsense, low stakes.** `scripts/harness/smoke-scrollbars-harness.ts` still computes
   `diagnosticsRequired` from `INVAR_PROBE_REPOSITORY_ROOT === undefined`. The original reason was
   that a probe pointed at another repository root wrote its log somewhere the reader could not
   see. After this change the log path no longer derives from the repository root at all, so that
   reason no longer holds. I deliberately left the gate in place: a bisect worktree at an old
   commit runs an app that does not honour `TUI_LOG_PATH`, and there the diagnostics really are
   absent. The condition is now correct for a different reason than the one it was written for,
   which is worth a comment somebody should write.

## Files changed

- `src/modules/system/Logging.ts` — `TUI_LOG_PATH` seam and the per-instance line stamp.
- `src/modules/system/Logging.test.ts` — default path, declared path, the stamp, a declared
  identity, and two child processes never sharing one identity.
- `scripts/harness/DiagnosticLog.ts` — new. The one guarded reader seam.
- `scripts/harness/DiagnosticLog.test.ts` — new. The guard's positive controls, both polarities.
- `scripts/harness/PtyTestDriver.ts` — per-run log path and identity, published as
  `diagnosticLogPath` and `diagnosticLogInstance`; both variables dropped from the inherited
  environment.
- `scripts/harness/smoke-plugin-manifest-harness.ts` — reads through the seam; the `Boot start`
  slice removed.
- `scripts/harness/smoke-scrollbars-harness.ts` — reads through the seam; the `repositoryRoot`
  argument removed from the frame collector.
- [scripts/harness/harness.invariants.md](../../../../scripts/harness/harness.invariants.md) — *Harness app homes are complete and isolated*
  extended to cover the diagnostic log.
- `.invar/tasks/in-progress/90-harness-diagnostic-provenance-guard/census-90-shared-mutable-paths.ts`
  — new. The census, with its self-test.
- `.invar/tasks/in-progress/90-harness-diagnostic-provenance-guard/probe-90-diagnostic-log-provenance.ts`
  — new. The driven two-instance probe.

One product file changed, and only its log path and line format. The branch is not pushed. The
conductor lands.

**Report location.** The dispatch instruction placed this report at an absolute path outside the
worktree, so it is NOT on the branch. The two scratch tools ARE on the branch, in the task folder,
as the scratch-tooling rule requires.
