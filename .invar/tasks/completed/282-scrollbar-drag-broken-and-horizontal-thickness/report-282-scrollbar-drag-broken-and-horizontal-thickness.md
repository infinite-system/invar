# READY — #282 (repair scrollbar thumb drag and thin horizontal bars)

State: READY

Commit: `23c76d2be7c73db95891dc9488794991a35dc97c`

Branch: `fleet/282-scrollbar-drag-broken-and-horizontal-thickness`

Worktree: `/home/parallels/dev/tui-editor/.invar/worktrees/282-scrollbar-drag-broken-and-horizontal-thickness`

## Result

Thumb drag works again on both editor axes and on the structure right-dock bar.

Every horizontal scrollbar now paints as one lower-half row. The whole-cell bar rect remains the
pointer target. Vertical bars keep their seamless background-fill paint.

The worktree is clean. I did not push or land the commit.

## Reproduction

I drove the real app with the PTY mouse protocol. Each probe sent one thumb press, three pressed
pointer moves, and one release. The numbers below are the published positions after each stage.

Current unfixed task base `419d51543d3a30d5c34f8927ad7c5ef4c1425ae4`, at 2,000 lines:

- editor horizontal: `0→0→0→0`
- editor vertical: `0→0→0→0`
- structure right dock: `0→197→393→591`

The editor bars remained visible. Their presses reached the later source body instead of the bars.
The right-dock bar was above its content and worked. This separated shared slider behavior from
pointer hit order.

A source-body focus click did not warm the problem away on the same unfixed commit. At 500 lines,
the editor focus became active, but horizontal stayed `0→0→0→0` and vertical stayed
`75→75→75→75`. This checks the #260 (first-click warm-up) family.

## Required history comparison and feel-bisect

| Revision | Gesture result | Finding |
|---|---|---|
| Task base `419d5154` | Both editor axes flat | Broken |
| Before #274 (structure scrollbar depth and filter), `6d566651d6daee5f22930be3451c1ff0c9cd72ac` | Both editor axes flat; no structure bar existed | #274 did not break editor drag |
| Before #259 (one panel focus owner), `2d1a21fbcf30b1bb13123d8590de3c5db00751d8` | Both editor axes flat; no structure bar existed | #259 did not break editor drag |
| Before #220 (editor contributor registration), `f80800138225e03e0362aa5778f66f17a0a2b595` | Horizontal `0→13→11→25`; vertical `0→48→97→145` | Responsive |
| #219 (source editor PaneContent seam), `bb7ce7bb97c5d399d5ecf61e46fbdfeaf500350b` | Same responsive sequences | Last responsive commit |
| #220 (editor contributor registration), `ce748915473af3008aa1af42b363487904d462b0` | Horizontal `0→0→0→0`; vertical stayed flat after its starting offset | First broken commit |

