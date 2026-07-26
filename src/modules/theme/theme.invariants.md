# Theme module invariants

This contract stands on `project.invariants.md`, especially *Terminal color and glyph support
varies* and *Appearance is data with a capability fallback*, sharpening both into the module-local
mechanisms the `theme` code actually enforces.

## Reality-based invariants

### Terminal capability can only be inferred from the environment

**Invariant:** If the theme resolves a color depth or glyph level, then the value comes from
environment heuristics (`COLORTERM`, `TERM`, `TERM_PROGRAM`, `LANG`, `NERD_FONT`) with a safe
default — never from a reliable in-band query, because terminals do not portably report their
own truecolor or nerd-font support.

**Scope:** `TerminalCapabilities.detectColorDepth` and `detectGlyphLevel`. Excludes explicit user
override through `Theme.setColorDepth` / `setGlyphLevel`, which replaces the inference.

**Renegotiable at:** project scope — *Terminal color and glyph support varies* in
`project.invariants.md` owns the wider claim; this record is its theme-module realization.

**Mechanism:** No standard escape sequence answers "do you render nerd glyphs" and color-depth
reporting is inconsistent, so detection reads env-var proxies and, when they are silent, falls to
a legible default (truecolor when `TERM` is unset, `unicode` on a UTF-8 `LANG`, else `ascii`).

**Generates:** The two capability ladders (a lossy detection MUST have a degrade path below it);
safe defaults over guessed maximums; user-overridable depth/level setters.

**Evidence:** `src/modules/theme/TerminalCapabilities.ts` (`detectColorDepth`, `detectGlyphLevel`
read only `Environment.Class.env(...)` and return a default).

**Impossible if true:** A color-depth or glyph-level value derived from an authoritative in-band
terminal query rather than an environment guess; detection that returns nothing (undefined) when
every env hint is absent. (Graphics-tier detection is DIFFERENT reality — graphics support IS
portably queryable in-band — and is governed by its own record below.)

**Verification:** Inspect `TerminalCapabilities.detectColorDepth` / `detectGlyphLevel` — every
branch reads an env var or returns a literal default; no I/O or terminal round-trip exists.

**Status:** provisional

**Last refined:** 2026-07-24

## Chosen invariants

### Graphics tier prefers the reported capability and degrades to cells

**Invariant:** If the image preview resolves a graphics tier, then the precedence is fixed:
`TUI_GRAPHICS_TIER` override → a positive OpenTUI graphics report, accepted even through a
multiplexer → half-block when a report has no rich capability → a tmux floor and conservative
env heuristics only when no report object exists → the half-block floor; and while OpenTUI
reports no rich capability the preview stays at half-block until a positive answer arrives.

**Scope:** `TerminalCapabilities.detectGraphicsTier` (the precedence), the `reportedGraphics`
ref, `capabilities` event wiring, and tier ladder ask in `RootView` (the consumption), plus
`PixelImageMount.sync` when the selected tier becomes richer. Unlike color depth and glyph
level, the primary signal here is OpenTUI's in-band query result — graphics support is the
capability terminals portably report (DA1 sixel flag, kitty graphics query), which is why
this record is not an instance of *Terminal capability can only be inferred from the
environment*.

**Mechanism:** `detectGraphicsTier(reported)` takes the report as a parameter (pure, testable);
it accepts a positive kitty or sixel answer before applying the multiplexer floor because a
reply received through a multiplexer proves passthrough worked. `RootView` holds the report
in a `shallowRef`; the renderer's `capabilities` event updates the ref, runs `update()` so
`PixelImageMount.sync` receives the new tier, and calls `renderer.requestRender()`. Env
heuristics run only on a null report; the floor is `halfblock`, which every terminal renders.

**Generates:** the kitty → sixel → half-block ladder in `ImageRenderers`; smokes that force any
tier via `TUI_GRAPHICS_TIER`; an unforced late-answer smoke; zero risk of graphics escapes
reaching a terminal after it has reported no graphics support.

**Rejected alternatives:** Poll, use a timer, or recheck on keypress — the capability event
already names the state transition, so those add latency and can leave an idle screen stale.

