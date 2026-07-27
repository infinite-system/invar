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
`TUI_GRAPHICS_TIER` harness/CI override → the persisted `graphicsTier`
declaration → automatic selection when the declaration is `auto`; automatic
selection accepts a positive OpenTUI graphics report even through a
multiplexer, uses half-block when a report has no rich capability, and uses a
tmux floor plus conservative env heuristics only when no report object exists.
While `auto` is selected and OpenTUI reports no rich capability, the preview
stays at half-block until a positive answer arrives.

**Scope:** `TerminalCapabilities.detectGraphicsTier` (the precedence), the `reportedGraphics`
ref, host `graphicsTier` setting schema, `capabilities` event wiring,
and tier ladder ask in `RootView` (the consumption), plus
`PixelImageMount.sync` when the selected tier changes. Unlike color depth and
glyph level, the primary automatic signal here is OpenTUI's in-band query
result — graphics support is the capability terminals portably report (DA1
sixel flag, kitty graphics query), which is why this record is not an instance
of *Terminal capability can only be inferred from the environment*.

**Mechanism:** `Settings` defines `graphicsTier` as a host reactive field with
`auto` as its default, sanitizer, persistence key, and Appearance-section panel
descriptor. `RootView` reads that cell on every image projection.
`resolveGraphicsTier(declared, reported)` keeps the environment override above
that declaration and delegates `auto` to the same report-based detector. The
detector accepts a positive kitty or sixel answer before applying the
multiplexer floor because a reply received through a multiplexer proves
passthrough worked. `RootView` holds the report in a `shallowRef`; the
renderer's `capabilities` event updates the ref, runs `update()` so
`PixelImageMount.sync` receives the new tier, and calls
`renderer.requestRender()`. Env heuristics run only on a null report; the
floor is `halfblock`, which every terminal renders.

**Generates:** the kitty → sixel → half-block ladder in `ImageRenderers`; smokes that force any
tier via `TUI_GRAPHICS_TIER`; a visible, persisted, live-applying declaration;
an unforced late-answer smoke; zero risk of graphics escapes reaching a
terminal after it has reported no graphics support.

**Rejected alternatives:** Poll, use a timer, or recheck on keypress — the capability event
already names the state transition, so those add latency and can leave an idle screen stale.

**Evidence:** `src/modules/theme/GraphicsTier.test.ts` (positive report through a
multiplexer, multiplexer silence, persisted-declaration precedence, and
override branches); `scripts/harness/smoke-pixel-preview-harness.ts` (unforced
half-block first, matching late kitty reply, live downgrade, and same-HOME
restart at small and large scale); `src/modules/settings/Settings.ts` and
`SettingsPanel.ts` (host schema, persistence, and visible descriptor);
`src/modules/ui/RootView.ts` (`capabilities` event → `update()` →
`renderer.requestRender()`).

**Impossible if true:** a kitty or sixel payload emitted because an env var guessed richer than
the terminal's own negative report; a positive kitty or sixel answer discarded only because
it arrived through a multiplexer; an image painted before the capability answer staying at
the half-block floor once the positive answer arrives while `auto` is selected;
a saved explicit tier changing across restart; a live downgrade leaving the
previous kitty placement on screen; a second tier-precedence list outside
`TerminalCapabilities`.

