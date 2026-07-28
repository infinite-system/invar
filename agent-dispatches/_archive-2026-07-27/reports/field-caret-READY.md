# READY — One painter for single-line text fields (#88)

Worktree `/tmp/conductor-caret`, branch `feat-field-caret-focus`, commit **`77d3e3c`** on base
`72dca35`. Worktree clean; `git ls-files | grep '^TASK'` returns nothing.

## Diagnosis — verified, and it was worse than "two states"

Confirmed as stated: `BoundedListPopup` already imports `TextInputModel` (line ~15), owns
`queryInput` (~56), and built its search row at ~497 with `searchHovered ? accent : border`. So the
field had two visual states and discarded the model's caret.

One sharpening: the bug is not "focus has no tone" but **the always-focused field painted the IDLE
tone**. The popup search row is the query owner for its whole visible life (`acceptsQueryInput` =
`open && searchEnabled`), so the muted `border/dim` the user saw at rest *was* the focused field —
which is exactly why it read as inert.

## The generator

`src/modules/ui/TextFieldPainter.ts` (Static) + `TextFieldPainter.test.ts`.

- `paint(context)` — text window, caret cell, tone, padding → `{chunks, caretColumn, caretWidth,
  paintedWidth}`. Takes the input **MODEL** (`TextInputModel.Model`), never a caret index, so a
  painted caret cannot be re-derived. `width: number | null` (fixed field vs. a field flowing inside
  a longer line).
- `toneFor(palette, state)` — the three tones.
- `stateFor({focused, hovered})` — the single place where **hover outranks focus**.

### Fields that now consume it

| Field | What it takes | Reachable states |
|---|---|---|
| `BoundedListPopup` search row | fixed width, caret, tone; publishes `queryCaretCell` | focused, hovered |
| Command-palette input (`OverlayLayer`) | inline width, caret, tone | focused |
| Quick Open input (`OverlayLayer`) | inline width, caret, tone (alert chunk still appended) | focused |
| `FindBarRenderer` query + replacement | inline width, caret, tone | focused, idle |

