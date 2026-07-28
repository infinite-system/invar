# Task 2 latency investigation

## Result

The asserted 7 ms to 16 ms keypress-to-terminal-flush regression does not reproduce.
There is therefore no valid commit that can be identified as the first commit adding 9 ms of
real flush latency.

Three different signals had been conflated:

1. The inherited 1 ms status-file poll measures keypress to observability-file publication. It
   measures 6 ms at `56d2772` and 8 ms at `271d4b3`, not 7 ms and 16 ms.
2. A raw PTY scanner that stops at OpenTUI's DEC 2026 synchronized-output end marker measures
   1.769 ms at `56d2772` and 2.973 ms at `271d4b3`.
3. `PtyTestDriver.awaitQuiescence()` measures about 16–17 ms on current tip, but it does not stop
   its caller at byte arrival. Its PTY callback observes the marker and then synchronously feeds
   the whole frame through `TerminalEmulator`; the awaiting continuation cannot resume until that
   callback returns, after which `awaitQuiescence()` also awaits `emulator.flush()`. The published
   16.281 ms therefore includes harness-oracle processing after the app's frame bytes have arrived.

The only reproducible endpoint growth in the application byte-flush path is about 1.2 ms
(1.769 ms to 2.973 ms). It is gradual enough that a midpoint `git bisect` is invalid: the
exploratory run selected a documentation-only commit, immediately falsifying its own boundary.

No product fix was implemented.

## Instruments

### Inherited fine status poll

The existing `scripts/bisect-input-latency.sh` was run with:

```text
LATENCY_POLL_INTERVAL_SECONDS=0.001
BAD_LATENCY_THRESHOLD_MILLISECONDS=12
```

Each endpoint used five fresh sessions, 20 alternating cursor-moving keys per session, and the
median of the five session p50s.

This is a status-publication upper bound. It is not terminal byte flush.

### Commit-independent raw PTY scanner

`scripts/bisect-pty-input-latency.ts` and
`scripts/bisect-pty-input-latency-five-runs.sh` were added as untracked investigation scripts.
They:

- allocate a real 120 by 40 PTY with `openpty`;
- run the checked-out `src/main.ts` through the PTY slave;
- drive the file-open and alternating Left/Right user path through the PTY master;
- scan raw master bytes for DEC private mode 2026 begin/end markers;
- stop the latency clock at the synchronized-output end byte;
- use five serial sessions of 20 valid measurements;
- exit 125 on dependency, boot, file-open, cursor, or frame failure.

For the production-path measurements, `TUI_OBSERVE` was disabled and an isolated one-file
workspace was used. The raw scanner intentionally does not parse the application frame through
the harness's `TerminalEmulator`, because the measurement boundary is byte arrival.

## Endpoint verification

| Signal | `56d2772` session p50s | `56d2772` median | `271d4b3` session p50s | `271d4b3` median |
|---|---:|---:|---:|---:|
| 1 ms status publication | 7, 6, 6, 6, 7 ms | **6 ms** | 9, 8, 8, 8, 8 ms | **8 ms** |
| Raw DEC end marker, production path | 1.694, 1.769, 1.883, 1.857, 1.548 ms | **1.769 ms** | 3.021, 3.168, 2.973, 2.927, 2.851 ms | **2.973 ms** |

Both endpoints are below the requested 11–12 ms midpoint. The required fine classifier therefore
does not distinguish the endpoints and cannot support the requested bisect.

The raw application-path change is **+1.204 ms**, not +9 ms.

The cursor-movement frame is 87 bytes at both endpoints. The extra time is synchronous projection
work before the same-sized differential frame is flushed, not terminal output growth.

## Why the 16 ms PTY result is not byte-flush latency

Current `PtyTestDriver` registers this PTY callback:

```ts
this.openPty.onData((bytes) => {
  this.quiescence.observe(bytes);
  this.emulator.write(bytes);
});
```

`observe()` resolves the DEC-frame waiter when it sees the end marker, but JavaScript does not
resume the waiting async function in the middle of this callback. The callback next executes
`emulator.write(bytes)` synchronously. `awaitQuiescence()` then also executes
`await this.emulator.flush()`.

Re-running the published `PtyTestDriver` method on `271d4b3` produced:

```text
p50 17.223 ms
p95 20.154 ms
```

The raw marker on the equivalent one-file production path is 2.973 ms. The approximately 14 ms
difference is downstream harness work, principally terminal emulation of the received frame; it
is not time before Invar writes the DEC end marker.

This also explains why the 1 ms status poll and the published PTY number disagree. They do not
share a measurement boundary.

## Bisect log and why it is rejected

For completeness, an exploratory raw-marker bisect used 2.65 ms, approximately the midpoint
between the raw endpoints. Its median-of-five results were:

| Commit | Session p50s | Median | Classification |
|---|---:|---:|---|
| `872f91d` | 2.579, 3.135, 2.636, 2.649, 2.612 | 2.636 ms | good |
| `b7f9ad5` | 3.219, 3.420, 3.068, 3.193, 3.330 | 3.219 ms | bad |
| `f8faebf` | 3.108, 3.005, 3.030, 3.104, 3.014 | 3.030 ms | bad |
| `a1ceb09` | 2.733, 2.767, 2.964, 2.767, 2.751 | 2.767 ms | bad |
| `6151101` | 3.224, 2.660, 2.778, 2.508, 2.807 | 2.778 ms | bad |
| `af9573f` | 2.793, 2.838, 2.663, 2.650, 2.581 | 2.663 ms | bad |
| `69504b7` | 2.610, 2.515, 2.432, 2.244, 2.125 | 2.432 ms | good |
| `069c86b` | 2.699, 2.736, 2.694, 2.843, 2.736 | 2.736 ms | bad |

`git bisect` named `069c86b`:

```text
docs(conductor): verbatim cron prompts in SKILL.md + hourly loop may refine the skill itself
```

Its complete runtime diff is empty. It changes only:

```text
.claude/skills/conductor/SKILL.md
project.conductor.md
```

That is a mechanism-impossible boundary. The adjacent medians straddle a threshold only 0.3 ms
wide, and several individual sessions also cross it. The endpoint change is gradual plus
measurement variance, so binary monotonicity does not hold. The bisect result is rejected rather
than reported as a culprit.

Raw output is preserved in `/tmp/wt-bisect2-raw-bisect.log`.

## Candidate and contribution checks

| Candidate or boundary | Parent | Child / ablation | Contribution | Verdict |
|---|---:|---:|---:|---|
| Full raw endpoint range | 1.769 ms | 2.973 ms | +1.204 ms | Real but far smaller than claimed |
| Initial agent-pane skeleton `b7f9ad5` | 3.301 ms | 3.287 ms | -0.014 ms | Not a boundary |
| Vue 3.6 RC dependency change `244c46e` | 2.378 ms | 2.462 ms | +0.084 ms | Small / within variance |
| Late candidate bundle `0a9e382..271d4b3` (transcript search, status extraction, spawn seam, read-only buffer, PTY harness) | 2.876 ms | 2.973 ms | +0.097 ms | Cannot explain endpoint growth |
| Current-tip `AppStatusProjection.publish` ablation, observability off | 2.973 ms | 2.912 ms | -0.061 ms | On path, but negligible |

### Status projection

`Bootstrap.paint()` calls:

```text
view.update()
AppStatusProjection.publish(statusProjectionPorts)
renderer.requestRender()
```

`AppStatusProjection.snapshot()` assembles the large patch even when `StatusChannel` ultimately
has no enabled output. It is therefore technically on the production keypress paint path.

However, gating that publish call off on current tip changed the raw median only from 2.973 ms to
2.912 ms. Controlled raw DEC runs with observability on and off were likewise effectively equal
at the marker boundary. Status-file serialization/publication happens after the frame marker and
explains part of the 8 ms status-poll number, not terminal byte-flush latency.

The extraction commit `ef2d75c` moves this projection out of `Bootstrap`; it does not originate
the snapshot assembly. The entire late candidate bundle contributes only about 0.1 ms.

### Agent pane and transcript projections

The initial agent skeleton's adjacent parent/child medians are indistinguishable. In the normal
editor path the panel is hidden, so the expensive transcript render branch is not executed.
Later transcript-search additions are in the late candidate bundle whose total measured
contribution is about 0.1 ms.

### Tab-bar extraction, read-only buffer, and spawn seam