**Verification:** `bun test src/modules/theme/GraphicsTier.test.ts && bun
scripts/harness/smoke-pixel-preview-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-27

### Appearance comes only from theme data

**Invariant:** If a rendered cell carries a color or glyph, then that value was read from the
active theme (a `Palette` field or a semantic `GlyphSlot` / `SymbolClass` / `ActionIconSet` /
`CheckboxIconSet` entry resolved through `Theme.Class`), never written as a literal hex or glyph at
the drawing site — the `theme` module is the single source of appearance.

**Scope:** All styled output across ui, editor, syntax, diagnostics, and git decorations, including
activity-bar, panel-heading, and editor-fold control glyphs and the file-type marks the file tree and
the breadcrumb popup share. The sole home for color and glyph literals is `src/modules/theme`;
consumers pull tokens or name semantic slots, they do not mint appearance.

**Mechanism:** `Theme` exposes `palette`, `symbolMarks`, `actionIcons`, `checkboxIcons`,
`symbolMark()`, and `icon()` as plain getters that re-derive from `PALETTES` and the mark table on
read. Its
`glyphVocabulary`/`glyph` surfaces resolve stable semantic slots through
`$interfaceGlyphVocabularies`; because the data is reactive selection, a palette, vocabulary, or
capability change reaches every consumer without changing behavior or copying appearance.

**Generates:** *The palette ladder quantizes color without leaving the palette*; *The glyph ladder
degrades icons single-cell and legible*; *One table resolves every symbol mark*; theme/icon-set
plugin extension points; a single grep boundary for auditing hard-coded appearance.

**Evidence:** `src/modules/theme/Theme.ts` (`palette`, `symbolMarks`, `actionIcons`,
`checkboxIcons`, `glyphVocabulary`, `glyph`, `symbolMark`, and `icon`); the color literals live only
in `ThemePalettes.ts` and the glyph literals only in `ThemeIcons.ts`; `src/modules/ui/BreadcrumbPicker.ts`
and `src/modules/ui/CompletionPopup.ts` both resolve their row marks through the theme rather than
restating a table; `ThemeIcons.test.ts` verifies the semantic slot ladder. The one known breach is
`src/modules/ui/TabBarRenderer.ts`, which writes the dirty/active tab marker `●` as a literal instead
of naming a slot.

**Impossible if true:** A rendering component outside `src/modules/theme` naming a `#rrggbb`
color or a nerd/unicode glyph literal to draw with instead of reading it from `Theme.Class`; a
vocabulary swap requiring edits to activity switching or heading-control actions.

**Verification:** `grep -rnE "#[0-9a-fA-F]{6}" src --include=*.ts | grep -v modules/theme` returns
no drawing-site literal; `bun test src/modules/theme src/modules/ui/PanelHeading.test.ts`.

**Status:** provisional

**Last refined:** 2026-07-26

### One table resolves every symbol mark

**Invariant:** If a surface paints a mark for a CLASSIFIED THING — a file-tree row, a breadcrumb
popup row, a completion item — then it classifies that thing into a `SymbolClass` and reads the mark
from the one per-tier table `ThemeIcons.$symbolMarks`; no consumer carries a second mark table, and no
consumer maps its own domain vocabulary (a file extension, an LSP `CompletionItemKind`) straight to a
glyph.

**Scope:** `ThemeIcons.$symbolMarks`, `$symbolClassesByFileExtension`, `symbolMarksFor`,
`symbolMarkFor`, `symbolClassForFileEntry`, and `iconFor`; the `Theme.symbolMarks` / `symbolMark` /
`icon` surfaces; `CompletionItemKinds.symbolClassFor`; and the three consumers — the file tree through
`Theme.icon`, `BreadcrumbPicker`, and `CompletionPopup`. Excludes the CONTROL vocabularies
(`InterfaceGlyphVocabulary`, `ActionIconSet`, `CheckboxIconSet`, `FindIconSet`), whose slots name
affordances rather than classified things and are governed by *Appearance comes only from theme data*.

**Mechanism:** Both consumers ask one question — *given a classified thing, what one-cell mark
represents it at the terminal's current capability tier* — so the shared authority is not the
file-shaped `iconFor(set, name, isDirectory, open)` signature, which is one consumer's classifier
fused to the resolver. Splitting the two leaves a single total table `Record<GlyphLevel,
Record<SymbolClass, string>>` plus two classifiers, each in the module that owns its domain: extension
and directory shape → class in `theme`, LSP kind number → class in `lsp`. `iconFor` becomes the
composition of the filesystem classifier with the resolver, so the tree's call-site shape survives
while its table does not. Because `SymbolClass` is a closed union and the table is a `Record` over it,
TypeScript makes an unmarked class unwritable rather than merely untested. The kinds that ARE
filesystem things (`File`, `Folder`) classify to the classes the tree already uses, so a path
completion and the row it would open carry one mark by construction.

