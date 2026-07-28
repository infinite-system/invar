# READY — statics CPU regression diagnosis

## Result

I could not reproduce the reported CPU rise in a real PTY.

`5f22cd8` and `063e3ab` were indistinguishable over two interleaved
330-second idle runs. The second run used the real main workspace, a copied
snapshot of the user's actual settings, and an open TypeScript buffer.

There is therefore no measured mechanism and no valid migration-group
verdict from this round. The migration should stay reverted until the
missing trigger is captured. Reapplying subgroups against a flat endpoint
would produce green results with no discriminating power.

## Reproduction method

Both revisions ran concurrently through the same
`scripts/harness/PtyTestDriver.ts` implementation. Each app had a real PTY
slave, a 120 by 40 terminal, its own isolated home, and the same workspace.
Sampling order alternated on every 30-second interval to cancel ambient
load.

CPU time is user plus system time from `/proc/<pid>/stat`. CPU percent is
the CPU-time delta divided by the wall-time delta for that interval. A
deliberate busy-loop positive control measured 100.3 percent before the
default run and 99.8 percent before the user-condition run.

### Default conditions

Workspace: `/tmp/conductor-staticscpu`.

```text
elapsed  good CPU  good %  bad CPU  bad %  good frame  bad frame
seconds  seconds   interval seconds  interval
   30.0     0.74      1.10     0.73      1.10        4          4
   60.0     0.95      0.70     0.95      0.73        4          4
   90.0     1.18      0.77     1.19      0.80        5          5
  120.0     1.39      0.70     1.39      0.67        5          5
  150.0     1.61      0.73     1.60      0.70        6          6
  180.0     1.82      0.70     1.82      0.73        6          6
  210.0     2.05      0.77     2.04      0.73        7          7
  240.0     2.29      0.80     2.29      0.83        7          7
  270.0     2.53      0.80     2.50      0.70        8          8
  300.0     2.77      0.80     2.72      0.73        8          8
  330.0     2.98      0.70     2.96      0.80        9          9
```

The bad revision did not rise. Its interval CPU stayed between 0.70 and
1.10 percent, and it accumulated 0.02 fewer CPU-seconds than the good
revision by 330 seconds. Both emitted only the documented minute-clock
frames.

### Reconstructed user conditions

Workspace: `/home/parallels/dev/tui-editor`.

The isolated homes received byte copies of
`/home/parallels/.config/invar/settings.json`. Both apps opened
`src/main.ts` through the real Quick Open UI before sampling.

```text
elapsed  good CPU  good %  bad CPU  bad %  good frame  bad frame
seconds  seconds   interval seconds  interval
   30.0     0.86      0.90     0.87      0.83        7          7
   60.0     1.11      0.83     1.15      0.93        8          8
   90.0     1.34      0.77     1.37      0.73        8          8
  120.0     1.59      0.83     1.60      0.77        9          9
  150.0     1.79      0.67     1.83      0.77        9          9
  180.0     2.02      0.77     2.05      0.73       10         10
  210.0     2.23      0.70     2.26      0.70       10         10
  240.0     2.47      0.80     2.51      0.83       11         11
  270.0     2.68      0.70     2.69      0.60       11         11
  300.0     2.90      0.73     2.89      0.67       12         12
  330.0     3.09      0.63     3.10      0.70       12         12
```

This run was also flat. At 330 seconds both lifetime averages were
0.94 percent and their accumulated CPU time differed by 0.01 seconds.

The missing condition is narrower than workspace, settings, an open
TypeScript buffer, LSP startup, git watching, and five minutes of real-PTY
idle. Plausible remaining axes are user interaction history or a particular
agent, terminal, Markdown, hover, help, or settings-panel lifecycle. Those
are hypotheses only; this round did not measure one as causal.

## Mechanism probes

### Effect teardown: refuted

The exact ivue 2.2.1 installed in `/tmp/conductor-statics221` was probed
with 1,000 instances of `Reactive($X)` and 1,000 instances of
`Reactive(Static($X))`.

For each shape:

- 1,000 effect links existed before teardown;
- the positive-control mutation fired all 1,000 watchers;
- `$stopEffects()` left zero scope properties;
- mutations of all captured old refs fired zero further callbacks; and
- all 1,000 cached ref cells were replaced on the next access.

The added prototype generation does not break ivue effect teardown.

### Cache-write self-invalidation: refuted

A first read of a `Static()` `$` getter was performed inside `watchEffect`.
The getter computed once and the effect ran once. A separate ref-based
positive-control effect ran twice after its ref changed.

Installing the static cache is an ordinary class-property write and did not
invalidate the Vue effect that read it.

## Bisect result

No migration group is implicated.

A bisect needs different endpoint fingerprints. Here the full migration and
the full revert are flat and matched in both five-minute conditions. Testing
the nine reactive namespaces, the 22 existing-static namespaces, the five
bare namespaces, or the 55 deleted caches would therefore classify every
group against a non-reproducer.

`6e424e5` changed only the AST query, conventions gate, and static-cache
test. It has no production runtime path. If the original observation was
caused by these landings, the runtime cause is somewhere in `eb7460f`, but
this evidence does not select one of its migration groups.

## Salvage verdict

Keep the migration reverted.

The two leading generic `Static()` mechanisms are healthy, so the migration
is not proven unsalvageable. It is also not safe to salvage: the real
52-to-65-percent report remains unexplained, and no patch or subgroup can be
validated against a missing trigger.

The next round needs a captured high-CPU process or a repeatable action
history. The minimum useful capture is:

- process and child-process CPU samples;
- active buffer and visible surface;
- open agent, terminal, Markdown, hover, help, and settings-panel state;
- registered ivue effect, listener, timer, watcher, and file-watcher counts;
- completed-frame count; and
- a CPU profile from the already-hot process.

That evidence would identify the growing population or hot stack first;
only then should the four migration axes be bisected.

## Contract that should have caught it

Add a gated real-PTY contract named **Idle work does not accumulate**.

It should boot a realistic workspace, open a TypeScript file, exercise and
close every resource-owning migrated surface, then observe equal idle
windows for at least the duration at which this regression was reported.
It must assert:

- registered effects, listeners, timers, and watchers return to baseline
  after every lifecycle cycle and remain flat during idle;
- completed frames stay within the minute-clock allowance;
- CPU-seconds per equal idle window do not grow with window number; and
- child-process and file-watcher populations remain bounded.

The positive control must deliberately leak one periodic effect or listener
per cycle and make both the population count and CPU-slope assertion fail.

The existing `idle-quiescence` contract is insufficient. Both runs here
would pass it because their frame counts were flat apart from the
minute-clock, while the user's reported failure may have burned CPU outside
the render-request path.

## Bycatch

- The Files pane was blank at settled boot for the non-empty
  `/tmp/conductor-staticscpu` workspace even though `treeRows=50`. It was
  observed once on `063e3ab` and reproduced once on `5f22cd8` with
  `bun run drive --open /tmp/conductor-staticscpu --geometry 120x40`.
  No fix was attempted.

## Repository state

No migration code, tests, contracts, or dependency versions were changed.
No gate was run. No commit was created because the requested deliverable is
this out-of-tree diagnostic report and the worktree remains clean.