The breaking commit is
`ce748915473af3008aa1af42b363487904d462b0`, “Register the source-text editor as a contributor with
uninstall symmetry (#220).”

That commit made the editor-column content lazy. `ScrollbarSync` constructs and adds the editor bars
first. The lazy `SourceTextPaneContent` later adds `gutterBody` and `codeBody` to the same
`editorArea`. All three used the default z-index. The later source bodies won the hit grid while the
background-painted bars remained visible.

## Generator fix

`SolidThumbScrollBar` now gives every bar a minimum z-index of 1. A caller with a stronger value,
such as the panel-cell value 50, keeps that value. Later default-layer content can no longer cover a
visible scrollbar in the hit grid.

The same shared class now branches only its paint vocabulary:

- Vertical bars use blank cells with background fills. This avoids horizontal raster seams in
  Terminal.app.
- Horizontal bars use `▄` with a transparent background. Terminal cells are about twice as tall as
  they are wide. The lower half gives both axes similar visual weight and anchors the bar to the
  pane's trailing edge.
- Both forms keep the same normalized whole-cell thumb rect for paint and hit testing.

The unit contract supplies the dark pair `#1a1b26` and `#7aa2f7`, and the light pair `#e1e2e7` and
`#2e7de9`. Both paint only `▄`, with both supplied foreground colours present. The real default
frame painted 45 lower-half cells and zero full blocks.

I refined `ui.invariants.md` and `ui.lattice.md`. The selected record is now “One scrollbar painter
gives each axis equal visual weight.” It permits lower-half glyphs only on horizontal bars and keeps
the seamless background-fill rule on vertical bars.

## Consumer enumeration

The structural census found no hand-built horizontal alternative.

| Shared consumer | Bars reached through the shared class |
|---|---|
| `ScrollbarSync` | Editor vertical and horizontal, primary dock vertical and horizontal, structure right-dock vertical |
| `ScrollableTextViewport` | Vertical and horizontal bars for hover and any other two-axis text viewport; vertical-only use by the agent transcript, overlay dialogs, and bounded list popups |
| `DiffView` | Diff vertical and horizontal |
| `RootView` | Pooled panel-cell vertical bars |

All horizontal construction reaches `SolidThumbScrollBar`. One generator change therefore thins the
editor, file tree, Git panes, diff, hover, and future shared text viewports together.

## Continuous contract and positive control

The gated scrollbar harness now drives the same gesture through
`scripts/harness/ScrollbarThumbDrag.ts`.

At 500 lines:

- editor horizontal: `0→23→47→70`
- editor vertical: `0→48→97→145`
- structure right dock: `0→47→93→140`

At 100,000 lines:

- editor horizontal: `0→25→50→75`
- editor vertical: `0→10341→20683→31024`
- structure right dock: `0→47→93→140`

Every pressed-pointer move must increase its position. The same cases assert lower-half-only
horizontal paint and mutually exclusive panel-host focus.

For the positive control, I temporarily disconnected the slider's `onMouseDrag` callback. The
focused smoke exited 1 at its first motion contract:

`FAIL 500-line editorHorizontal drag advances after every pressed-pointer move (0→0→0→0)`

I removed the plant. The focused and complete scrollbar harnesses then passed.

The reusable history probe is
`.invar/tasks/active/282-scrollbar-drag-broken-and-horizontal-thickness/282-scrollbar-drag-history-probe.ts`.
Its header gives the exact command and explains every reported number. `project.tools.md` lists it.

## Verification

- `bunx prettier --check ...` — passed.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all` — passed.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` — 1,100 annotations,
  217 lattice links, zero problems.
- `bun run typecheck` — passed.
- `bun test` — 1,895 passed, zero failed, 68,474 assertions across 293 files.
- `bun scripts/harness/smoke-scrollbars-harness.ts` — passed in full.
- `bun scripts/harness/smoke-plugin-manifest-harness.ts` — passed, including the one-focus-owner and
  structure scrollbar paths.
- `bash scripts/conventions-gate.sh` — passed.
- Commit-hook merge gate — all hard gates passed. It ran 62 parallel PTY smokes, the serial
  behavioral contracts, and the input-byte first-frame gate.

The merge gate needed one quiet retry for the unrelated workspace-tabs and panel-chrome harnesses.
Both retries passed. I then ran both exact harnesses on main
`87342a5f6f8396b9fa22cbaa108a311d034809d1`; both reported `ALL-PASS`.

## Bycatch

- The editor horizontal bar keeps the dark palette colours after a project selects the light theme.
  Two light-theme PTY runs painted `#7aa2f7` and `#1a1b26`, not the light palette pair.
  `ScrollbarSync` captures `theme.palette` into `trackOptions` during construction, before the
  reactive theme selection settles, and never refreshes those slider colours. The new lower-half
  shape and drag behavior were correct in both runs. Not fixed because live theme propagation is a
  separate shared appearance change.
- The merge gate's workspace-tabs harness timed out once in the six-worker pool, passed its quiet
  retry, and passed the exact main control. It did not reproduce a second time. Not fixed.
- The merge gate's panel-chrome harness timed out once in the six-worker pool, passed its quiet
  retry, and passed the exact main control. It did not reproduce a second time. Not fixed.
