# Input-latency proxy regression investigation

## Result

The first commit that changes the recorded input-latency proxy from the fast class to the
one-poll-later class is:

`56d2772fe7444d69285c4264ef5d0dd220c2ec02`

`Tab bar QA: clickable right-pinned arrows, positional cycle, hover/press states, close padding`

Confidence is high in the commit boundary: the definitive classifier used five independent
sessions per commit, with 20 valid cursor-moving presses per session. Its parent is consistently
good and the commit is consistently bad under the original 20 ms-poll proxy.

The regression note's proposed mechanism is not supported, however. This commit does not move
input behind a frame timer or change the renderer scheduler. A 1 ms-poll cross-check measures the
parent at 6 ms and the child at 7 ms. The apparent 5 ms to 27–28 ms jump is mainly the original
proxy amplifying a small render-path slowdown: after its first immediate status-file read misses,
it sleeps for 20 ms before observing the already-completed frame.

In short: `56d2772` regressed the proxy, but it did not re-quantize keypress-to-flush to the
30 fps frame cadence.

No fix was implemented.

## Endpoint selection and confirmation

The good endpoint is `f41a241f6ed85719abfcb1758c71441dcd394ad7`. The historical baseline
says its "current HEAD" run occurred at 2026-07-21 12:05. `f41a241` was committed at 12:04
and is the demand-driven, enforced-idle tip immediately before that run; the result was recorded
in `fb209db` at 12:09.

The bad endpoint is `871498c6f1c6781b82e94c28cfc1035952ee0578`, the code tip described by
the 2026-07-24 repaired-harness baseline as main at `56fe6df` plus the review-fix branch. The
following `e7cde1a` commit records the measurements but changes documentation only.

Each endpoint was measured in five fresh tmux sessions. Each session used the original proxy's
20 alternating Left/Right presses; the endpoint verdict is the median of the five session p50s.

| Endpoint | Session p50s | Median | Verdict |
|---|---:|---:|---|
| `f41a241` | 5, 5, 5, 5, 5 ms | **5 ms** | good |
| `871498c` | 28, 28, 28, 28, 28 ms | **28 ms** | bad |

This confirms both endpoints before bisecting. The good endpoint still reproduces the documented
~5 ms p50.

## Bisect method

The definitive runner is:

- `scripts/bisect-input-latency-five-runs.sh` — `git bisect run` classifier.
- `scripts/bisect-input-latency.sh` — one session of the original 20-press proxy.

For every checked-out commit the runner:

1. runs `bun install --frozen-lockfile` so the commit gets its own dependency versions;
2. waits for install activity to settle;
3. launches the real Invar user path in a unique 120×40 tmux session and fresh isolated HOME;
4. opens a real fixture buffer and verifies that every measured key moves the cursor;
5. records 20 keypress-to-status-flush observations serially;
6. repeats that full session five times, also serially;
7. classifies the median session p50 below 15 ms as good and at/above 15 ms as bad;
8. exits 125 on install, boot, buffer-open, cursor, or measurement failure.

No investigation measurement ran concurrently with another investigation measurement. The host
load average observed during the stability audit was 0.21 on 16 virtual CPUs; pre-existing
user-owned processes were not touched.

Two weaker preliminary bisects used only one session and produced runtime-impossible boundaries
(`fd9db66`, a mouse-capture-only change, and `86e2181`, a documentation-only rename). Rechecking
their parents falsified those boundaries. That evidence is why the definitive run uses the
median of five complete proxy sessions rather than treating five individual keypresses as five
runs.

## Definitive bisect log

| Commit | Five session p50s | Median | Classification |
|---|---:|---:|---|
| `1ed257b48d30` | 27, 27, 28, 29, 28 | 28 ms | bad |
| `3b78216fd79f` | 27, 6, 27, 27, 27 | 27 ms | bad |
| `cce92ac59741` | 27, 27, 27, 26, 27 | 27 ms | bad |
| `b612f221cb9f` | 7, 27, 28, 6, 27 | 27 ms | bad |
| `546871b102c7` | 7, 6, 27, 5, 5 | 6 ms | good |
| `3ec106dfac0f` | 26, 6, 26, 5, 5 | 6 ms | good |
| `bc0ec2612bae` | 7, 27, 6, 6, 6 | 6 ms | good |
| `56d2772fe744` | 27, 27, 28, 27, 28 | 27 ms | bad |
| `85d4343f3abc` | 6, 6, 5, 8, 7 | 6 ms | good |

`git bisect` therefore identifies `56d2772` as the first bad commit. Its sole parent is the
confirmed-good `85d4343`.

The raw definitive bisect commands are preserved in
`/tmp/wt-bisect-definitive-bisect.log`; all raw keypress samples are in the worktree's ignored
`.bisect-input-latency.log`.

## Culprit diff summary

The commit changes:

