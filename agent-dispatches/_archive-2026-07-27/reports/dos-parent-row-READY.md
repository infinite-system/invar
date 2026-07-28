# DOS-style `..` parent row + three glyph/icon refinements — READY

Worktree `/tmp/conductor-dosup`, branch `feat-dos-parent-row`, one commit `8a15e27`
on top of `763e1d6`. Working tree clean; `git ls-files | grep '^TASK'` returns nothing.
Not pushed, not merged, not tagged; `scripts/merge-gate.sh` not run.

## 1. The `..` parent ROW (replaces the chrome control)

### Removed
- `BoundedListPopupGeometry.navigateBackwardControl` and
  `BoundedListPopupControlGeometry` (the published one-cell control).
- `BoundedListPopupGeometryInput.navigateBackwardVisible`; `chromeRows` is now
  `searchVisible ? 1 : 0` again.
- The control's paint chunk, its `navigationBackwardHovered` state, its hover
  branch in `searchInput.onMouseMove/onMouseOut`, its `onMouseDown` hit test, and
  the static `navigateBackwardControlContains`.
- `BoundedListPopupOpenOptions.navigateBackwardAvailable` and the
  `navigateBackwardAvailable` getter — availability was a SECOND place deciding
  "is there a parent". It is now decided once, by the row's existence.
- The `popupNavigateBackward` glyph slot from all three tiers and from
  `InterfaceGlyphVocabulary`. The row needs no slot: `..` is a path label (same
  category as a filename), and its ICON comes from the file-icon set (see §4).
- `searchInput.visible` is back to `searchEnabled` alone, so the search row's
  "no-search" background branch is gone with it.

### Added
- `BoundedListPopupItem.pinnedWhileQueryEmpty` and `BoundedListPopupItem.icon`.
- `BreadcrumbPicker.parentDirectoryItemIdentifier`
  (`'breadcrumb-picker:parent-directory'` — namespaced so it can never collide
  with the absolute paths every real entry uses) and
  `parentDirectoryItemLabel` (`'..'`).
- `BreadcrumbPicker.itemsForDirectory` prepends the synthetic row with
  `keepOpenOnSelect: true`, `pinnedWhileQueryEmpty: true`, and the folder icon,
  and only when `parentDirectoryOf(directoryPath) !== null`.
- `AppStatusProjection.boundedListPopupMatchIdentifiers` — the rows currently
  OFFERED, distinct from the whole item list. Needed because the item list always
  contains `..`; only the match list shows whether the query is hiding it.

### One generator
`parentDirectoryOf(directoryPath)` is the single resolver: the row's existence,
the Left key, and the row's activation all ask it. Because `..` is an ordinary
list row, Enter and pointer release already share the one `runFilteredIndex`
activation chokepoint; `activateItem` sees the parent identifier and calls
`navigateBackward()` — the exact method `BoundedListPopup.navigateBackward`
(bound to Left via `listPopup.navigateBackward`) calls. There is no second
re-root path. The old `navigateBackwardAvailable()` predicate is gone, folded
into `parentDirectoryOf` returning `null`.

Proven at the PTY: the published state (title + item identifiers + match
identifiers + selected identifier) after Enter-on-`..` is byte-identical
(`JSON.stringify`) to the state after Left AND to the state after clicking the
row. Root absence is asserted from the published item list, plus a grid
assertion that the workspace root's first list row is a real entry.

### Query rule (chosen, and why)
**`..` is pinned to the head of the list while the query is empty and absent the
moment the query is non-empty. It is never fuzzy-scored.** Implemented in
`BoundedListPopup.filterItems` (the shared generator, not the adapter), so any
future hierarchical adapter inherits it.

Rationale: an empty query means the user is BROWSING, which is when `..` is the
affordance; a typed query means they are searching *this* folder, not walking out
of it. Scoring it would let a query containing `.` surface a browsing row inside
a search result, competing for rank with real files. It is consistent with
step-up already CLEARING the query (`resetQuery: true`): the query belonged to
the directory you left, so after any re-root the query is empty and `..` is
present — the state you need to keep walking up.

One consequence worth naming: `firstEnabledFilteredIndex` now skips pinned rows,
so the RESTING selection is always a real entry. Without that, drilling into a
folder would select `..` and the next Enter would walk straight back out.
Selection-after-step-up still lands on the directory just left (unchanged from
`48ae24b`), so Right/Enter re-enters immediately.

### Invariant record: REFINED, not dropped
`Popup hierarchy is mouse and keyboard reachable` (ui.invariants.md) keeps its
guarantee — both input modes reach the parent — and now states it about the row:
- **Invariant**: the parent operation IS a `..` row at the head of the list;
  Enter on it, a click on it, and Left invoke one backward operation; absent when
  no parent is reachable.
- **Components**: added *Browsing not searching* (the pin/hide/never-scored/
  never-resting rule) beside *Shared operation*, *Honest root*, *Directory
  continuity*.