**Evidence:** `src/modules/theme/GraphicsTier.test.ts` (positive report through a
multiplexer, multiplexer silence, and override branches);
`scripts/harness/smoke-pixel-preview-harness.ts` (unforced half-block first, matching late
kitty reply, then placement without user input); `src/modules/ui/RootView.ts`
(`capabilities` event → `update()` → `renderer.requestRender()`).

**Impossible if true:** a kitty or sixel payload emitted because an env var guessed richer than
the terminal's own negative report; a positive kitty or sixel answer discarded only because
it arrived through a multiplexer; an image painted before the capability answer staying at
the half-block floor once the positive answer arrives; a second tier-precedence list outside
`detectGraphicsTier`.

**Verification:** `bun test src/modules/theme/GraphicsTier.test.ts && bun
scripts/harness/smoke-pixel-preview-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-26

### Appearance comes only from theme data

**Invariant:** If a rendered cell carries a color or glyph, then that value was read from the
active theme (a `Palette` field or a semantic `GlyphSlot` / `IconSet` / `ActionIconSet` /
`CheckboxIconSet` entry resolved through `Theme.Class`), never written as a literal hex or glyph at
the drawing site — the `theme` module is the single source of appearance.

**Scope:** All styled output across ui, editor, syntax, diagnostics, and git decorations, including
activity-bar and panel-heading control glyphs and the file-type marks the file tree and the
breadcrumb popup share. The sole home for color and glyph literals is `src/modules/theme`; consumers
pull tokens or name semantic slots, they do not mint appearance.

**Mechanism:** `Theme` exposes `palette`, `icons`, `actionIcons`, `checkboxIcons`, and `icon()`
as plain getters that re-derive from `PALETTES` and the icon tables on read. Its
`glyphVocabulary`/`glyph` surfaces resolve stable semantic slots through
`$interfaceGlyphVocabularies`; because the data is reactive selection, a palette, vocabulary, or
capability change reaches every consumer without changing behavior or copying appearance.

**Generates:** *The palette ladder quantizes color without leaving the palette*; *The glyph ladder
degrades icons single-cell and legible*; theme/icon-set plugin extension points; a single grep
boundary for auditing hard-coded appearance.

**Evidence:** `src/modules/theme/Theme.ts` (`palette`, `icons`, `actionIcons`, `checkboxIcons`,
`glyphVocabulary`, `glyph`, and `icon`); the color literals live only in `ThemePalettes.ts` and the
glyph literals only in `ThemeIcons.ts`; `src/modules/ui/BreadcrumbPicker.ts` resolves its row marks
through `Theme.icon` rather than restating the tree's table; `ThemeIcons.test.ts` verifies the
semantic slot ladder.

**Impossible if true:** A rendering component outside `src/modules/theme` naming a `#rrggbb`
color or a nerd/unicode glyph literal to draw with instead of reading it from `Theme.Class`; a
vocabulary swap requiring edits to activity switching or heading-control actions.

**Verification:** `grep -rnE "#[0-9a-fA-F]{6}" src --include=*.ts | grep -v modules/theme` returns
no drawing-site literal; `bun test src/modules/theme src/modules/ui/PanelHeading.test.ts`.

**Status:** provisional

**Last refined:** 2026-07-26

### The palette ladder quantizes color without leaving the palette

**Invariant:** If a palette is resolved for a terminal of a given depth, then it passes through
`quantizePalette(base, depth)`: `truecolor` is identity, `256` maps every hex to the xterm 6×6×6
cube, `16` maps every hex to the nearest ANSI-16 color — and the result is always a complete
`Palette` with the same semantic-token keys, only the hex values changing.

**Scope:** `ThemePalettes.quantizePalette` and the `Theme.palette` getter that calls it. Every
color a consumer reads has already been quantized to the active `colorDepth`.

**Mechanism:** `quantizePalette` clones the base and rewrites only string fields starting with
`#`; the token set is preserved because it copies the object and mutates values in place, so no
key is dropped and no non-`#` field is touched. `256` and `16` map into fixed lookup tables
(`cube`, `ANSI16`), so the emitted color is always one the terminal can render.