**Generates:** A completion popup that gets kind marks as a wire-up rather than a vocabulary;
appearance changes that reach every list at once; the family grouping (callable / type / value /
module / syntax / unclassified) as data a reader can audit in one place; per-item cost that is one
property read on a rebuild and zero on a paint frame, because the tier's whole mark row is read once
per rebuild.

**Rejected alternatives:** A `CompletionItemKind → glyph` switch inside the popup — two vocabularies
that drift on the first theme change, and the exact thing the user ruled out by asking for icons
"resolved the same way the list tree resolves them". Keeping the extension-keyed `IconSet` and
deriving marks from it — an extension key cannot express a code symbol, so completion would still
need its own table. Adding an optional kind parameter to `iconFor` — filesystem arguments carried by a
caller that has no filesystem, and the fused resolver stays fused. Folding the LSP kind table into
`theme` — the theme would then own protocol numbers it cannot verify, and the classifier belongs with
the client that receives them.

**Evidence:** `src/modules/theme/ThemeIcons.ts` (`$symbolMarks`, `symbolMarkFor`,
`symbolClassForFileEntry`, `iconFor`); `src/modules/lsp/CompletionItemKinds.ts` (all 25 protocol kinds
→ symbol classes, choosing no glyph); `src/modules/ui/CompletionPopup.ts` (`popupItems` reads
`theme.symbolMarks` once, then one lookup per item); `the symbol-mark table resolves every class at
every tier` and `a filesystem entry classifies before any mark is chosen` in
`src/modules/theme/ThemeIcons.test.ts`; `a path completion carries the mark the file tree paints for
that path` in `src/modules/lsp/CompletionItemKinds.test.ts` (the cross-consumer claim: the tree's mark
is fetched through the tree's own entry point, so a second resolver would break agreement);
`scripts/harness/smoke-completion-harness.ts` reads the marks out of the emulator grid beside a real
tsgo member access, with the expectations resolved through the classifier and the theme rather than
pasted.

**Impossible if true:** A file extension, directory flag, or `CompletionItemKind` mapped straight to a
glyph outside `$symbolMarks`; a second per-tier mark table anywhere in the product; a completion item
whose kind resolves to no mark, or to a mark for one tier only; an LSP `File` or `Folder` completion
marked differently from the tree row for the same thing; a per-item theme resolution on the popup's
paint path.

**Verification:** `bun test src/modules/theme/ThemeIcons.test.ts
src/modules/lsp/CompletionItemKinds.test.ts src/modules/ui/BreadcrumbPicker.test.ts && bun
scripts/harness/smoke-completion-harness.ts`; `grep -rn 'symbolMarkFor\|symbolMarksFor' src --include=*.ts`
shows every mark read passing through `ThemeIcons`.

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

**Invariant:** If an icon-cell glyph is resolved, then it is selected from the
row for the active glyph level (`nerd` → `unicode` → `ascii`), measures the
same width in the app and terminal, and renders in exactly one cell. The
`ascii` rung is always printable, and an unknown file extension or completion
kind resolves to a printable class, never to empty or undefined.

**Scope:** `ThemeIcons.symbolMarksFor`, `symbolMarkFor`,
`symbolClassForFileEntry`, `iconFor`, `actionIconsFor`, `checkboxIconsFor`,
`activityIconsFor`, `interfaceGlyphVocabularyFor`, `glyphFor`, `findIconsFor`,
`tableBordersFor`, the status-bar icon accessors, `alertIconFor`,
`agentTranscriptIconsFor`, and `tabSeparatorFor`, plus the `Theme` getters that call them.
Covers file-tree,
breadcrumb-popup, and completion-popup marks, git changes-row action buttons,
staging checkboxes, activity-bar items, panel-heading controls, editor fold
controls, find controls, status affordances, agent transcript cells, alerts,
tab separators, and Markdown table borders.

**Mechanism:** `$symbolMarks`, `$actionIcons`, and `$checkboxIcons` are keyed
by `GlyphLevel`, and `$symbolMarks` and `$interfaceGlyphVocabularies` each map
EVERY key at each level, so selection is a total lookup with no missing rung —
a `Record<SymbolClass, string>` makes a missing mark a type error rather than
an undefined cell. The `ascii` entries remain printable; icon-cell glyphs are
authored as one cell each; the classifiers fall back (`?? 'file'`,
`?? 'unclassified'`) so a resolve always returns a printable string. The
full-vocabulary width test enumerates every public `ThemeIcons` surface at
every tier, compares `EditorCoordinates.lineWidth` with the independent
`@xterm/headless` cursor advance, and rejects either a disagreement or a
terminal-rendered double-cell glyph. There is no exception list: adding an
emoji-presentation or wide mark fails the test immediately. The `foldOpen`
and `foldClosed` interface slots are one cell because the number-gutter edge
is one exact mouse hit column. `TableBorderGlyphSet` keeps the five matching
table-border joints in one tiered vocabulary. Which mark a slot may take is decided by
`$markOwnerships` — the marks that can meet, each paired with the surface that
means something by it, derived from the vocabularies that paint them — under
the rule that a mark may be shared only by owners meaning the SAME thing.

**Generates:** Legible output on a no-nerd-font terminal; stable click
hit-zones because button, checkbox, and fold-control columns never shift width
between capability levels; file-tree, breadcrumb, and completion mark columns
of exactly one cell at every tier; a closed width class without per-glyph
exceptions.

**Evidence:** `src/modules/theme/ThemeIcons.ts` (`$symbolMarks`,
`$actionIcons`, `$checkboxIcons`, `$interfaceGlyphVocabularies`,
`symbolMarkFor`, `glyphFor`, `iconFor`); `icon fallback ladder`, `unicode icon
set resolves known extension and falls back for unknown`, `checkbox icons
ladder`, `git action icons ladder`, `semantic interface glyph slots resolve
through every capability tier`,
`fold controls agree on one cell across app and terminal width authorities`,
`markdown table borders are single-cell and unclaimed as semantic marks`,
`every code-symbol mark is one display cell at every tier`, `the code-symbol
families stay pairwise distinct including at the ascii rung`, `every shared
mark is declared, and every declaration is still real`, `the mark-sharing
detector reports a collision when one exists` (the synthetic-list positive
control), `the javascript mark is not the dirty tab marker`, and `every theme
glyph agrees and avoids double-cell rendering` in
`src/modules/theme/ThemeIcons.test.ts` — the last enumerates every vocabulary
surface, compares the app's width authority (`EditorCoordinates.lineWidth`,
OpenTUI's table) against an independent one (`@xterm/headless` behind
`TerminalEmulator`), and carries a wide-glyph positive control so it can fail
toward two.