The tab-bar extraction is a source refactor of the existing render generator. `ReadOnlyTextBuffer`
changes the editor model seam, and the spawn refactor changes external-process construction.
None introduces a new cursor-key scheduling boundary. The late read-only/spawn commits are also
inside the measured +0.097 ms late bundle.

### What actually grew

Between the endpoints, `RootView.update()` accumulated many always-visited projection surfaces:
workspace tabs and breadcrumbs, activity/status controls, overlay controllers, scrollbar
controllers, image/panel mounts, hover projection, and layout synchronization. Cursor movement
still causes the one coarse frame effect to run the complete `view.update()` projection before
requesting a render. The differential terminal output stays 87 bytes, but more synchronous
JavaScript executes before those bytes.

The measurements support cumulative projection growth of about 1.2 ms. They do not support one
commit contributing 9 ms, or even one sharp commit contributing the full 1.2 ms.

## Proposed fix approach and blast radius

### Required measurement fix

Make the PTY driver expose a timestamp captured inside
`SynchronizedOutputQuiescence.observeByte()` when the DEC end marker is scanned. Report at least
two separate metrics:

1. keypress to raw DEC end-marker arrival;
2. marker arrival to harness snapshot ready (`TerminalEmulator.write` plus `flush`).

Do not call their sum application input-to-screen latency. The status-file metric should remain
explicitly named keypress-to-status-publication and should continue to report its polling
resolution.

Blast radius: harness-only, low. Snapshot correctness is unchanged; only timing boundaries and
performance documentation change.

### Small production cleanup

Avoid assembling `AppStatusProjection.snapshot()` when no status channel is enabled. This is
honest observability gating, but its measured benefit is only around 0.06 ms and should not be
sold as the latency fix.

Blast radius: app observability wiring. Driven tmux/status tests are the main risk; normal
production output should be unchanged.

### Optional projection optimization

If the approximately 1.2 ms cumulative growth warrants optimization, profile `RootView.update()`
by projection group and add narrow dirty/cached seams at the true generators. Cursor movement
must still update editor content, selection, scrollbars, status, and caret, but it need not
rebuild stable workspace-tab, hidden-panel, hidden-overlay, or static chrome content.

This is a broader architectural optimization and must preserve the one-way
input-to-model-to-projection flow. Blast radius is medium-to-high across UI projection,
FrameProbe geometry, overlays, tabs, scrollbars, panel visibility, and caret placement. It should
not be attempted on the evidence of a nonexistent 9 ms regression.

## Falsification checks

This diagnosis would be falsified or narrowed by any of the following:

- Timestamping the DEC end byte inside the PTY callback, before `TerminalEmulator.write`, still
  produces a five-session p50 near 16 ms on current tip.
- Repeating the raw endpoint protocol with a query-answering terminal front end moves
  `271d4b3` to about 16 ms while leaving `56d2772` near 7 ms.
- Five fresh 1 ms status-poll sessions on current tip produce an aggregate near 16 ms instead of
  the observed 8 ms.
- A source-level timing trace shows approximately 9 ms elapsing before the DEC end byte is read,
  with terminal-emulator work excluded.
- Repeating an adjacent runtime commit pair yields stable, well-separated classes and a diff
  whose keypress-path mechanism accounts for the full raw endpoint delta. The documentation-only
  `069c86b` boundary cannot satisfy this.
- Disabling status snapshot assembly lowers raw current-tip timing by milliseconds rather than
  the observed 0.061 ms.

## Repository state and verification

- Worktree restored to detached
  `271d4b310ae0b15d63bc48d289de1c603838719b`.
- No branch change, commit, push, deletion, or product-code fix was made.
- Temporary source ablations were restored; `git diff` contains no tracked changes.
- Investigation scripts use full descriptive identifiers.
- `bash -n` passes for the shell classifiers.
- `bunx tsc --noEmit` passes.
- `bun .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` reports
  0 problems and 428 resolved annotations.
- Invariant scope: the measurement work touches harness observability and the
  input-to-frame path governed by `project.invariants.md`,
  `scripts/harness/harness.invariants.md`, and `src/modules/app/app.invariants.md`.

Conventions loaded from `project.conventions.md` at
`2a5ae3a596627889221c34acd94efa4492b73cff`.
