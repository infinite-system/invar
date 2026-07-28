# READY — #168 (replace frame-ordinal waits with observable conditions)

Commit: `23258e8f8cd3ceec6ef7798de0dbc4446f3840c4`

Worktree: clean after commit.

## Outcome

Removed the future-frame waiting capability from `SynchronizedOutputQuiescence` and removed both
public proxy APIs that exposed it (`awaitQuiescence` and `awaitNextCompletedFrameSnapshot`). The raw
DEC 2026 scanner now reports completed frames that have already arrived. `PtyTestDriver` splits PTY
chunks at those exact boundaries, flushes each segment through the production terminal emulator, and
records the immutable snapshot paired with each observed frame.

All waits now terminate on a named result condition:

- ordinary driven repaint checks compare the complete grid/native-caret signature with the
  pre-input signature and require the changed snapshot to belong to output observed after that input;
- visual waits poll their named grid predicate independently of whether another frame arrives;
- diagnostic streams collect already-observed frame history only while a named grid, disk, or
  published-state condition is pending;
- editor and diff smoothness stop on movement plus a published rest condition; the app now publishes
  `contributedSurfaceAnimationAtRest` because a diff's final painted cells do not reveal whether its
  momentum is still active;
- no timeout or frame budget was raised.

Frame counts remain available and are still used for measurements over completed history. Only the
prediction that frame N+1 must exist was removed.

## Reproduction and mechanism

At the starting commit `960af8e`, the required ten serial behavioral runs produced this exact
sequence:

`FAIL, PASS, FAIL, PASS, FAIL, PASS, FAIL, PASS, FAIL, PASS`

The failure was always the plugin-manifest drive immediately after `PASS the language-provider
fixture opens in the editor`. Failed runs stopped with completed-frame counts `59, 58, 59, 58, 59`.
The two provider gestures are intentionally inert after provider uninstall, so neither owns a
reachable repaint publisher. The old wait therefore asked for a frame that did not exist. The
alternating local fingerprint also explains why a retry commonly hid it.

Standalone reproduction before the change:

- `bash scripts/smoke-plugin-manifest.sh`: exit 1, completed frames observed: 59.
- `bun scripts/harness/smoke-shortcut-help-harness.ts`: exit 0 in the standalone sample; the planted
  no-publisher control below supplies deterministic evidence for that reported site.

The requested history check was performed in isolated detached worktrees with frozen installs:

- merge `1abe1d0` (#178 behavioral-contract concurrency): one behavioral run exited 0;
- parent `c48704f9`: one behavioral run exited 1 at the same plugin-manifest future-frame wait,
  completed frames observed: 58.

Therefore #178 (behavioral-contract concurrency) did not introduce the defect; its parent already
contains it. Scratch worktrees were removed after the comparison.

## Caller census

The primitive `SynchronizedOutputQuiescence.awaitNextCompletedFrame` had these production callers in
`PtyTestDriver`:

1. `sendKeysAndAwaitFrameByteArrival` — wanted the byte boundary of a user-visible key result, but had
   no result predicate. Removed. Its only measurement consumer now waits for native-caret movement.
2. `sendKeysAndAwaitGridConditionByteArrival` (initial and repeated waits) — wants the first completed
   snapshot satisfying its supplied grid predicate. It now searches exact already-observed snapshots
   until that predicate is true.
3. `awaitQuiescence` — wanted a post-input screen/caret result. Replaced by the result-based
   `awaitScreenChange`, with exact predicates at the inert/failure-prone sites.
4. `awaitNextCompletedFrameSnapshot` — diagnostic consumers wanted per-frame history. Removed and
   replaced with `collectCompletedFrameObservationsUntil`, whose termination is a named semantic
   condition.
5. `awaitGridCondition` — wants its named current grid/external predicate. It now checks that
   condition directly on a poll interval and never waits for frame arrival as its wake-up condition.

The primitive also had five unit-test callers; those tests now assert returned observations from
already-supplied bytes, including two complete frames in one PTY chunk.

The 75 downstream `awaitQuiescence` calls were enumerated structurally. Their files were:

- `Drive.ts`, `record-terminal-emulator-fixtures.ts`, `measure-file-switch-latency.ts`, and
  `measure-input-byte-flush.ts`;
- `smoke-agent-engine-switch-harness.ts`, `smoke-agent-harness.ts`,
  `smoke-agent-pane-ux-harness.ts`, `smoke-agent-skill-popup-harness.ts`,
  `smoke-clipboard-frame-boundary-harness.ts`, `smoke-comment-styling-harness.ts`,
  `smoke-editor-harness.ts`, `smoke-hover-harness.ts`, `smoke-inline-rewrite-harness.ts`,
  `smoke-layout-harness.ts`, `smoke-move-line-harness.ts`,
  `smoke-navigation-history-harness.ts`, `smoke-overlay-dialog-harness.ts`,
  `smoke-paste-harness.ts`, `smoke-plugin-manifest-harness.ts`,
  `smoke-scrollbars-harness.ts`, `smoke-search-mouse-harness.ts`,
  `smoke-selection-harness.ts`, `smoke-tabs-harness.ts`,
  `smoke-terminal-harness.ts`, `smoke-terminal-stage-harness.ts`,
  `smoke-workspace-tabs-harness.ts`, and `smoke-wrap-harness.ts`.

Their shared claim is now a changed grid/native-caret signature observed after the input. Three
callers received narrower conditions because a generic repaint was not their actual claim:
plugin-manifest uses the later Extensions action as FIFO liveness for inert gestures; search-mouse
waits for Find to disappear; tabs waits for Open Buffers to disappear.

The per-frame diagnostic callers and their actual termination claims are:

- terminal-stage: the driven terminal command creates its proof file;
- inline rewrite: the exact typed line is visible;
- completion latency: `push_str` has scrolled out of the completion popup;
- horizontal extent: the deep widest-line marker is visible;
- scrollbar probes: the thumb reaches bottom, a wheel target becomes visible, or the relevant
  scroll position moves and published momentum reaches rest;
- smoothness: gesture movement plus rest, the first changed snapshot after follow-on input, all
  accumulation flicks consumed plus rest, all burst impulses consumed plus rest, or the requested
  depth marker reached.

Structural post-checks report zero `awaitNextCompletedFrame` identifiers and zero `awaitQuiescence`
identifiers under `scripts/harness`.

## Positive controls

Plugin-manifest repaired site:

- Planted the exact inert `Control+Space`, `Control+]` sequence followed by the new screen-result
  wait.
- RED, exit 1: `Timed out waiting for grid condition: the driven input produces an observed screen
  or native caret change`.
- Removed the plant and reran: GREEN, exit 0; the provider degradation assertion passed.

Shortcut Help repaired site:

- Replaced PageDown at `scrollUntilVisible` with inert `Control+Space`, leaving the same semantic
  sheet-scroll condition.
- RED, exit 1: `Timed out waiting for grid condition: PageDown changes the shortcut sheet while
  seeking Go to File`.
- Restored PageDown and reran: GREEN, exit 0; `smoke-shortcut-help-harness: ALL-PASS`.

Permanent unit positive control:

- A recorded PTY child paints `IDLE GRID`, receives a key in raw mode, and emits no further frame.
  `awaitScreenChange(100)` rejects on the named result condition. The focused harness test file has
  21 passing tests including this red-capable case.

## Scale and repeated verification

- `bun run drive`: exit 0 at defaults.
- `bun run drive --size 100000`: exit 0.
- Focused smoothness gesture at 2,000 lines over editor and diff: exit 0.
- Focused 900 ms rapid-input smoothness burst over editor and diff: exit 0.

After the repair, ten serial behavioral runs produced:

`PASS, PASS, PASS, PASS, PASS, PASS, PASS, PASS, PASS, PASS`

Every run exited 0. No retry wrapper was used.

## Required verification

- `bunx tsc --noEmit`: exit 0.
- `bun test`: exit 0.
- `bash scripts/conventions-gate.sh`: exit 0.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: exit 0;
  918 annotations resolved, 67 lattice links resolved, 0 problems.
- `bun scripts/check-coverage-ratchet.ts`: exit 0; 319 files inspected, no undeclared decrease.

The invariant and ivue rules affected the implementation materially: the harness contract was
amended in place to prohibit a primitive promising the next synchronized frame, and the app-side
diff rest projection was added as a plain status update inside the existing coarse frame effect.

## Registered-consumer sweep

All 60 `smoke-*-harness.ts` consumers registered in `scripts/merge-gate.sh` were invoked once without
running the merge gate. Fifty passed on the first sweep. Five of the initial ten reds passed on a
focused rerun (`bounded-list-popup`, `editor`, `markdown`, `tabs`, and `terminal`); search-mouse also
passed after its wait was narrowed to the actual Find-closed result. The remaining unrelated reds
are recorded as bycatch below rather than changed outside this task.

## Bycatch

All observations below were made by running the named harness directly as
`bun scripts/harness/<name>.ts` against the task worktree based on `960af8e`; that task content is
now commit `23258e8f8cd3ceec6ef7798de0dbc4446f3840c4`.

- `smoke-overlay-dialog-harness.ts`: Settings did not close after its discovered outside press in
  `modal outside presses are consumed`; reproduced 2/2.
- `smoke-settings-applied-harness.ts`: startup printed `Renderable with id root-column is not a child
  of __root__, skipping remove`, then timed out waiting for `w.txt` to render; reproduced 2/2.
- `smoke-terminal-stage-harness.ts`: the clean themed shell prompt never matched the fixture prompt
  and color predicate; reproduced 2/2.
- `smoke-bounded-list-popup-harness.ts`: popup wheel input did not change the visible list or reveal
  its tail; reproduced once, then passed its focused rerun.
- `smoke-editor-harness.ts`: the tree/editor click section timed out waiting for `focus === 'files'`;
  reproduced once, then passed its focused rerun.
- `smoke-markdown-harness.ts`: preview snapshot lacked the `| Ragged` row; reproduced once, then
  passed its focused rerun.
- `smoke-tabs-harness.ts`: Escape left Open Buffers visibly open; reproduced once, then passed after
  the caller was changed to wait for the exact closed result.
- `smoke-scrollbars-harness.ts` showed three independent pre-collection failures on successive
  reruns: the diff horizontal thumb was absent once; widening the deepest diff line changed the
  measured thumb from 28 to 44 once; and wrap-off overview marks changed thumb geometry once. The
  failures occurred at different earlier assertions, so none reproduced a second time. No bycatch
  fix was made.

No bycatch was committed separately.