- **Mechanism**: rewritten around `pinnedWhileQueryEmpty`, `filterItems`,
  `firstEnabledFilteredIndex`, the shared `runFilteredIndex` chokepoint, and
  `parentDirectoryOf`.
- **Rejected alternatives**: the chrome control is now recorded as rejected, with
  its reason and the fact that it shipped and was replaced the same day.
  Fuzzy-scoring `..` is recorded as rejected too.
- **Impossible if true**: adds "a typed query leaving `..` among the offered
  rows" and "the resting selection landing on `..`".

Also refined: `Bounded list popups share paint and hit geometry` (control cell →
icon column), `Bounded list interactions live in one popup` (the new item
facets), and the three records `48ae24b` had widened to cover a "popup backward
control" are narrowed back and re-pointed at the shared file icons
(`theme.invariants.md` ×2, `project.invariants.md` ×1). No recorded claim was
silently dropped.

## 2. Search glyph reverted
`ThemeIcons.$interfaceGlyphVocabularies.unicode.activitySearch` and
`$findIcons.unicode.search`: `⚲` (U+26B2) → `⌕` (U+2315). nerd (`\u{f002}`) and
ascii (`/`) untouched.

## 3. Plugins glyph: `⬢` CONFIRMED
`$interfaceGlyphVocabularies.unicode.activityExtensions`: `⊞` (U+229E) → `⬢`
(U+2B22). nerd/ascii untouched. Verification results:
- **Width**: `EditorCoordinates.Class.lineWidth('⬢') === 1`. Confirmed again at
  the PTY: the emulator cell holding it reports `width === 1`, and the activity
  bar's rows keep the sidebar edge in one column with it painted.
- **Collisions**: none against `▎ ● ❯ • ↗ ↙ + × ☰ ⑂ ⌕ ⚙`. Also checked against
  `⬡` (U+2B21) — which is why the outline hexagon was NOT usable as a fallback:
  `⬡` is already the `.wasm` file icon. No fallback was needed.
- Encoded as tests: `the extensions glyph is one cell and avoids every reserved
  mark` and `activity and panel control glyphs stay pairwise distinct at every
  tier` in `ThemeIcons.test.ts`.

## 4. Breadcrumb rows carry the tree's icons (fourth refinement)
- Rows resolve their mark through `Theme.icon(name, isDirectory)` →
  `ThemeIcons.iconFor(iconSet, …)` — the SAME resolver `TreePaneRenderer` calls.
  No second table, no call-site literal. `BreadcrumbPicker` gained a
  `theme: Pick<Theme.Instance, 'icon'>` dependency, wired from `TabBar`.
- Trailing `/` DROPPED from directory labels; `searchText` dropped with it (the
  label is now the bare entry name, so label-text filtering is name filtering).
- **Alignment is structural, not assumed.** The popup owns the icon column:
  `itemSetIconColumns` = the widest icon in the item set, published as
  `geometry.listIconColumns`, and `itemRowText` is the ONE row-text generator
  used by paint AND by exact box width. A wide pictograph therefore widens the
  shared column for every row instead of shifting one row's label.
- **`..` icon**: `folderClosed` — the same mark its sibling directories wear
  (resolved through the same `theme.icon('..', true)` call), so it reads as
  uniform rather than as a special case. Its `..` label is what distinguishes it,
  per the DOS convention.
- **Filter unaffected**: the icon lives in a separate item field, never in
  `label`/`searchText`, so it cannot enter the search text. Asserted directly:
  `filterItems(items, '◆')` returns `[]` even though `◆` is a painted icon. There
  is no per-character match highlighting in this popup (rows are highlighted by
  background), so no column offset needed adjusting.

### Icon width audit (whole extension map, all tiers)
| Tier | Entries not exactly one cell |
| --- | --- |
| nerd | none |
| unicode | `lock` `🔒` = 2; `png`/`jpg`/`svg`/`gif` `🖼` = 2 |
| ascii | none |

`folderOpen`/`folderClosed`/`file` are one cell at every tier (now asserted).
The five wide unicode entries are REPORTED, not silently allowed: they widen the
whole icon column when such a file is in the directory, which keeps rows aligned
but costs one column. Recorded in the glyph-ladder record's Mechanism.

### Known pre-existing conflicts (NOT fixed tonight)
- **`●` for `.js`/`.jsx` is also the reserved DIRTY marker.** Pre-existing in the
  tree's icon set, inherited unchanged by the popup. Recorded as an **Open
  question** on `The glyph ladder degrades icons single-cell and legible` so it
  can enter the reserved-mark table as a known conflict.
- Same record also notes `⑂` for git files == the Source Control activity glyph.
- **NEW FINDING, unrelated to this task, worth a ticket:** at the unicode tier,
  the ACTIVE Explorer row of the activity bar shifts everything to its right one
  column left — the sidebar border lands at column 3 on that row and column 4 on
  every other row. Cause: OpenTUI measures `☰` (U+2630) as 2 cells while the
  terminal renders it as 1, so the bar's 4-column row emits only 3. Reproduced
  by direct cell probe; `⑂`, `⬢` and every nerd glyph are unaffected, so this is
  NOT a regression from the `⊞ → ⬢` change and `⬢` is proven aligned. My new
  activity-bar assertion is scoped to what is true (per-glyph terminal cell width
  == 1, plus sidebar-edge agreement between the two inactive glyph rows) so it
  neither passes vacuously nor fails on this pre-existing defect.