**Rejected alternatives:** Keep a known-width exception list — it preserves
the defect and grows whenever another emoji-presentation mark lands. The full
vocabulary is now the authority: every entry is enumerated, disagreement and
double-cell rendering are both forbidden, and the wide-glyph positive control
proves the detector can fail toward two.

**Open question:** Should shell scripts and configuration files move from the
settings gear to the distinct marks recommended in the proposal below?

#### Proposal for distinct shell-script and configuration marks

This proposal changes no shipped mark. The source-derived owner query
`ThemeIcons.Class.markOwnersFor('⚙')` reports:

| Mark | Owner | Collision in a classified-mark column |
| --- | --- | --- |
| `⚙` | `activity: Settings` | No; activity chrome |
| `⚙` | `the status-bar settings affordance` | No; status chrome, same settings meaning |
| `⚙` | `symbol class: shellScript` | Yes; the file-tree, breadcrumb, and completion mark column |
| `⚙` | `symbol class: configuration` | Yes; the same column as `shellScript` |

The existing verified Nerd Font marks remain `U+F489` for shell scripts and
`U+E6B2` for configuration. Each candidate below is a Unicode-tier pair; at
the ASCII tier every pair honestly degrades to `$` and `:`. No candidate is
in the Geometric Shapes block, present in `$markOwnerships`, reserved by the
editor-mark table, or in the activity row `≡ ⑂ ⌕ ⚙ ⧫`.

