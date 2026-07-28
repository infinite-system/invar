# Icon mechanism READY

Branch: `feat-icon-mechanism`

Commit: `8af3077` (`Add semantic glyph slots and panel control hover help`)

## Slot indirection

`ThemeIcons` now owns an `InterfaceGlyphVocabulary` at each existing
`GlyphLevel` (`nerd`, `unicode`, `ascii`). Activity behavior names semantic
slots such as `activityFiles` and `activitySourceControl`; panel-heading
projection names slots such as `panelAdd`, `panelExpand`, `panelRestore`, and
`panelClose`. `Theme.glyph` and `Theme.glyphVocabulary` resolve those slots
through the active capability tier.

The current glyph vocabulary was preserved. Changing any activity or heading
glyph is now a one-line data edit in `$interfaceGlyphVocabularies`; input,
projection, and hit behavior do not change.

The slot vocabulary also contains activity-search and activity-settings so the
user's eventual five-item vocabulary can be applied without another mechanism
change.

## Existing surfaces reused

- Panel headings point the existing shared `Tooltip` model; the existing
  `OverlayLayer` continues to render it through the hit-transparent
  `HitTransparentText`. No second tooltip or tooltip renderable was added.
- Heading hover uses the existing `palette.cursorLine` background used by
  breadcrumb/control segments and the existing accent foreground treatment.
- `PanelHeadingProjection` remains the single paint/hit geometry authority; its
  control segments now also carry tooltip labels.
- Glyph slots use the existing `GlyphLevel` and nerd → unicode → ascii
  capability ladder.
- Close rests in `palette.fg`, not `palette.error`, and receives the same hover
  treatment as Add and Expand/Restore.

## Driven proof

The PTY harness observes emulator cells for Add, Expand, Restore, and Close.
For each state it requires the named tooltip, changed attributes on the hovered
control, and unchanged attributes on an un-hovered sibling in the same frame.
It also requires Close's foreground to equal the ordinary dark-theme
foreground and not the error/red role.

The activity-bar harness launches the real app at nerd, unicode, and ascii
glyph levels and requires each files/source-control/extensions slot fallback in
the observed grid.

Final repeated smoke exits:

- `smoke-panel-chrome-harness.ts`: run 1 = 0, run 2 = 0, run 3 = 0
- `smoke-activitybar-harness.ts`: run 1 = 0, run 2 = 0, run 3 = 0

Post-commit required gates:

- `bunx tsc --noEmit`: 0
- `bun test`: 0 (1,344 passed, 0 failed)
- `bun scripts/check-file-grammar.ts`: 0
- invariant checker `--all`: 0
- invariant checker `--refs`: 0
- `bash scripts/conventions-gate.sh`: 0
- `bun scripts/check-coverage-ratchet.ts`: 0

## Vocabulary preview and exclusions

Rendered candidates: `/tmp/icon-vocabulary-previews.txt`

The preview contains three complete candidate vocabularies for activity
(tree, git, plugins, search, settings) and heading controls (add, expand,
restore, close), each rendered at nerd, unicode, and ascii tiers.

Disqualified and dropped:

- `📁`, `🔍`, and `＋`: two cells under
  `EditorCoordinates.Class.lineWidth`.
- `●`: duplicates the existing dirty marker.
- `▎`: duplicates the existing diff marker.
- `❯`: duplicates the existing powerline/tab separator fallback.

Every glyph retained in the three preview sets measures one cell with Invar's
production display-width authority.

The vocabulary choice is deliberately left to the user. No candidate set was
selected or landed.
