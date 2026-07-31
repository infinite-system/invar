# BLOCKED — Field v2 3D field and timeline playout

## Outcome

The implementation in the
[Field v2 field-surface brief](brief-417-2-field-v2-3d-field-timeline-playout.md)
is complete and committed. It is not READY because the required combined-tree
merge gate ended with `GATE_EXIT=1`.

The field now has two views. Exact 2D uses stable domain sectors, domain hue,
three kind silhouettes, verification rims, rot fractures, selection brackets,
and persistent labels. Constrained 3D uses one batched Three.js point cloud.
Both views share the same radius and angle generator. The 3D view adds shallow
domain depth but does not change rank geometry.

Secondary-pointer drag changes yaw and pitch within fixed limits. The field
starts no ambient render loop. It renders on data changes, camera input,
resize, and active snapshot transitions. Reduced-motion mode starts and stays
in exact 2D.

Timeline play runs on the client. It loads the next snapshot, classifies birth,
removal, inward strengthening, outward weakening, and rot, waits for the
current field transition to settle, and then advances. Pause, scrub, field
selection, lens selection, composition selection, mode changes, and camera
input cancel active play.

The fixed event classifier lives in
[TimelinePlayout.ts](../../../../tools/invariant-field-v2/TimelinePlayout.ts).
The complete 2D and 3D presentation lives in
[FieldView.ts](../../../../tools/invariant-field-v2/ui/FieldView.ts) and
[FieldView.vue](../../../../tools/invariant-field-v2/ui/FieldView.vue).

## Merge with the record explorer

Main contained commit `7435c3c8`, #418 (Field v2 record explorer and code
lenses), plus its task-state commits. I merged main at `c664fd9f` into this
branch.

The merge base was `52dabf2a`. I compared the base, our commit, and main for
every shared file. The direct conflicts were the dependency manifest and lock
file. The resolution keeps both Three.js and Shiki. The auto-merged selection
seam keeps both timeline cancellation and the record lens clear, relationship,
and composition actions.

The combined
[InvariantField.vue](../../../../tools/invariant-field-v2/ui/InvariantField.vue)
wires the field, timeline, record lens, and record list to one selected-record
state. The combined
[InvariantFieldApp.ts](../../../../tools/invariant-field-v2/ui/InvariantFieldApp.ts)
keeps both playout state and #418’s lens actions.

## Commits

- `1bb80c51facf7b5601d2bbd489193b9846cb8c5c` contains the field, camera, and
  playout work: `Build field v2 3D surface and timeline playout`.
- `e6cd84c92576f5141164f7d8db1beb8aac005007` merges #418 (Field v2 record
  explorer and code lenses): `Merge #418 record explorer into field playout`.

The final worktree is clean. I did not push, tag, land, or delete a branch.
The v1 diff is empty.

## Browser drive

I drove real headless Chromium against a rebuilt 308-snapshot store.

- Snapshot 1 rendered 22 selectable records in 3D. A real Three.js pointer
  pick selected *The terminal shows a bounded viewport*. The merged record
  lens opened the same record and showed its relationships.
- Playing to snapshot 2 showed `Born 0`, `Removed 0`, `Inward 19`, `Outward
  3`, and `Rot 0`. Pause froze the current snapshot.
- Exact 2D rendered 22 record marks and one selection bracket. The record lens
  kept the same selected record.
- The real history produced every event class. Snapshot 3 showed five births,
  one inward move, 21 outward moves, and 22 rot events. Snapshot 6 showed one
  removal.
- Snapshot 308 rendered 377 3D pick targets. The selected record exposed two
  code references. A resolved enforcement-annotation lens opened source lines
  3–17.
- A secondary drag at 377 records changed the camera to `YAW 18° · PITCH 5°`.
  Starting that drag over a record and starting it over empty field space
  produced the same orbit.
- Emulated `prefers-reduced-motion: reduce` reloaded snapshot 308 in 2D,
  disabled the 3D control, and hid the 3D canvas.

## Verification

- `bun test tools/invariant-field-v2` passed on the merged tree: 39 tests, 0
  failures, and 222 expectations.
- Field v2 `vue-tsc` and root `tsc` passed.
- Prettier, file grammar, static getter naming, and the conventions gate
  passed.
- Rank calibration moved the planted-rot radius from `0.245488` to `0.322259`.
  The outward movement was `0.076771`.
- The invariant checker resolved 1,286 annotations and 231 lattice links with
  0 problems.
- The combined full merge gate passed conventions, formatting, both invariant
  passes, the coverage ratchet, reactive observation checks, all unit tests,
  the binary build, 65 of 66 parallel PTY jobs, behavioral contracts, all
  serial harnesses, and all five input-order sessions.
- The combined full merge gate ended with `GATE_EXIT=1` because
  `smoke-terminal-stage-harness` failed twice.

## Positive controls

- Swapping removal before birth made
  [TimelinePlayout.test.ts](../../../../tools/invariant-field-v2/TimelinePlayout.test.ts)
  fail its exact five-event sequence. Restoring the fixed order made it green.
- Forcing reduced-motion setup into 3D made
  [FieldView.test.ts](../../../../tools/invariant-field-v2/ui/FieldView.test.ts)
  fail the 2D fallback contract. Restoring the fallback made it green.
- Removing the 2D mode assignment made the mode-switch contract fail.
  Restoring the assignment made it green.

I removed every planted defect before the final commit.

## Invariant verdict

- [Cost tracks the actively observed set](../../../../project.invariants.md)
  remains upheld. The server still builds once. Playout adds no server timer,
  watcher, or recurring scan.
- Radius remains the shared rank generator in both views. Three-dimensional
  depth is presentation only.
- The scanner, parser, and generated store remain the source of record facts.
  The field does not parse contract prose.
- The selection seam remains singular after the #418 merge. Field picks, list
  rows, relationships, and lens actions all use the same selected-record state.

No invariant changed status.

## Blocker

The full gate preserved both attempts under
[the gate failure directory](/tmp/merge-gate-failures.9a03f9f223bb29dd.697169).
The final log is
[smoke-terminal-stage-harness-.log](/tmp/merge-gate-failures.9a03f9f223bb29dd.697169/smoke-terminal-stage-harness-.log).

The failing condition is in
[smoke-terminal-stage-harness.ts](../../../../scripts/harness/smoke-terminal-stage-harness.ts#L388).
The status probe reports the new `Current terminal input: printf
BROKN_COMMAND` result. After the harness expands that tool row, the UI still
paints the prior `echo "test — with emoji 🦊 ✨ "` result. The expected
`Current terminal input: printf` text never appears.

I reproduced the same fingerprint directly at:

- Combined commit `e6cd84c9`.
- Merged main `c664fd9f`.
- Task dispatch base `52dabf2a`.

This evidence makes the gate failure pre-existing. No Field v2 file
participates in the failing terminal and agent result path. Repository law
requires an out-of-scope shared-seam failure to be reported, not repaired
inside this field task.

## Bycatch

- **BLOCKER — stale expanded terminal tool result.** The terminal-stage smoke
  status sees the new readline buffer, but the expanded agent result paints
  the previous command. It reproduced on the task base, main, and the combined
  commit.
- **GAP — no tool-local contract.** The
  [Field v2 tool](../../../../tools/invariant-field-v2/README.md) still has no
  colocated invariant record or lattice. Root cost, parser parity, tests, and
  the design brief govern parts of the tool, but no local contract unifies the
  scanner, server, ranking, field, explorer, and playout promises.