| Path | Summary |
|---|---|
| `src/modules/ui/RootView.ts` | 171 lines changed; rewrites the tab-bar render and hit-test geometry |
| `scripts/smoke-tabs.sh` | new 52-line driven tab-bar smoke |
| `project.progress.md` | task/progress documentation |

Only `RootView.ts` changes the measured runtime.

The old one-tab render path emitted roughly three styled chunks: the label, close glyph, and a
separator. The new path emits separately styled label/dirty/padding/close chunks, computes
hover/pressed geometry, and then unconditionally fills every remaining tab-bar column with a
separate one-character `TextChunk`:

```ts
while (column < tabsAreaWidth) {
  chunks.push(fg(palette.fg)(' '));
  column += 1;
}
```

That loop is at historical `RootView.ts:632-636`. With one short tab in the 120-column fixture it
creates dozens of additional styled chunks on every repaint even though there are no overflow
arrows to pin. Cursor movement invalidates the one coarse frame effect, which calls
`view.update()`, and `renderTabBar()` runs as part of that update. The new cost is therefore on
the measured keypress-to-flush path.

The same generator survives at the current tip after extraction into `TabBarRenderer.ts`: both
the workspace and buffer tab strips still pad unused horizontal space one styled cell at a time.

## Mechanism and cross-check

The original proxy performs an immediate status-file read after `tmux send-keys`. If that read
sees the cursor update, the sample is about 5–8 ms. If it narrowly misses, the loop executes
`sleep 0.02`; the next observation is then about 26–30 ms. The proxy therefore has a discontinuity:
a roughly 1 ms render slowdown can appear as an extra 20+ ms.

The adjacent commits measured with a 1 ms polling interval:

| Commit | Raw samples | Median |
|---|---|---:|
| Parent `85d4343` | 5,8,4,8,8,4,7,7,5,5,7,4,4,6,7,8,4,7,9,5 | **6 ms** |
| Child `56d2772` | 5,8,4,7,7,7,7,5,5,9,6,8,6,7,8,6,5,8,7,9 | **7 ms** |

The child flush is observed well before a 30 fps frame period. This directly falsifies the claim
that the commit routes keypresses to the next 33 ms frame tick. It instead adds enough synchronous
tab-render work to move the flush across the coarse proxy's first-observation boundary more often
than not.

The new PTY byte harness was not used for the historical bisect because it is absent from those
commits. The 1 ms status-flush cross-check was sufficient to distinguish actual frame timing from
the 20 ms proxy polling artifact. A future fix should also be verified with the PTY DEC 2026 frame
marker path on current tip.

The specific one-cell padding loop is the strongest mechanism candidate because it introduces
O(terminal width) styled allocations on the one-tab path. It has not yet been isolated by a
controlled source edit because this task forbids implementing a fix. Other extra styling work in
the same tab-bar rewrite may contribute to the measured ~1 ms.

## Proposed fix

Two small, complementary changes are appropriate:

1. In the tab-bar renderer, represent an unused horizontal gap as one chunk:
   `fg(palette.fg)(' '.repeat(gapWidth))`. Only add it where padding is required to pin right-side
   controls. Advance the geometry column by `gapWidth` once. Apply the same correction to the
   current workspace-tab and buffer-tab render paths.
2. Repair the latency measurement so it cannot turn a narrow first-read miss into a false frame
   period. Prefer the PTY driver's DEC 2026 frame marker timing for keypress-to-byte response.
   If the status proxy remains, use event-driven file replacement notification or a fine poll and
   report its resolution explicitly.

Estimated blast radius is low for the renderer change: one tab-bar capability, with visual
whitespace and right-control geometry as the only behavior at risk. The measurement change is
harness-only. Verification should include:

- the five-session coarse proxy returning to the fast class;
- fine-grain status timing and PTY marker timing;
- `smoke-tabs.sh` and workspace-tab smoke;
- a FrameProbe assertion that right controls remain pinned and hit geometry still matches;
- idle-quiescence frame count unchanged;
- the normal invariant, typecheck, and test gates.

## What would falsify or narrow this diagnosis

- Collapsing only the per-cell padding loop on `56d2772` does not restore the coarse proxy. That
  would narrow the mechanism to other work in the tab-bar rewrite and require profiling/ablation.
- Repeating five isolated parent sessions produces an aggregate p50 at or above 15 ms, or repeating
  five child sessions produces an aggregate below 15 ms. That would invalidate the commit boundary.
- PTY frame-marker timing on equivalent parent/child builds shows a real ~28 ms child delay despite
  the 1 ms status proxy observing 7 ms. That would expose a mismatch between status settle and
  terminal byte emission.
- A controlled child build with the old `renderTabBar()` still measures bad. That would rule out
  the tab renderer and require looking for a non-textual build/environment difference.

## Repository state and verification

- Worktree restored to detached `271d4b310ae0b15d63bc48d289de1c603838719b`.
- No branch, commit, push, deletion, or product-code fix was made.
- Investigation scripts pass `bash -n`.
- `bun .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` reports
  **0 problems** and 428 resolved annotations.
