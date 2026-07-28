# Caret rebase READY — `feat-field-caret-focus` onto `origin/main` (48757ba)

Worktree: `/tmp/conductor-caret` · Branch: `feat-field-caret-focus` · New commit: `8cb93f1`
Rebase exit code: **0** (read from `git rebase --continue` itself, not a pipe). Worktree clean.
Nothing pushed, merged, tagged, or deleted. `scripts/merge-gate.sh` was NOT run.

Every one of the nine blocks was a true additive-vs-additive union. **Nothing was stopped on; no
side was picked over the other.** Two blocks needed a judgement call within the union (Bootstrap's
dispatch call and the popup's search-row `if` condition) — both documented below.

---

## The nine conflicts and how each was unioned

### `src/modules/app/AppStatusProjection.ts` — 2 blocks

Both blocks are the same `Pick<>` key list for `boundedListPopup`, split by git into two hunks.
Main added `'items'` and `'title'` (the `..` row projection needs the full item list and the
breadcrumb title); the caret side added `'queryCaret'` and `'queryCaretCell'`. Result is the
9-key union:

```ts
readonly boundedListPopup: Pick<
  InstanceType<typeof BoundedListPopup.Class>,
  | 'open' | 'items' | 'query' | 'selectedIndex' | 'filteredMatches'
  | 'geometry' | 'title' | 'queryCaret' | 'queryCaretCell'
>;
```

The snapshot bodies themselves merged without markers, so both feature sets publish:
main's `boundedListPopupTitle` / `boundedListPopupItemIdentifiers` /
`boundedListPopupMatchIdentifiers` / `boundedListPopupSelectedIdentifier` /
`pluginPrimaryDockContentIdentifiers` / `activityBarItemIdentifiers` / `sidebarViewIdentifiers` /
`...statusProjectionContributions.snapshot()`, and the caret side's
`boundedListPopupQueryCaret` + `boundedListPopupQueryCaretCell` (AppStatusProjection.ts:167-168).

### `src/modules/app/Bootstrap.ts` — 1 block

The `listPopup` key route. **The two sides changed different things in the same three lines**, which
is why it conflicted:

- The caret side widened the *condition*: `listPopup.*` **or** `textInput.*` (so Alt-word ops,
  Home/End and Delete reach the popup's search field), plus its explanatory comment.
- Main changed the *call*: base's `actionHandlers[action]?.(key)` became `dispatchAction(action, key)`.
  `dispatchAction` (Bootstrap.ts:1628) is a strict superset — it tries `actionHandlers[action]` and
  falls back to `commands.run(action)`, which is exactly the plugin-canvas inversion's requirement
  (a plugin-contributed action has no local handler entry).

Union = the caret side's widened condition + comment, calling **main's `dispatchAction`**. Taking the
caret side's raw `actionHandlers[...]` here would have silently dropped plugin-contributed listPopup
actions, so this is the one place where the union is not a literal concatenation.

The caret commit's other Bootstrap change — `applyTextInputAction` giving the modal popup first claim
on text input (Bootstrap.ts:1218-1223) — merged with no marker and is present.

### `src/modules/ui/BoundedListPopup.ts` — 4 blocks

1. **Invariant annotation header** — both annotations kept, in order:
   `// invariant: Popup hierarchy is mouse and keyboard reachable` then
   `// invariant: One painter draws every single-line text field`.
2. **Protected fields** — both kept: `iconColumnsValue = 0` (main) and
   `queryCaretCellValue: BoundedListPopupCaretCell | null = null` (caret).
3. **Getters** — all three kept: `title` (main), then `queryCaretCell` and `queryCaret` (caret),
   each with its original doc comment.
4. **The search-row paint in `update()`** — main's edit here was cosmetic
   (`if (this.searchEnabled)` → `if (this.searchInput.visible)`, and hoisting a `searchColumns`
   local because its expression appeared twice); the caret side replaced the whole hand-rolled
   two-tone body with `TextFieldPainter.Class.paint(...)`. Union = the caret side's painter body.
   Judgement calls, both no-ops in behaviour:
   - condition kept as `this.searchEnabled`. `this.searchInput.visible = this.searchEnabled` is
     assigned on the line immediately above (BoundedListPopup.ts:544), so the two conditions are
     *identical in value*; `searchEnabled` is kept because the block's own
     `queryFocused = this.acceptsQueryInput` reasons in the same terms.
   - main's `searchColumns` local was dropped because the painter uses the width expression exactly
     once (`width:`), which is the only reason the local existed.
   The `else { this.queryCaretCellValue = null; }` arm from the caret side is preserved.

   Everything main added elsewhere in this file merged without markers: `filterItems` pinned-row
   partitioning, `layoutGeometry`'s `chromeRows`/`listIconColumns`, `itemRowText`,
   `itemSetIconColumns`, `firstEnabledFilteredIndex`'s pinned skip, `replaceItemSet`'s
   `iconColumnsValue`, the `icon` + `pinnedWhileQueryEmpty` item fields.

### `src/modules/ui/ui.invariants.md` — 2 blocks

1. **New `## Chosen invariants` sections.** Main added two ("Status text is assembled from ordered
   contributions", "Plugin panes use the shared pane and popup hosts"); the caret side added one
   ("One painter draws every single-line text field"). All three kept, main's two first. The shared
   trailing `**Last refined:** 2026-07-26` line belonged to whichever section came last, so a
   `**Last refined:** 2026-07-26` was added after "Plugin panes…"'s `**Status:** established` to keep
   every section's field block complete. Verified by the checker: `ui.invariants.md: 1 reality,
   44 chosen invariants`, PASS.

2. **"Bounded list popups share paint and hit geometry" → Mechanism.** The only block needing real
   prose merging: both sides rewrote overlapping sentences. Main documented the shared icon column;
   the caret side documented the search row delegating to `TextFieldPainter`. The two claims are
   compatible and the caret side's sentence *replaces the same clause main left alone* — main's
   "The optional search row owns an independent rest-muted and hover-lit palette state" is precisely
   the statement the caret commit falsifies, so it is the caret sentence that survives there, while
   main's `itemRowText`/`listIconColumns` sentence and its "item labels, **icons**, selection, and
   actions … popup rows, **columns**, or query focus" widening are kept verbatim. Merged paragraph:

   > …`nextEnabledFilteredIndex` wraps through the current filtered matches and
   > `revealSelectedIndex` moves that same window. The optional search row delegates its window,
   > caret, and idle/focused/hovered tone to `TextFieldPainter` and publishes the painted caret cell
   > as `queryCaretCell`, while the modal popup remains the query-input owner across list-row hover
   > repaints. Row text comes from the one `itemRowText` generator, whose icon cell is
   > `listIconColumns` wide on EVERY row — the widest icon in the item set, so a two-cell pictograph
   > widens that shared column instead of pushing one row's label out of the column its neighbours
   > established. Consumer adapters provide item labels, icons, selection, and actions but never
   > calculate popup rows, columns, or query focus. Completion hides the search row and backdrop…

   Main's edits to the same section's **Invariant** ("per-row icon column") and **Impossible if
   true** ("two rows in one list starting their labels in different columns", "icon-column")
   merged without markers and are intact.

---

## The ONE interaction

Preserved as specified, not resolved by giving Left to the text field:

- `KeybindingDefaults.ts:372-374` — plain `left` → `listPopup.navigateBackward` (host-owned,
  unchanged from main); plain `right` → `listPopup.drill`; plain `backspace` → `listPopup.erase`.
- `KeybindingDefaults.ts:389-391` — `...this.textInputBindings('listPopup', {
  hostOwnedPlainKeys: ['left', 'right', 'backspace'] })`, and `textInputBindings` filters out
  exactly the unmodified chords named there (lines 113-119), so the field advertises only the
  modified chords: Alt-word movement/deletion, Home/End, Delete.

Single-grapheme caret movement inside popups remains the known deferred gap.

---

## Grep proofs of the four must-survive items

### 1. The `..` parent row machinery

```
src/modules/ui/BreadcrumbPicker.ts:88:        pinnedWhileQueryEmpty: true,
src/modules/ui/BoundedListPopup.ts:228:      if (item.pinnedWhileQueryEmpty === true) {
src/modules/ui/BoundedListPopup.ts:762:        match.item.pinnedWhileQueryEmpty !== true,
src/modules/ui/BoundedListPopup.ts:947:  readonly pinnedWhileQueryEmpty?: boolean;
src/modules/ui/BoundedListPopup.ts:941:  readonly icon?: string;

src/modules/ui/BreadcrumbPicker.ts:18:  static get parentDirectoryItemIdentifier(): string {
src/modules/ui/BreadcrumbPicker.ts:81:        identifier: $BreadcrumbPicker.parentDirectoryItemIdentifier,
src/modules/ui/BreadcrumbPicker.ts:95:    if (item.identifier === $BreadcrumbPicker.parentDirectoryItemIdentifier) {
scripts/harness/smoke-bounded-list-popup-harness.ts:48:  BreadcrumbPicker.Class.parentDirectoryItemIdentifier;

src/modules/app/AppStatusProjection.ts:156:      boundedListPopupMatchIdentifiers:

src/modules/ui/BoundedListPopup.ts:322:      listIconColumns: Math.max(0, Math.floor(input.iconColumns)),
src/modules/ui/BoundedListPopup.ts:603:            $BoundedListPopup.itemRowText(match.item, geometry.listIconColumns),
src/modules/ui/BoundedListPopup.ts:708:  static itemRowText(item: BoundedListPopupItem, iconColumns: number): string {
src/modules/ui/BoundedListPopup.ts:735:          $BoundedListPopup.itemRowText(item, iconColumns),   // itemSetMaximumWidth → box width
src/modules/ui/BoundedListPopup.ts:1005:  listIconColumns: number;
```

The load-bearing pinned skip in `firstEnabledFilteredIndex` (BoundedListPopup.ts:758-768):

```ts
protected firstEnabledFilteredIndex(): number {
  const firstBrowsableIndex = this.filteredMatches.findIndex(
    (match) =>
      match.item.enabled !== false &&
      match.item.pinnedWhileQueryEmpty !== true,
  );
  if (firstBrowsableIndex >= 0) return firstBrowsableIndex;
  return this.filteredMatches.findIndex(
    (match) => match.item.enabled !== false,
  );
}
```

One `itemRowText` generator feeds **both** paint (line 603) and box width (line 735, via
`itemSetMaximumWidth`) — the single-generator seam is intact.

### 2. Plugin contribution projections

```
src/modules/app/AppStatusProjection.ts:130:      pluginPrimaryDockContentIdentifiers: [
src/modules/app/AppStatusProjection.ts:131:        ...ports.pluginPrimaryDockContentIdentifiers,
src/modules/app/AppStatusProjection.ts:133:      activityBarItemIdentifiers: ports.view.activityBarItemIdentifiers(),
src/modules/app/AppStatusProjection.ts:134:      sidebarViewIdentifiers: ports.primaryDockHost.orderedContents.map(
src/modules/app/AppStatusProjection.ts:351:      ...ports.statusProjectionContributions.snapshot(),
src/modules/app/AppStatusProjection.ts:452:  readonly pluginPrimaryDockContentIdentifiers: readonly string[];
src/modules/app/AppStatusProjection.ts:453:  readonly statusProjectionContributions: Pick<
src/modules/app/AppStatusProjection.ts:478:    | 'activityBarItemIdentifiers'
```

And the smoke that asserts the three sets are exactly equal still reads them:

```
scripts/harness/smoke-activitybar-harness.ts:206:  const pluginPrimaryDockContentIdentifiers =
scripts/harness/smoke-activitybar-harness.ts:207:    initialStatus.pluginPrimaryDockContentIdentifiers as string[];
scripts/harness/smoke-activitybar-harness.ts:213:    pluginPrimaryDockContentIdentifiers.includes('git'),
```

### 3. Glyph values (user-settled)

```
src/modules/theme/ThemeIcons.ts:151:        activityFiles: '☰',
src/modules/theme/ThemeIcons.ts:155:        activityExtensions: '⬢',
src/modules/theme/ThemeIcons.ts:156:        activitySearch: '⌕',
src/modules/theme/ThemeIcons.ts:247:        search: '⌕',
```

Structurally guaranteed as well: `git diff --stat 48757ba..HEAD` touches 15 files and
`src/modules/theme/*` is not among them, so no glyph could have moved.

### 4. Bootstrap held-key acceleration + plugin activation before `buildRootView`

```
src/modules/app/Bootstrap.ts:163:    const scrollPhysics = new ScrollPhysics.Class();
src/modules/app/Bootstrap.ts:1107:    const movementAcceleration = (
src/modules/app/Bootstrap.ts:1111:      scrollPhysics.keyAccelerationFor(`${movementScope}:${key.name}`);
src/modules/app/Bootstrap.ts:232:      plugin.activateApplication({      ← activation
src/modules/app/Bootstrap.ts:309:    const view = RootView.Class.buildRootView(   ← after activation
```

One correction to the brief: there is **no identifier named `movementRun`** anywhere in `src/`
(`grep -rn "movementRun" src/` → no hits, on this branch *and* on `origin/main`). The held-key
acceleration wiring is `movementAcceleration` → `scrollPhysics.keyAccelerationFor(...)`, backed by
the single shared `ScrollPhysics` instance created at Bootstrap.ts:163 and injected at lines 168/174
(the same tracker `BoundedListPopup.moveSelection` uses for `list:up`/`list:down`). It is untouched
by this commit. Nothing was lost — the name in the brief simply does not exist.

### Caret-side feature (also verified)

`TextFieldPainter.paint` takes `input: TextInputModel.Model` (TextFieldPainter.ts:149), never a caret
index; `stateFor`/`toneFor` are the one place hover outranks focus (lines 20/28); the popup consumes
the painter and publishes `queryCaretCell` (BoundedListPopup.ts:547-575); `applyQueryInputAction`
routes the shared primitives into the query; `applyTextInputAction` gives the modal popup first claim
(Bootstrap.ts:1218-1223).

---

## Exit codes (all read directly from the command, never through a pipe)

| Check | Run 1 | Run 2 | Run 3 |
|---|---|---|---|
| `git rebase --continue` | **0** | — | — |
| `bunx tsc --noEmit` | **0** | — | — |
| `bun scripts/harness/smoke-field-caret-harness.ts` | **0** | **0** | **0** |
| `bun scripts/harness/smoke-bounded-list-popup-harness.ts` | **0** | **0** | **0** |
| `bun scripts/harness/smoke-activitybar-harness.ts` | **0** | **0** | **0** |
| `bun scripts/harness/smoke-panel-chrome-harness.ts` | **0** | **0** | **0** |
| `bun scripts/harness/smoke-text-input-harness.ts` | **0** | **0** | **0** |
| `bun test` | **0** (1411 pass / 0 fail, 221 files) | — | — |
| `bash scripts/behavioral-contracts.sh` | **0** (ALL-PASS) | — | — |
| `bun scripts/check-coverage-ratchet.ts` | **0** (275 files, no undeclared decrease vs 48757ba) | — | — |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all` | **0** | — | — |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` | **0** (736 annotations, 45 lattice links, 0 problems) | — | — |
| `bash scripts/conventions-gate.sh` | **0** (PASS) | — | — |
| `bun scripts/check-reactive-observation.ts` | **0** (0 candidates; 3 positive controls flagged) | — | — |

Smokes were run with `COLORTERM=truecolor` so the colour assertions are meaningful.

Notable pass content, i.e. the resolution is verified by the assertions that would catch a bad merge:

- field-caret: "idle, focused, and hovered are three distinct observed backgrounds"; "a caret sitting
  on a wide grapheme covers both of its cells"; "Down moves the popup selection instead of the caret";
  "Up/Down, Backspace, and Escape keep popup meanings".
- bounded-list-popup: "the first list row after the search input is the `..` parent row"; "Left and
  Enter on the parent row publish identical state"; "the workspace root omits the parent row instead
  of offering a dead one"; "every painted row label starts at the same published label column".
- activitybar: the Ctrl+Shift+E/G/X glyph + accent row, ALL-PASS.

## Stopped on / guessed

Nothing. No block required picking a side, and no two lines contradicted. The only non-mechanical
decisions are the three called out above (Bootstrap's `dispatchAction` over
`actionHandlers[...]`; `searchEnabled` vs the value-identical `searchInput.visible`; dropping main's
now-single-use `searchColumns` local), plus the `**Last refined:**` line added to keep the
"Plugin panes…" section's field block complete after the section order was unioned.

`scripts/merge-gate.sh` was not run, as instructed.