Four bespoke caret painters removed. Census: `grep -rn 'valueBeforeCaret\|valueAfterCaret' src
scripts` now hits only `TextFieldPainter.ts` (and the smoke's own independent derivation).

### Deliberately left alone

- **`AgentComposer` / the agent pane composer** — multi-line and wrapping (`moveUp`/`moveDown`,
  `layout().rowCount`, `caretRow`/`caretColumn`), and its caret is not painted at all: it is
  projected through `PaneContent.caret()` into the terminal's own block cursor. A wrapping surface
  resolves its caret through a row mapping, not a one-line window — different generator, so forcing
  it in would mean suppressing the window half of the seam.
- **The editor body caret** — hardware cursor via `renderer.setCursorPosition`; out of scope by
  instruction and a different mechanism.
- **Settings panel** — audited, no text field exists: every row is `number`, `boolean`, `enum`, or
  `dynamic-enum` (`SettingsPanel.ts`). Nothing to route.
- **Three-tone state for the modal dialog inputs** (palette/Quick Open) — they are always the focused
  field and are never pointer-hover targets, so two of the three states would be unreachable
  decoration. They consume the caret+window+tone with `focused` fixed. Recorded in the record's
  Rejected alternatives.

## The three tones, and why

| State | Background | Foreground | Reasoning |
|---|---|---|---|
| idle | `border` `#101014` | `dim` `#787c99` | one step **below** `panel` — a recessed, inert well (today's rest look, so nothing regresses) |
| focused | `cursorLine` `#1e202e` | `fg` `#a9b1d6` | one step **above** `panel`; the real signal is the text going `dim → fg` |
| hovered | `accent` `#7aa2f7` | `panel` `#16161e` | the theme's vivid colour — unchanged from today, so the working hover does not regress |

Justification against `ThemePalettes.ts`'s own design note ("Low contrast between adjacent surfaces
… hierarchy carried by text BRIGHTNESS … vivid colour reserved for syntax/diagnostics/active
states"): the focus tone moves the background by ~2% luminance (`#101014` → `#1e202e`, both near-black
blues) and carries the state in text brightness instead, so it cannot fight the theme; only hover —
a transient pointer state — spends the vivid `accent`. `cursorLine` is also already the established
subtle-highlight affordance (panel-heading hover, breadcrumb segments, unfocused list selection), so
focus reuses an existing vocabulary word rather than inventing one. Ordering asserted as a gated
contract: `luminance(border) < luminance(panel) < luminance(cursorLine) < luminance(accent)` —
i.e. focus is strictly quieter than hover, and all three backgrounds and all three foregrounds are
pairwise distinct.

Hover wins when both hold (`stateFor`), which is what preserves the existing hover affordance.

## The caret

- **Position**: `prefix + input.valueBeforeCaret` measured by
  `EditorCoordinates.Class.lineWidth` → the caret's display column. Nothing re-derives an index; the
  painter's signature makes that impossible (it receives the model).
- **Shape**: the caret **inverts the cell it occupies** — `bg(tone.foreground)` +
  `fg(tone.background ?? surfaceBackground)` over the grapheme at the caret, or over a space when the
  caret is at end-of-text. So it costs no column, adds no glyph literal (nothing for the theme's
  glyph ladder to degrade), is always visible at end-of-text, and **cannot shift the text**. This is
  the same reduction `SolidThumbScrollBar` made ("background fill, never block glyphs"). It replaces
  the inserted `▏` in the palette, Quick Open, and the Find bar, which shifted every cell after the
  caret.
- **Geometry invariance**: the caret cell is *always* emitted and only recoloured, so painted width,
  caret column, and text window are byte-identical across idle/focused/hovered and across
  `caretVisible` true/false.
- **Wide glyph, proven two ways.** Unit: `'a漢b'` with the caret on `漢` yields `caretWidth === 2`;
  `'漢字x'` puts the caret at prefix+4, `'😀a'` at prefix+2. Driven: a **pasted** `漢字` query gives
  `queryCaretCell.column === listLeft + lineWidth(prefix) + 4` — a string-length painter would have
  said `+2` — and `Home` onto the first wide grapheme publishes `width === 2`. The smoke recomputes
  the expected column independently from the published `(query, caret)` pair through
  `EditorCoordinates`, so model → published geometry → painted cells are cross-checked, not
  self-confirmed.
- **Over-long query**: a caret past the field's right edge pulls a right-anchored window on whole
  graphemes (`trailingColumnWindow`), so the caret never falls outside a fixed-width field.

## Steady, not blinking

**Steady.** A blink is a timer that must request a frame every ~500 ms forever, which directly
contradicts the enforced `idle-quiescence` contract (frame delta ≤ 1 over three untouched seconds).
There is no version of blinking that satisfies it — the contract does not permit "few frames", it
permits none. Verified after the change: `PASS idle frame delta <= 1 over 3s untouched (frame 2 -> 2)`.
The inverted-cell caret is high-contrast enough that motion buys nothing; it is also what a terminal's
own block cursor looks like, so it reads as native. Recorded in the record's Rejected alternatives.

## Second requirement folded in — the full action vocabulary

**A shared resolver already existed; I did not write a fourth mapping.**
`KeybindingDefaults.textInputBindings(context)` is the one chord table, instantiated for `palette`,
`quickopen`, `find`, `agent`; `Bootstrap.applyTextInputAction` routes `textInput.*` to the focused
surface. `listPopup` simply never got an instantiation — confirmed as you described.

Fix: `...textInputBindings('listPopup', { hostOwnedPlainKeys: ['left', 'right', 'backspace'] })`, plus
`boundedListPopup.applyQueryInputAction` (refilters on an edit, repaints on a bare caret move) at the
front of `applyTextInputAction`, and `textInput.*` dispatch in Bootstrap's popup key block. Alt is
recognised by the existing decoder path (`option || meta` → the registry's `alt` slot); the harness
exercises the real byte encodings (`\x1b[1;3D`, `\x1b[3;3~`, `\x1b\x7f`), so no second parser exists.

The `hostOwnedPlainKeys` filter is not suppression of the seam's core — the core is the ACTION
vocabulary, and it arrives whole. It exists so the field never *advertises* a chord it cannot
receive (`effectiveBindings('listPopup')` must stay truthful for the shortcut sheet, per *Advertised
bindings are deliverable bindings*).

### Conflict — reported, not resolved unilaterally

**Plain `Left`/`Right` in the popup.** They are `listPopup.navigateBackward` / `listPopup.drill`
(your breadcrumb builder's territory), so `textInput.moveLeft` / `moveRight` have **no chord in the
popup**: single-grapheme caret movement is unavailable there. Word movement (`Alt`+arrows,
`Ctrl`+arrows), `Home`/`End`, and `Cmd`+arrows all work. Note that plain `Left`/`Right` are *inert*
in every non-drillable popup (buffers, branches, layouts, panel-add) — `drillSelected` no-ops unless
the item is `drillable` and `navigateBackward` no-ops without a handler — so the honest fix is
probably to fall through to caret movement when the popup has no drill target (VS Code's behaviour).
**I did not touch it**; that is a decision for you and the breadcrumb builder. Plain `Backspace`
deliberately stays `listPopup.erase` (identical effect to `textInput.backspace`, and removing a
published action id was not worth the churn).

### Second finding, untouched: `FindBar.switchField` is unreachable

`Tab` in the find bar resolves to the **global** `{key:'tab'} → focus.toggle` (KeybindingDefaults:245)
before Bootstrap's `if (key.name === 'tab') findBar.switchField()` can run, so the replacement field
can never be focused by keyboard, and there is no pointer path to it either. It is a dead capability.
Fixing it is a 4-line guarded binding (`when: 'findBarReplaceMode'` — guarded singles outrank
unguarded ones regardless of array order), but it changes a global chord's behaviour, so I left it
alone and drove the idle tone another way (below).

## Driven three-way state assertions

`scripts/harness/smoke-field-caret-harness.ts` (new, 36 PASS lines, registered in `merge-gate.sh`).
Every field is addressed by **published geometry** — `boundedListPopupGeometry` +
`boundedListPopupQueryCaretCell` / `boundedListPopupQueryCaret` (both newly published) — never by
hunting for a caret glyph. Tones and the search glyph are imported from `ThemePalettes` /
`ThemeIcons`, so no hex or glyph is hardcoded.

- **focused (unhovered)**: the search row's cells carry `cursorLine`.
- **hovered**: pointer onto the search row → `accent`; and the popup geometry plus the caret cell are
  asserted **byte-identical** (`JSON.stringify`) to the focused capture, then the pointer moves to a
  list row and the quieter focus tone returns.
- **idle**: `Ctrl+H` opens replace mode with the QUERY focused, so the replacement field below it is
  the live unfocused field — one frame carries a `cursorLine` focused field and a `border` idle field
  side by side. (No `Tab` needed, hence no dependence on the shadowed binding.) The replacement row
  is located as `queryRow + 1` at the query's prefix column — derived geometry, not a glyph.
- **three-way**: the three *observed* backgrounds are asserted pairwise distinct
  (`new Set([...]).size === 3`).
- Caret: at the model offset for an empty query, after typing, after `Alt+Left` ×2, `Alt+Right`,
  `Home`, `Ctrl+Right`, `End`, `Alt+Backspace` (matches 1 → 30), retype, `Alt+Delete` (query `-007`,
  matches 1), `Delete`, and across the wide-glyph query — each asserting *exactly* the caret's
  columns invert in the search row, so a second or missing caret fails.
- Popup keys intact: plain `Backspace` still erases, `Down` still moves the selection, `Escape` still
  closes (and clears the published caret cell).

Wait discipline: every wait names the state its assertion reads. The caret waits require the expected
query *and* the expected model caret offset *and* a published caret cell that agrees with an
independently derived column, so no predicate is satisfiable by the pre-action state. No bare sleeps,
no clock-based silence assertions, nothing waiting on frame production.
`scripts/check-harness-wait-observation.ts` flags one candidate in the new file
(`repeated-wait-predicate` 462↔408, the focus tone before and after the hover) — legitimate: the
intervening hover wait observed the *hovered* background, so the focus predicate was false in
between. A genuinely vacuous wait it found earlier (a Quick Open grid predicate on `alphafile.txt`
that the file tree already satisfied) was replaced with a status wait on `quickOpenQuery` +
`quickOpenMatches`.

Existing smokes updated for the new caret shape (both decoupled from the `▏` literal):
`smoke-text-input-harness.ts` (its caret assertion is now *stronger* — the inverted cell's background
read from theme data, instead of "some non-blank character") and `smoke-workspace-tabs-harness.ts`.

## Invariants

- **New**: *One painter draws every single-line text field* (`src/modules/ui/ui.invariants.md`) —
  every field present including **Scope** (and Components, Generates, Rejected alternatives).
  Impossible-if-true names exactly what can no longer happen: *a focusable one-line field with no
  visible caret; a focused field painted identically to an idle one; a hover highlight lost because a
  field became focusable; a caret column derived from string length drifting on a wide glyph or
  emoji; a caret that widens its field or shifts the text after it; a caret that requests frames
  while the app is at rest.*
- **Refined** (`src/modules/ui/ui.invariants.md`): *Bounded list popups share paint and hit geometry*
  — its Mechanism claimed the search row "owns an independent rest-muted and hover-lit palette
  state", which is now false; it delegates to `TextFieldPainter` and publishes `queryCaretCell`.
- **Refined** (`project.invariants.md`): *Editable text fields share one input model* — the popup
  composed the model yet dropped half its vocabulary at the input boundary, a hole the record did not
  forbid. It now requires every `apply` action to be REACHABLE, names the one chord table plus
  `hostOwnedPlainKeys`, and forbids "a fourth chord table for the same `textInput.*` actions".

Checker verified by **exit code**, not a log tail (see the table).

## Exit codes

| Command | Exit |
|---|---|
| `bunx tsc --noEmit` | **0** |
| `bun test` (1383 pass / 0 fail, 16137 expects) | **0** |
| `bun scripts/check-file-grammar.ts` | **0** |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all` | **0** |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` (729 annotations, 42 lattice links, 0 problems) | **0** |
| `bash scripts/conventions-gate.sh` | **0** |
| `bun scripts/check-coverage-ratchet.ts` | **0** |
| `bash scripts/behavioral-contracts.sh` (incl. `idle-quiescence`) | **0** |

Smokes, three runs each (all ALL-PASS):

| Smoke | run 1 | run 2 | run 3 |
|---|---|---|---|
| `scripts/harness/smoke-field-caret-harness.ts` (new) | **0** | **0** | **0** |
| `scripts/harness/smoke-text-input-harness.ts` (touched) | **0** | **0** | **0** |
| `scripts/harness/smoke-workspace-tabs-harness.ts` (touched) | **0** | **0** | **0** |
| `scripts/harness/smoke-bounded-list-popup-harness.ts` (behaviour touched) | **0** | **0** | **0** |

Regression sweep over every surface the painter touches, one run each, all exit **0**:
`smoke-quickopen-harness`, `smoke-find-harness`, `smoke-search-mouse-harness`,
`smoke-openproject-harness`, `smoke-mode-coherence-harness`, `smoke-word-delete-harness`,
`smoke-completion-harness`, `smoke-overlay-dialog-harness`, `smoke-panel-chrome-harness`,
`smoke-voice-picker-harness`.

**No `coverage-deltas.md` entry needed** — the ratchet reports no undeclared decrease against
`72dca35`; `KeybindingDefaults.test.ts` grew `5 → 22` assertions / `2 → 4` waits, and the only other
change is one informational assertion-text replacement in `smoke-text-input-harness.ts`.

Not run, per instruction: `scripts/merge-gate.sh` (the new smoke is registered in it). No push, merge,
tag, or branch deletion.
