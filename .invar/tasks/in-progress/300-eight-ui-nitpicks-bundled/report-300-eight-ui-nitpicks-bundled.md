# READY — ten UI nitpicks bundled

State: READY

Branch: `fleet/300-eight-ui-nitpicks-bundled`

Merge commit: `6ecbc17e7c568187fcb3b176c2d89d18af2a2311`

Enforcing hook: `"GATE_EXIT=0"`

Git status: clean. `git status --porcelain=v1` returned no output.

The bundle is complete. The worktree is clean. Commit `0803e2f7` from
`main` is an ancestor of this branch, so the final gate used the
task-pollution fix.

## Depth menu follows the current value — #300

[Record](../../active/300-depth-menu-highlights-wrong-row/task-300-depth-menu-highlights-wrong-row.md)

Commit: `0359c8a226df6f6be30c64fe4d49cb9de085681c`

The shared context menu now accepts an initial selection. The structure
depth menu derives the initial highlight and edge marker from the
current depth. It no longer writes `(current)` in the row text. PTY
drives opened two depths, moved from each selected row, and chose the
highlighted value with Enter. Dark and light cells use the activity
indicator color. A planted row-zero default made the contract red.

## Status bar author and project chrome — #302

[Record](../../active/302-statusbar-git-user-icon-and-spacing/task-302-statusbar-git-user-icon-and-spacing.md)

Commit: `5b36cec3830f9221e088047e7928891bff709867`

The author segment now reads the shared user glyph tier. Its cells are
Nerd ``, Unicode `♙`, and ASCII `@`. The segment keeps one cell from
the edge. The project name lost its extra leading cell. The selected
Nerd agent cell is `` (`nf-fa-magic`); Unicode stays `✦`, and ASCII
stays `A`. PTY and unit checks cover both themes and all glyph tiers.
Planted old spacing and glyph values made the checks red.

## Smaller settings and shortcut dialogs — #303

[Record](../../active/303-shortcuts-settings-dialog-margins/task-303-shortcuts-settings-dialog-margins.md)

Commit: `062038f7940318321d254a6dff02e6ae4a4a53d8`

The shared overlay geometry now reserves content-based width and
preferred canvas margins. Settings and shortcut dialogs use that seam.
At 120 by 40, a 78-cell dialog starts at column 21 and row 3 and keeps
three rows above and below. Small terminals reduce the margins before
they remove the last content cell. PTY drives covered two geometries,
both themes, internal scrolling, and close behavior. Planted
full-canvas geometry made the checks red.

## One semantic structure glyph — #304

[Record](../../active/304-structure-row-marks-and-line-suffix/task-304-structure-row-marks-and-line-suffix.md)

Commit: `c3e29ef5ccea1b4f7b2334175f52777082358792`

Structure rows now paint all semantics on the one kind glyph. Driven
cells included `ƒ publicVisible`, `ƒ privateVisible`, `▪ #hashPrivate`,
`▪ $cachedGetter`, and `ƒ overriddenArm`. Color, bold, underline, and
italic styling retain the former meanings without another glyph
column. One space separates the glyph and name. Line numbers default
off. The setting restores them as `name 49`, without a colon. The PTY
contract covered both setting states and semantic classes. Planted
extra marks and old line suffixes made it red.

## Compact shared hierarchy indent — #306

[Record](../../active/306-tree-indent-one-key-tighter/task-306-tree-indent-one-key-tighter.md)

Commit: `2f17e6b5d3cb7fd9539cd20385e4a94f65c28343`

File-tree and structure rows now use
[one hierarchy-indent generator](../../../../src/modules/ui/HierarchicalRowIndent.ts).
Depths zero through four produce zero through four cells. Three-level
PTY frames show each child one cell closer than before. Expand,
collapse, selection, and pointer targets remain active in both panes.
The checks covered small and large fixtures. A planted two-cell step
made the arithmetic contract red.

## Markdown preview action on the breadcrumb — #307

[Record](../../active/307-markdown-toggle-moves-to-breadcrumb-row-right/task-307-markdown-toggle-moves-to-breadcrumb-row-right.md)

Commit: `3e6490cf31d5e0567086078197af71e11ca7c407`

The preview action now occupies the breadcrumb row's right edge. The
buffer-tab row no longer paints it. Long paths yield their cells to the
action. Pointer and shortcut toggles work at narrow and wide widths on
500-line and 100,000-line files. A planted old-width reservation
changed the expected position from column 24 to 27 and made the
contract red.

## Markdown preserves authored heading gaps — #309

[Record](../../active/309-markdown-no-blank-line-before-headline/task-309-markdown-no-blank-line-before-headline.md)

Commit: `1b1866e751492e9f0e49a04c17c7552f5e785fb5`