| Pair | Shell-script mark | YAML/configuration mark | Why it reads correctly |
| --- | --- | --- | --- |
| A | `$` — `U+0024 DOLLAR SIGN` | `:` — `U+003A COLON` | `$` is the Unix shell prompt; `:` is YAML's key/value delimiter. Both remain truthful ASCII fallbacks. |
| B | `⌘` — `U+2318 PLACE OF INTEREST SIGN` | `☷` — `U+2637 TRIGRAM FOR EARTH` | `⌘` is widely read as “command”; `☷` has three strong horizontal rows that read as a settings list. The tradeoff is the Mac association of `⌘` and the formal trigram meaning of `☷`. |
| C | `⏵` — `U+23F5 BLACK MEDIUM RIGHT-POINTING TRIANGLE` | `≔` — `U+2254 COLON EQUALS` | The solid triangle reads as “run”; colon-equals reads as a key/value assignment. The tradeoff is that “run” is broader than “shell script,” and `≔` is less familiar than a plain colon. |

Measured with the same two authorities as the exhaustive vocabulary test:
`EditorCoordinates.lineWidth` for the app and `@xterm/headless` through
`TerminalEmulator` for terminal cursor advance. The wide control proves the
run can report two:

```text
control 漢 U+6F22 app=2 xterm=2
pair A shell $ U+0024 app=1 xterm=1
pair A config : U+003A app=1 xterm=1
pair B shell ⌘ U+2318 app=1 xterm=1
pair B config ☷ U+2637 app=1 xterm=1
pair C shell ⏵ U+23F5 app=1 xterm=1
pair C config ≔ U+2254 app=1 xterm=1
nerd shell  U+F489 app=1 xterm=1
nerd config  U+E6B2 app=1 xterm=1
```

Recommendation — accept Pair A. It names the two families through syntax
users already see in shell and YAML files, has no platform-specific reading,
uses no font-dependent code point, and keeps the same meaning when repeated
as the ASCII fallback. Pair B is more decorative but semantically less exact;
Pair C is solid and measurable but reads as execution and assignment rather
than specifically shell and YAML.

If accepted, the implementation is mechanical:

- `src/modules/theme/ThemeIcons.ts:70,80` — replace the two Unicode `⚙`
  entries; `:106,113` — replace the blank ASCII entries with `$` and `:`;
  `:263-271` — remove the now-stale declared `⚙` sharing. Keep the verified
  Nerd Font entries at `:37,44`.
- `src/modules/theme/ThemeIcons.test.ts:324-370` — update the pinned Unicode
  and ASCII rows; near `:462-472` — pin that shell, configuration, and Settings
  have distinct meanings and marks. The exhaustive width test at `:515-562`
  will automatically exercise all three tiers.
- `src/modules/theme/theme.invariants.md:325` — replace this pending proposal
  with the accepted choice and its measured rationale.
- `project.coverage-deltas.md` — record any assertion-count change if the
  focused regression adds an assertion.

Do you accept Pair A — `$` for shell scripts and `:` for YAML/configuration at
the Unicode and ASCII tiers, while retaining the verified Nerd Font marks?

**Impossible if true:** An icon-cell glyph wider than one cell at any level;
any theme glyph whose app-measured width disagrees with terminal cursor
advance; a file-tree or breadcrumb filename starting in a different column
because of its icon; `iconFor` or `symbolMarkFor` returning empty or undefined
for an unknown extension or kind; an activity or panel control choosing its
glyph literal in behavior code; two activity or panel slots resolving to the
same glyph at one tier; a mark carried by two surfaces that mean different
things by it, or carried by two surfaces without a recorded reason; a recorded
sharing reason that outlives the sharing it describes.

**Verification:** `bun test src/modules/theme/ThemeIcons.test.ts && bun
scripts/harness/smoke-activitybar-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-27
