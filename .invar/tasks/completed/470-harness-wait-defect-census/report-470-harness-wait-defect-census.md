## In plain words

The app said a frame was quiet even while a panel repaint was waiting. I made each render request lower that flag, stopped guarded waits from accepting an old screen, and changed the broken panel and activity checks to observe facts that really change. A quiet app still answers at once, and an active repaint now waits at both 10-line and 100,000-line scales.

## Result

READY for the conductor re-gate. Round 1 produced commit `35ba9ec1` (`fix harness wait generators for #470`). The round-2 consumer correction is commit `b7c2e8c1` (`fix quiescence publication parity for task #470`). I did not run or bypass the merge gate, as the [brief](brief-470-1-harness-wait-defect-census.md) requires.

The change has five parts.

1. [StatusChannel.ts](../../../../src/modules/system/StatusChannel.ts) now sets `renderQuiescent=false` in memory on the first render request after a settled frame. The completed frame remains the only status-file publisher. [Bootstrap.ts](../../../../src/modules/app/Bootstrap.ts) wraps the renderer's one `requestRender` seam, so direct and internal renderer requests use the same reset.
2. [PtyTestDriver.ts](../../../../scripts/harness/PtyTestDriver.ts) has an opt-in `mustBeFalseNow` guard. It refuses a condition that is already true before the wait. Existing current-state reads keep their valid fast path.
3. [HarnessSmoke.ts](../../../../scripts/harness/HarnessSmoke.ts) measures `panelHost.orderedContents.length` before a duplicate panel row closes. Its surviving-row branch now waits for that model count to fall by one instead of accepting a title that was already painted.
4. [Drive.ts](../../../../scripts/harness/Drive.ts) now joins a status completion to the settled status-and-grid condition before it prints. This was required after the repaired flag exposed a stale `Parsing Markdown…` frame in the full test run.
5. [smoke-activitybar.sh](../../../../scripts/smoke-activitybar.sh) checks the live, visible `Space/Enter changes` prefix. The complete source string wraps after `changes` at the smoke's 100x36 geometry, so the full `Space/Enter changes state` string is not contiguous in the frame.

Regression coverage is in [StatusChannel.test.ts](../../../../src/modules/system/StatusChannel.test.ts), [PtyTestDriver.test.ts](../../../../scripts/harness/PtyTestDriver.test.ts), and [Drive.test.ts](../../../../scripts/harness/Drive.test.ts).

## Driven evidence

Before the fix, a real `Control+j` panel gesture reported `renderQuiescent=true` at frame 4, remained true five milliseconds later, and only painted the open panel at frame 6. The flag never exposed the pending repaint.

After the fix:

- The shared 10-line fixture reported `false` at frame 3 while the panel was still closed, then `true` at frame 5 with the panel open.
- The shared 100,000-line fixture reported `false` at frame 4 while the panel was still closed, then `true` at frame 6 with the panel open.
- A quiet app reported `true` immediately. This proves both arms without raising a timeout.

The duplicate-row path also passed in the real panel smoke. Closing one of two `Database 3` rows left the other row alive only after the settled model count fell.

## Positive controls

I planted both repaired defects after the green focused run.

- Changing the reset back to `renderQuiescent=true` made `a render request resets quiescence until the requested frame settles` fail with `Expected: false; Received: true`.
- Disabling the pre-satisfaction guard made `refuses a pre-satisfied condition when the caller requires false now` fail because the promise resolved instead of rejecting.

Restoring both fixes returned the focused run to 21 passes and 0 failures. The first full test run also supplied a positive control for the Drive join: it failed on a printed `Parsing Markdown…` frame. Replacing the screen-change proxy with the settled condition made the focused Drive test and the final full run pass.

## Verification

- `bun scripts/harness/smoke-panel-chrome-harness.ts` — ALL-PASS.
- `bun scripts/harness/smoke-scrollbars-harness.ts` — ALL-PASS. It covered 500 and 100,000 lines.
- `INVAR_FULL_TMUX=1 bash scripts/smoke-activitybar.sh` — ALL-PASS after the frame showed that the full source phrase wraps across two rows.
- `bun test` — 2,346 passes, 0 failures, 72,051 expectations across 351 files.
- `bunx tsc --noEmit` — pass.
- `bash scripts/conventions-gate.sh` — pass. It reported the existing 20 legacy file-grammar findings and no enforced-module failure.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all` — every contract passed.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --refs` — 1,359 annotations resolved, 266 lattice links resolved, 0 problems.
- `git show --check HEAD` — pass.

## Invariant verdicts

