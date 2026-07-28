# READY — #161 (Files pane blank at settled boot)

## Outcome

Fixed and committed on `fix-blank-file-tree` as `52ad33d`
(`fix(app): publish populated panes before boot settles`).

This is the same cause class as #159 (panel-close publication): **never
published**, not published-then-lost. It is now a confirmed audit class:

`mutation -> reachable publisher -> observed condition`

The file-tree contributor synchronously held 50 rows, and `RootView.update()`
was the sole writer of `sidebarBody.content`; there was no later empty writer
that could overwrite a painted tree. Pressing `Down` caused the already-built
50 rows to appear immediately. Boot's `render()` could instead return through
its 120 ms timeout without observing a completed frame, while OpenTUI
coalesced every same-turn request into the queued layout frame. The waiter was
waiting for a frame whose publisher was no longer reachable.

The app fix removes that false-success timeout, observes OpenTUI's actual
`renderer.idle()` condition, then marks the app started and publishes through
`RenderRequest.afterCurrentTurn`. Therefore `ready=true` cannot settle on an
older frame before the populated pane is painted.

The existing tree-scroll PTY smoke now separately proves both branches of the
required pair: the settled semantic model contains 60 rows, and a known row is
painted in the terminal grid.

## Reproduction and sequences

Current-main baseline (`1597f40`), real repository, 20 settled boots:

`F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F`

Every run exited 0 with `treeRows=50`, `frame=1`, and a blank Files pane.

The exact old boot ordering was planted again as the positive control. It
produced:

`planted-old-boot:F treeRows=50 frame=1 exit=0`

Rows 04-09 of the Files pane were blank. Restoring the fix made the hermetic
60-row smoke green and produced this 20-boot real-repository sequence:

`P,P,P,P,P,P,P,P,P,P,P,P,P,P,P,P,P,P,P,P`

All 20 fixed runs exited 0 with `treeRows=50`; the settled frame sequence was:

`4,4,4,4,4,4,4,4,4,4,4,4,4,4,3,4,4,4,4,4`

## Changed

- `src/modules/app/Bootstrap.ts`
  - wait for `renderer.idle()` instead of a frame-or-120-ms race;
  - publish started state through a next-turn render after initial layout.
- `scripts/harness/smoke-tree-scroll-harness.ts`
  - assert a populated settled model before independently asserting tree paint.
- `src/modules/app/app.invariants.md`
  - record the boot publication boundary, evidence, and impossibility.

Invariant review scope was derived from those paths and annotations:
`app.invariants.md`, `filetree.invariants.md`, `ui.invariants.md`,
`harness.invariants.md`, and the project rendering/data-flow records. The
change strengthens `Rendering is one coarse frame effect`; the file-tree
viewport and harness condition-wait contracts remain upheld.

## Verification

- `bun install` — exit 0.
- `bunx tsc --noEmit` — exit 0.
- `bun test` — exit 0; 1,692 pass, 0 fail, 67,577 expectations.
- `bash scripts/conventions-gate.sh` — exit 0.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`
  — exit 0; 908 annotations, 67 lattice links, 0 problems.
- `bun scripts/check-coverage-ratchet.ts` — exit 0; 319 files inspected, no
  undeclared decrease; tree smoke grew 7 assertions / 5 waits to
  8 assertions / 6 waits.
- `bun scripts/harness/smoke-tree-scroll-harness.ts` — exit 0; ALL-PASS.
- Baseline and fixed 20-run boot sequences — every invocation exited 0;
  sequences quoted above.
- `git show --check HEAD` — exit 0.
- Worktree clean after commit.

## Bycatch

None observed.
