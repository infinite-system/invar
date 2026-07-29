# DIAGNOSED, NOT READY — #263 (terminal shrink leaves the Markdown split frozen)

State: DIAGNOSED, NOT READY

Branch: `fleet/263-terminal-shrink-markdown-split-frozen`

HEAD: `e13f86cda571addc10a180ca1d21e1585087614c`

Worktree: clean

Implementation commit: none

Compaction: one automatic context compaction during final verification

Conventions: `project.conventions.md` at `2e6c207555c2aeecd49d460e5d8ca3ed8ba030af`

## Result

I reproduced the terminal-shrink freeze. The first failed generator is below Markdown and
below the layout model.

`OpenPty.resize(60, 25)` changes the real PTY size. Bun then sends `SIGWINCH`. However, Bun
1.3.14 still reports `process.stdout.columns === 120` and
`process.stdout.rows === 40` inside the process-level signal callback. OpenTUI reads those
stale values. It decides that the renderer size did not change. It does not emit its
renderer resize event. Invar therefore keeps its 120-column layout while the harness
emulator clips the visible grid to 60 columns.

This report contains no code change. The request allowed creation of this report only. The
task is not READY because it still needs an implementation, a restored smoke contract, and
a positive control.

The requested task directory existed. I wrote this report there. I did not use the `/tmp`
fallback.

## Reproduction

I drove the default app first.

- `bun run drive --size 10` reached a ready and quiet frame.
- `bun run drive --size 100000` reached a ready and quiet frame.
- The shared #237 (Markdown preview auto-open) resize probe opened the default right-side
  Markdown preview at 120 by 40. It then resized the terminal to 60 by 25.
- For each settled sample from one second through eight seconds, the 60-column frame had no
  preview divider or preview title.
- A direct published-status probe waited ten seconds for `status.width === 60`. It timed
  out. The last published width remained 120. The last editor-center rectangle remained
  `{"left":37,"top":0,"width":54,"height":36}`.

The harness emulator did become 60 columns wide. This split result is important: the
terminal changed size, but the app did not accept the new viewport.

I also tested the brief's claim that a mouse event makes the layout settle. A source click
at column 75, row 8 reached Invar before the resize. A separate run sent pointer movement
next to the resize. Neither controlled run made the published width become 60. The claimed
mouse workaround is not stable on this base. An input byte can refresh Bun's cached terminal
dimensions, so event timing may explain the earlier observation.

## Generator evidence

The smallest real-PTY probe gave this sequence:

```text
READY 120 40
WINCH 120 40
DATA 60 25
```

The PTY ioctl had succeeded. `stty size` changed from `40 120` to `25 60`. The process was
also the foreground process group. This was not a missing foreground-group signal.

The stale value was specific to Bun's process-level `SIGWINCH` callback:

```text
PROCESS 120 40
STDOUT 60 25
```

The `process.stdout` resize event saw the correct size. A second manual `SIGWINCH` also saw
60 by 25, after Bun had refreshed the cached stream dimensions.

The runtime path is:

1. `src/modules/terminal/OpenPty.ts:424` applies `TIOCSWINSZ`.
2. `node_modules/@opentui/core/chunk-bun-tkm837n2.js:7038` handles process `SIGWINCH` and
   reads `stdout.columns` and `stdout.rows`.
3. The OpenTUI resize path returns because those values still equal 120 by 40.
4. `src/modules/app/Bootstrap.ts:2617` never receives a renderer resize event.
5. `scripts/harness/PtyTestDriver.ts:344` resizes its emulator independently, so the frame
   becomes narrow while Invar's layout remains wide.

The correct fix belongs at the runtime resize seam. One likely direction is to use the
`process.stdout` resize event, which has fresh dimensions, and call OpenTUI's public renderer
resize path. An upstream OpenTUI change may be the cleaner form. A harness-only signal would
hide the same failure in a real Bun terminal and would not be a complete fix.

## Separate dock-growth finding

The existing #238 (Markdown preview stale after dock conceal) remount workaround can have a
different generator.

`scripts/harness/smoke-markdown-harness.ts:253` conceals the automatic right dock. It then
turns the preview off and on to remount it. The comment says the remount clears a stale
content viewport.

`src/modules/ui/RootView.ts:1106` prefers the previous positive layout-canvas width and
height over the renderer's fresh dimensions. It then applies the resolved old slot
geometry. `src/modules/markdown/MarkdownSplitView.ts:269` measures the width that its root
renderable currently has. A quiet parent layout change can therefore repaint the split from
old explicit geometry. A later model change or remount can clear it.

This is a strong explanation for the dock-growth workaround. It does not explain the
terminal-shrink reproduction yet, because the terminal resize never reached the renderer.
The two paths must be driven again after the runtime resize seam is fixed. The remount
workaround should be removed only when that second path settles without it.

## Contract needed for completion

Restore terminal-shrink coverage in
`scripts/harness/smoke-markdown-harness.ts`. The test must start with the default Markdown
split at 120 by 40, shrink through the PTY driver to 60 by 25, and wait on a changed
condition. It must prove all of these results:

- Published viewport width becomes 60.
- Source and preview remain visible in the final frame.
- The divider and pane rectangles stay inside the 60-column viewport.
- The same gesture works with the shared small and large fixtures.

The positive control must remove or disable the resize bridge. The restored smoke must then
fail because the published width remains 120. An assertion against emulator width alone is
not a valid control because the emulator already resizes during the defect.

The behavior conflicts with these records:

- `project.invariants.md`: **The terminal shows a bounded viewport**.
- `src/modules/layout/layout.invariants.md`: **Layout slots derive from one configuration**.
- `src/modules/markdown/markdown.invariants.md`: **A Markdown file offers a live source
  preview split**.

The mechanical invariant checker passed with 1,062 annotations, 217 lattice links, and zero
problems.

## Verification

- `bun test`: 1,854 passed, zero failed, across 288 files.
- `bun scripts/harness/smoke-markdown-harness.ts`: `ALL-PASS`.
- `bun scripts/harness/smoke-layout-harness.ts`: `ALL-PASS`.
- `git diff --check`: passed.
- `git status --short`: clean.

The green Markdown smoke is not evidence against the defect. It uses divider drag instead
of terminal shrink. It also keeps the #238 (Markdown preview stale after dock conceal)
remount workaround.

## Bycatch

- CONTRACT GAP: No record directly requires a successful PTY size change to reach the
  renderer with the same rows and columns. The terminal, layout, and Markdown records
  constrain the result, but none owns this runtime boundary. The real-PTY probe reproduced
  the gap in several isolated runs.
- DIAGNOSTIC GAP: `src/modules/terminal/OpenPty.ts:424` discards the `ioctl` return value. A
  failed `TIOCSWINSZ` would therefore look like this defect. It did not cause this run,
  because `stty size` confirmed 25 by 60. I did not change this separate diagnostic issue.