The stylesheet now preserves source gaps before headings. It adds no
synthetic row. A document-leading heading starts on the first preview
body row. Adjacent content stays adjacent, while one authored blank
line stays one blank line. The PTY contract covers H1 through H6 at
500 and 100,000 lines. A planted heading spacer made it red.

## One Markdown heading accent — #310

[Record](../../active/310-markdown-title-blue-like-subtitles/task-310-markdown-title-blue-like-subtitles.md)

Commit: `f68b7c03992e18323275b759d29b4daa20398552`

H1 through H6 now resolve the same theme `accent` foreground. Their
existing weight remains unchanged. Truecolor PTY cells matched in
dark, live light, and restored dark themes at both scales. The former
H1 `keyword` color was absent. A planted H1 divergence made the
contract red.

## One close glyph for panel lists and tabs — #316

[Record](../../active/316-terminal-list-close-icon-matches-tabs/task-316-terminal-list-close-icon-matches-tabs.md)

Commit: `cd7abe3791e3c2d328738c583b16e86d6bff3a27`

Terminal-list rows, editor tabs, and the bottom-panel close button now
read `panelClose` from one glyph vocabulary. Nerd and plain-tier PTY
frames show the same token in all three places. The literal terminal
row `x` is absent. Pointer input still closes the selected terminal.
A planted divergent terminal glyph made the cross-component check
red.

## Uniform rounded Markdown code fences — #318

[Record](../../active/318-markdown-code-fence-uniform-background/task-318-markdown-code-fence-uniform-background.md)

Commit: `4410e6a9ccf4070b36b0e1bc09363d11d9955042`

The Markdown stylesheet now gives code headers, body rows, and footers
one theme `selectionMuted` background. The painter applies it per row
and per cell. The language label uses the readable theme foreground.
Surrounding prose does not receive the code background. The shared
code-frame vocabulary now supplies `╭`, `╮`, `╰`, and `╯`.

Truecolor PTY checks matched every cell from the left through right
border in dark, live light, and restored dark themes. They ran on
500-line and 100,000-line fixtures. A planted transparent header made
the stylesheet check red.

## Verification

- Final merge-commit hook: `GATE_EXIT=0`.
- The clean run passed all 63 parallel PTY smokes. No step passed only
  on retry.
- The serial behavioral contracts, agent-permissions smoke,
  overlay-dialog smoke, and input-byte ordering check passed.
- `bun test` passed inside the final hook.
- `bun run typecheck` passed.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`
  resolved 1,151 annotations and 220 lattice links with zero problems.
- The affected Markdown harness passed in isolation before the final
  gate. It covered both scales and all live theme transitions.
- The merge kept the landed persistent Markdown view mode and named
  command-action API. It also kept the bundled breadcrumb action and
  shared close glyph. The Markdown, Markdown view-mode, tabs,
  panel-split, and panel-chrome PTY smokes passed before the full gate.

The first final-gate attempt sampled the pre-existing heading-spacing
assertion before its frame had settled. The isolated harness was green.
The wait now observes the heading layout and the new code markers in
the same settled frame. The next full gate was clean.

## Bycatch

- Current `main` added the context-usage skill without adding it to the
  required `AGENTS.md` skills index. The conventions gate caught it.
  Merge commit `6ecbc17e7c568187fcb3b176c2d89d18af2a2311` adds the missing
  when-to-use line.
- The final input-byte instrument reported p50 7.583 ms against the
  reviewed 4.928 ms baseline. The gate classified this as a
  non-blocking trend warning.
- An 80 by 24 structure drive once showed `ready` with five rows while
  the pane said `No file is open`. Clicking the depth control did not
  open it. This was one observation and was not reproduced.
- One Markdown run painted `Parsing Markdown…` after the published
  parsing status was false. The immediate isolated rerun was clean.
- Earlier per-task hooks had isolated resource-starvation reds in the
  fold-density, overlay-dialog, scrollbars, and panel-chrome smokes.
  Each affected smoke passed on its immediate retry. The final full
  gate passed them without retries.
- [OverlayCloseButton.ts](../../../../src/modules/ui/OverlayCloseButton.ts)
  still carries an inline `✕`. It is a sibling ad hoc close glyph
  outside the three consumers in terminal-list close glyph matching
  (#316).
- At 120 by 40, a horizontally overflowing code fence let the
  scrollbar overlay erase one character in each preview and source
  row. The frame showed `S ale fixture` and `B fore…`. The steps were:
  open the scale Markdown fixture, conceal the right dock, add
  `open docs/index.html`, and keep horizontal overflow active. It was
  observed once. It did not recur after widening the dedicated
  code-fence drive to 180 columns. The fence task did not change the
  scrollbar.