- [Harness waits observe conditions not frame ordinals](../../../../scripts/harness/harness.invariants.md#harness-waits-observe-conditions-not-frame-ordinals) — PASS. The panel helper waits on an ordered-content count. Drive joins status to settled status and screen state. The new guard rejects a false transition premise before it can become a stale-frame wait.
- [Every wait names itself](../../../../scripts/harness/harness.invariants.md#every-wait-names-itself) — PASS. The guarded grid wait keeps its caller description. Graph failures name `panelHost.orderedContents.length` and its expected count.
- [Synchronized end markers bound complete frames](../../../../scripts/harness/harness.invariants.md#synchronized-end-markers-bound-complete-frames) — PASS. The guard runs after pending PTY output is flushed, and the settled Drive condition continues to use the emulator's complete-frame snapshots.
- [Observability never crashes the app](../../../../src/modules/system/system.invariants.md#observability-never-crashes-the-app) — PASS. The reset performs no file IO. The completed frame uses the existing caught, atomic `StatusChannel.flush` path.
- [Rendering is one coarse frame effect](../../../../src/modules/app/app.invariants.md#rendering-is-one-coarse-frame-effect) — PASS. Bootstrap wraps the renderer's existing request authority. It does not add another render effect or consumer-specific request path.
- [Drive settled observations include declared debounced work](../../../../scripts/harness/harness.invariants.md#drive-settled-observations-include-declared-debounced-work) — PASS. A status completion cannot print while the current grid still paints `Parsing Markdown…`.
- [Async-published state is always awaited](../../../../scripts/harness/harness.invariants.md#async-published-state-is-always-awaited) — PASS. The panel helper uses the graph's parked, frame-settled count wait instead of a one-time status read.
- [Capability classes are stateless and Static wrapped](../../../../src/modules/system/system.invariants.md#capability-classes-are-stateless-and-static-wrapped) — PASS. `markRenderRequested` is a static behavior on the existing wrapped `StatusChannel` capability. It adds no instance lifetime.
- [Seams are drawn at the shared generator](../../../../project.invariants.md#seams-are-drawn-at-the-shared-generator) — PASS. Renderer requests own the quiescence reset. The shared panel-close helper owns the ordered-content count. No consumer reimplements either rule.
- [Shared seam changes verify every consumer](../../../../scripts/harness/harness.invariants.md#shared-seam-changes-verify-every-consumer) — CONDUCTOR GATE PENDING. The required direct consumers, the two scale arms, the full unit suite, and the touched contention smokes pass. The [brief](brief-470-1-harness-wait-defect-census.md) explicitly forbids this builder from running `scripts/merge-gate.sh`, which owns the complete registered-consumer pass. The conductor must complete that pass before landing.

The brief's invariant map missed the rendering, Drive settlement, async publication, capability, shared-generator, and shared-consumer records above. The implementation satisfies them except for the conductor-owned complete consumer gate.

## Bycatch

- Contract map gap: the [brief](brief-470-1-harness-wait-defect-census.md) omitted six applicable records listed in the invariant verdicts. The missing Drive settlement record mattered immediately: the first full run printed `Parsing Markdown…` while the model already said parsing was complete.
- Brief drift: the activity-bar brief says the 100x36 frame paints contiguous `Space/Enter changes state`. The driven frame paints `Space/Enter changes` on one row and `state` on the next. Both mouse and keyboard arms reproduced it. The smoke now uses the live first-row prefix.

No unrelated runtime defect was observed.

## PTY usability

The warm server made the render transition easy to see without rebooting between samples. `--size 10` and `--size 100000` made the scale comparison direct, and `app.show('renderQuiescent', 'frame', 'panelVisible')` gave compact evidence.

The confusing part is that the brief asks for `app.get`, but `renderQuiescent` is not reachable through the live app graph. It is only present in the published status projection, so `app.show` can print it but `app.get` and `app.waitFor` cannot wait on it. Also, `app.show` has no label argument; a label is treated as another status path.

Missing: a condition wait for status-only fields in the fluent drive loop, or a graph root for renderer lifecycle state. Either one would let a probe say “wait until quiescence becomes false, then true” without a short diagnostic sample. Please add one of those paths and document the status-versus-graph split in the drive help.

## Round 2 — quiescence publication parity

### In plain words

The reset wrote a second status file before the frame finished. Some checks saw one row of movement beside an old “stopped” flag, so they ended the gesture early. The reset now changes memory only, and the completed frame publishes one consistent status snapshot.

### Cause and correction

`markRenderRequested()` set `renderQuiescent=false` and immediately called `StatusChannel.flush()`. That synchronous write happened before `frameTick()` updated scroll momentum and frame attribution. It had two effects:

- The settings consumer could read a changed `editorScrollTop` with the previous `workspaceScrollMomentumAtRest=true` value. Its wait then returned after the first row instead of after the glide.
- The extra synchronous file write perturbed the exact short-glide frame window under conductor contention. The 2,000-line and 100,000-line cases could record different frame counts.

Commit `b7c2e8c1` removes only that request-time flush. The in-memory snapshot still changes to `false` on the first request after settlement. `StatusChannel.settle()` still changes it to `true` and atomically publishes the completed frame.

[StatusChannel.test.ts](../../../../src/modules/system/StatusChannel.test.ts) now locks both arms and the publication boundary. It proves that the live snapshot is `false` while a frame is pending, the status file still contains the last completed `true` snapshot, and frame 42 publishes `true` when it settles.

### Consumer results

| Consumer | Conductor result | Round-2 result |
| --- | --- | --- |
| `behavioral-contracts.sh` glide caps | 100 ms drive failed | All six 100/1050/2000 ms cases passed at 2,000 and 100,000 lines |
| `behavioral-contracts.sh` scale accounting | 326/5 versus 260/4 reads and frames | Exact 3,510/54 versus 3,510/54; every per-frame ratio is 1.000000 |
| Settings applied smoke | Gain 5 and 120 both moved 1 row | Gain 5 moved 1 row; gain 120 moved 2 rows |
| Panel-chrome contention smoke | Last drag-span cell timed out at 120 columns | ALL-PASS, including both drag-span endpoints and the duplicate-row count path |

The full behavioral suite also ran the plugin-manifest lifecycle path from the fourth conductor log. Its structure scrollbar geometry, keyboard navigation, plugin lifecycle, and final contract all passed.

### Round-2 positive control

I replanted the removed request-time `flush()`. The status test failed with `Expected: true; Received: false` because the pending snapshot escaped to disk. Removing the planted write returned the test to 2 passes and 0 failures.

### Round-2 verification

- `bash scripts/behavioral-contracts.sh` — ALL-PASS. This included exact scale accounting, all glide caps, plugin manifest, 10-line fixtures, and 100,000-line fixtures.
- `bun scripts/harness/smoke-settings-applied-harness.ts` — ALL-PASS.
- `bun scripts/harness/smoke-panel-chrome-harness.ts` — ALL-PASS.
- `bun test` — 2,346 passes, 0 failures, 72,052 expectations across 351 files.
- `bunx tsc --noEmit` — pass.
- `bash scripts/conventions-gate.sh` — pass. It reported the existing 20 legacy file-grammar findings and no enforced-module failure.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all` — every contract passed.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --refs` — 1,359 annotations resolved, 266 lattice links resolved, 0 problems.

### Round-2 invariant verdicts

- [Rendering is one coarse frame effect](../../../../src/modules/app/app.invariants.md#rendering-is-one-coarse-frame-effect) — PASS. A render request changes only the in-memory lifecycle flag. It does not perform a synchronous side-channel write or create another frame effect.
- [Observability never crashes the app](../../../../src/modules/system/system.invariants.md#observability-never-crashes-the-app) — PASS. Only completed frames enter the caught, atomic publication path.
- [Harness waits observe conditions not frame ordinals](../../../../scripts/harness/harness.invariants.md#harness-waits-observe-conditions-not-frame-ordinals) — PASS. The settings wait now receives one coherent completed-frame condition instead of a transient mixture from two frame phases.
- [Synchronized end markers bound complete frames](../../../../scripts/harness/harness.invariants.md#synchronized-end-markers-bound-complete-frames) — PASS. Status publication is again aligned with the completed frame boundary.
- [Shared seam changes verify every consumer](../../../../scripts/harness/harness.invariants.md#shared-seam-changes-verify-every-consumer) — PASS for the complete round-2 failure set. The behavioral suite, settings consumer, panel consumer, and plugin-manifest path all pass. The conductor still owns the final merge gate.

### Round-2 bycatch

- Known class-1 wait: [smoke-panel-chrome-harness.ts](../../../../scripts/harness/smoke-panel-chrome-harness.ts) locates the second drag from a splitter-mark predicate that is already true before the wait. The conductor log timed out after the 120-column last-cell drag. My focused run passed. The panel count wait does not touch this path, so I left it for the planned harness-wait migration.
- Non-reproduced contention failure: [smoke-plugin-manifest-harness.ts](../../../../scripts/harness/smoke-plugin-manifest-harness.ts) timed out while waiting for a right-dock scrollbar diagnostic with height greater than one. The full round-2 behavioral run exercised the same structure lifecycle and passed its scrollbar geometry and navigation checks. I made no unrelated change.

No other bycatch was observed.