## Smokes that needed NO glyph edit (the decoupling payoff)
- `scripts/harness/smoke-bounded-list-popup-harness.ts` and
  `scripts/harness/smoke-agent-search-harness.ts` derive the expected glyph from
  `ThemeIcons.Class.findIconsFor('unicode').search` (`themedSearchGlyph`), so the
  `⚲ → ⌕` revert cost them zero edits — verified by running both. agent-search
  was not edited at all.
- `smoke-activitybar-harness.ts` DID hardcode `['☰','⑂','⊞']`. Rather than swap
  the literal I applied the same decoupling: its expected row is now derived from
  `interfaceGlyphVocabularyFor(level)`, so no future vocabulary change edits this
  drive either. The literal row stays pinned in `ThemeIcons.test.ts`, which is
  where a wrong glyph should fail. Its new PTY assertions are the one-cell width
  and the sidebar-edge alignment described above.
- The popup smoke also stopped hardcoding the parent identifier: it imports
  `BreadcrumbPicker.Class.parentDirectoryItemIdentifier`.

## Verify-by-driving notes
Every new wait observes the condition its assertion reads: published status for
folder/row/selection identity, published geometry for row addressing (`listTop`,
`listLeft`, `listIconColumns` → label column), and grid waits only for claims
about painted cells. No bare sleeps, no clock-based silence claims, no wait on
frame production. Rows are addressed by index through published geometry, never
by hunting glyph text. The `..` row's own label assertion is read at the
published first-row position rather than searched for.

New drive coverage in the popup smoke: parent row leads the empty query; a typed
query hides it; clearing the query restores it at the head; icon column is one
published cell; every row's label starts at the shared label column; no label
carries `/`; folder vs plain-file vs `.ts` marks all differ; `..` wears the
folder mark; label-text filtering still works with icons present; Enter on `..`
≡ Left ≡ click on `..`; root omits the row.

## Exit codes (all on the committed tree, 8a15e27)
| Command | Exit |
| --- | --- |
| `bunx tsc --noEmit` | 0 |
| `bun test` (1378 pass / 0 fail, 16131 expects) | 0 |
| `bun scripts/check-file-grammar.ts` | 0 |
| `check_invariants.mjs --all` | 0 |
| `check_invariants.mjs --refs` (720 annotations, 0 problems) | 0 |
| `bash scripts/conventions-gate.sh` | 0 |
| `bun scripts/check-coverage-ratchet.ts` | 0 |
| `bun scripts/harness/smoke-bounded-list-popup-harness.ts` ×3 | 0, 0, 0 |
| `bun scripts/harness/smoke-activitybar-harness.ts` ×3 | 0, 0, 0 |
| `bun scripts/harness/smoke-agent-search-harness.ts` ×3 | 0, 0, 0 |
| `bun scripts/harness/smoke-completion-harness.ts` (seam consumer) | 0 |
| `bun scripts/harness/smoke-panel-chrome-harness.ts` (seam consumer) | 0 |

`scripts/check-harness-wait-observation.ts` also exits 0 (report-only). Its two
new candidates in the popup smoke are the two grid waits that both look for the
`picker-nested` listing — sound, because the intervening actions moved the popup
into `deeper`, whose listing does not satisfy the predicate.

## Coverage ratchet: NO decreases
Every touched file grew, so `coverage-deltas.md` needed no entry:
- `smoke-bounded-list-popup-harness.ts`: assertions 33 → 44, waits 63 → 69
- `smoke-activitybar-harness.ts`: assertions 25 → 27, waits 18 → 18
- `ThemeIcons.test.ts`: assertions 19 → 24, waits 8 → 10
- `BoundedListPopup.test.ts`: assertions 29 → 37, waits 10 → 12
- `BreadcrumbPicker.test.ts`: assertions 13 → 19, waits 2 → 2
- `AppStatusProjection.test.ts`: assertions 30 → 31, waits 1 → 1

## Note on one instruction I could not follow literally
The task asked to assert the activity bar renders `☰ ⑂ ⬢ ⌕ ⚙`. The bar paints
THREE items (`activityFiles`, `activitySourceControl`, `activityExtensions`);
`activitySearch` and `activitySettings` are vocabulary slots with no activity-bar
consumer (`activitySearch` has no consumer at all — the find bar uses
`$findIcons.search`, which is why change 2 needed edits in two tables). So the
PTY assertion covers the three painted glyphs and the full five-slot unicode row
`['☰','⑂','⬢','⌕','⚙',…]` is pinned in `ThemeIcons.test.ts` instead.