**Generates:** Depth-safe rendering (a 16-color terminal never receives a truecolor hex); a
single quantization chokepoint instead of per-consumer downsampling.

**Evidence:** `src/modules/theme/ThemePalettes.ts` (`$quantizePalette`, `to256Hex`, `to16Hex`,
`ANSI16`, `cube`); `truecolor quantization is identity`, `16-color quantization maps every color
into the ANSI-16 set`, and `256 quantization keeps hex shape` in
`src/modules/theme/__tests__/theme.test.ts`.

**Impossible if true:** A quantized palette missing a semantic key present in the source palette;
a color emitted at `16` depth that is outside the ANSI-16 set; a truecolor hex surviving into a
`256`- or `16`-depth render.

**Verification:** `bun test src/modules/theme -t "quantization"`

**Status:** provisional

**Last refined:** 2026-07-21

### The glyph ladder degrades icons single-cell and legible

**Invariant:** If an icon, action button, or checkbox glyph is resolved, then it is selected from
the set for the active glyph level (`nerd` → `unicode` → `ascii`); the `ascii` rung is always a
printable single-cell marker, and every action/checkbox glyph at every level is exactly one cell
so the git-panel hit-columns stay aligned; an unknown file extension resolves to `set.file`,
never empty or undefined.

**Scope:** `ThemeIcons.iconSetFor`, `actionIconsFor`, `checkboxIconsFor`,
`interfaceGlyphVocabularyFor`, `glyphFor`, and `iconFor`, plus the `Theme` getters that call them.
Covers file-tree and breadcrumb-popup file icons, git changes-row action buttons, staging checkboxes,
activity-bar items, and panel-heading controls.

**Mechanism:** The `SETS`, `ACTION_ICONS`, and `CHECKBOX_ICONS` tables are keyed by `GlyphLevel`,
and `$interfaceGlyphVocabularies` maps every `GlyphSlot` at each level, so selection is a total
lookup with no missing rung. The `ascii` entries remain printable; action, checkbox, activity, and
panel-control glyphs are authored as one cell each, as are the `folderOpen`, `folderClosed`, and
`file` defaults; `iconFor` falls back through `set.ext[extension] ?? set.file` so it always returns
a printable string. The unicode EXTENSION map deliberately keeps wide pictographs (`🔒`, `🖼`), so a
consumer that puts icons in a column sizes that column to the widest icon in its item set instead of
assuming one cell.

**Generates:** Legible output on a no-nerd-font terminal; stable click hit-zones because button
and checkbox columns never shift width between capability levels.

**Evidence:** `src/modules/theme/ThemeIcons.ts` (`$sets`, `$actionIcons`, `$checkboxIcons`,
`$interfaceGlyphVocabularies`, `iconSetFor`, `glyphFor`, `iconFor`); `icon fallback ladder`,
`unicode icon set resolves known extension and falls back for unknown`, `checkbox icons ladder`,
`git action icons ladder`, and `semantic interface glyph slots resolve through every capability
tier` in `src/modules/theme/ThemeIcons.test.ts`.

**Impossible if true:** An `ascii`-level render emitting a nerd or multi-cell glyph; an
action/checkbox glyph wider than one cell at any level; a `folderOpen`, `folderClosed`, or `file`
default wider than one cell; `iconFor` returning empty or undefined for an unknown extension; an
activity or panel control choosing its glyph literal in behavior code; two activity or panel slots
resolving to the same glyph at one tier; an activity glyph colliding with a reserved diff, dirty,
separator, or overview mark.

**Open question:** The unicode extension map paints `●` for `.js`/`.jsx`, which is also the reserved
DIRTY marker, and `⑂` for git files, which is also the Source Control activity glyph. Neither pair
shares a column today, so no row is ambiguous, but the reserved-mark table does not record either
conflict. Pre-existing in the tree's icon set; inherited unchanged when the breadcrumb popup started
reusing that set on 2026-07-26.

**Verification:** `bun test src/modules/theme/ThemeIcons.test.ts && bun
scripts/harness/smoke-activitybar-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-26
