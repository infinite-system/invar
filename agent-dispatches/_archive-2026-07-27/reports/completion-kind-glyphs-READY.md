# READY — Completion kind glyphs, resolved by the SAME authority the file tree uses (#89)

Worktree `/tmp/conductor-kindglyphs`, branch `feat-completion-kind-glyphs`, forked from `main` at
`e12206e`. Two commits, deliberately separable:

| commit | subject |
| --- | --- |
| `5affdf3` | Completion items get kind glyphs from the one icon-resolution authority |
| `992d835` | A mark may be shared only by owners that mean the same thing |

`merge-gate.sh` was NOT run. Nothing pushed, merged, tagged, or deleted. Worktree clean;
`git ls-files | grep '^TASK'` returns nothing.

---

## 1. The reduction

### What the shared generator turned out to be

`ThemeIcons.iconFor(set, name, isDirectory, open)` was **one consumer's classifier fused to the
resolver**. That is why it could not answer for a completion item: a completion item is not a file, so
there is nothing to pass for `name`/`isDirectory`. The fused signature was never the shared authority.

Both consumers ask exactly one question:

> given a **classified thing**, what one-cell mark represents it at the terminal's current capability
> tier?

That is the generator, and the file shape is not part of it. Splitting classification from resolution
leaves three pieces:

1. **One resolver, one table per tier.** `$symbolMarks: Record<GlyphLevel, Record<SymbolClass,
   string>>` in `ThemeIcons`, read through `symbolMarkFor(level, symbolClass)` and `symbolMarksFor(level)`.
2. **Two classifiers, each in the module that owns its domain.**
   - `ThemeIcons.symbolClassForFileEntry(name, isDirectory, open)` — filesystem shape → class (theme).
   - `CompletionItemKinds.symbolClassFor(completionItemKind)` — LSP protocol number → class (lsp). It
     chooses **no glyph**; it only classifies.
3. **`iconFor` as the composition of the two**, so the tree's call-site shape survives unchanged:
   `Theme.icon(name, isDir, open)` still exists, `TreePaneRenderer` needed no edit (it is off-limits,
   and it did not need to be touched).

`SymbolClass` is a closed union and the table is a `Record` over it, so **a missing mark is a type
error, not an untested gap**.

Deleted rather than left as a second representation: `IconSet`, `$nerd`/`$unicode`/`$ascii`, `$sets`,
`iconSetFor`, and `Theme.icons`. There is no derived second table either — one authored table, period.

### Payoff that proves the unification is real rather than cosmetic

LSP `File` (17) and `Folder` (19) classify to `file` and `directoryClosed` — **the same classes the
file tree paints**. A path completion and the tree row it would open therefore carry one mark by
construction. `CompletionItemKinds.test.ts` asserts this by fetching the tree's mark through the
tree's own entry point (`iconFor`), so if a second resolver ever appears the two stop agreeing and the
test fails.

### Rejected

| rejected | why |
| --- | --- |
| `CompletionItemKind → glyph` switch in the popup | Two vocabularies that drift on the first theme change. Exactly what the user ruled out. |
| Keep the extension-keyed `IconSet`, derive marks from it | An extension key cannot express a code symbol, so completion would still need its own table. |
| Add an optional `kind` parameter to `iconFor` | Filesystem arguments carried by a caller with no filesystem; the fused resolver stays fused. |
| Put the LSP kind table in `theme` | The theme would own protocol numbers it cannot verify. The classifier belongs with the client that receives them. |
| Keep `IconSet` as a derived projection | Works, but it is a second representation of the same data for no consumer's benefit — only 2 call sites existed. |

### Appearance preservation for the existing consumers

Folding extension keys into classes loses **nothing**: every extension pair that now shares a class
(`.ts`/`.tsx`, `.js`/`.jsx`, the four image extensions, `.toml`/`.yaml`/`.yml`, `git`/`.gitignore`)
already painted one identical glyph per tier. Verified by dumping the pre-change table's code points
and pinning the whole post-change table per tier in `ThemeIcons.test.ts`. The one deliberate change
is `javascript` (§4).

---

## 2. The family table

Families were chosen so related kinds **look** related: `callable` is the letterform you invoke;
`type`, `value`, and `module` share the square motif (a shape you instantiate, one slot holding a
value, a box whose contents you reach into) because they are one data world; `syntax` is a token the
language itself supplies; `unclassified` is the honest empty slot.

| symbol class | LSP kinds | unicode | ascii | nerd |
| --- | --- | --- | --- | --- |
| `callable` | Method, Function, Constructor | `ƒ` U+0192 | `f` | `ƒ` |
| `type` | Class, Interface, Enum, Struct, TypeParameter | `▣` U+25A3 | `t` | `▣` |
| `value` | Field, Variable, Property, Unit, Value, Color, EnumMember, Constant, Event | `▪` U+25AA | `v` | `▪` |
| `module` | Module, Reference | `▤` U+25A4 | `m` | `▤` |
| `syntax` | Keyword, Snippet, Operator | `✱` U+2731 | `k` | `✱` |
| `unclassified` | Text, a null kind, any kind newer than the table | `▫` U+25AB | `.` | `▫` |
| `file` (reused) | File | `·` U+00B7 | `' '` | `\u{f15b}` |
| `directoryClosed` (reused) | Folder | `▸` U+25B8 | `+` | `\u{f07b}` |

The ascii rung degrades **honestly**: six distinct letters, none of them the folder/file marks that
share the column when a completion list offers paths (`' '`, `+`, `-`). Pairwise distinctness across
all nine column-sharing classes is asserted at every tier.

**Nerd tier is deliberately the unicode marks, and this is a named limitation.** Nerd-Font codicon
code points are private-use; a wrong one renders as a silent tofu box, which is strictly worse than a
correct portable mark, and there is no Nerd Font installed anywhere in this environment to verify a
guess against (`fc-list | grep -i nerd` is empty). Precedent exists in the same table (`overviewMark`,
the transcript rule and ellipsis all repeat portable marks at the nerd tier). **Follow-up:** adopt the
`cod-symbol_*` codicons once someone can verify them against an installed Nerd Font.

---

## 3. The width proof

There was **no** existing width-agreement helper (`grep -rn "widthAgree\|width agreement\|singleCell\|
glyphWidth\|charWidth\|stringWidth" src scripts` → nothing relevant), so one now exists as a test in
`ThemeIcons.test.ts`: *every symbol mark the app measures agrees with the terminal that renders it*.

It compares **two independent authorities**, which is the whole point — a width table read twice would
agree with itself and prove nothing:

- the app's: `EditorCoordinates.lineWidth` (OpenTUI's table);
- the terminal's: `@xterm/headless` behind `TerminalEmulator` (the harness screen oracle), read as
  `cell.getWidth()` after writing the mark into a real emulator.

**Positive control:** the instrument must be able to answer *two*. `漢` measures 2 and renders 2, both
asserted, so the check can fail toward the answer that matters.

Measured, every new mark (and both swapped marks):

| mark | code point | app width | xterm width |
| --- | --- | --- | --- |
| `ƒ` | U+0192 | 1 | 1 |
| `▣` | U+25A3 | 1 | 1 |
| `▪` | U+25AA | 1 | 1 |
| `▤` | U+25A4 | 1 | 1 |
| `✱` | U+2731 | 1 | 1 |
| `▫` | U+25AB | 1 | 1 |
| `◉` | U+25C9 | 1 | 1 |
| `⧫` | U+29EB | 1 | 1 |
| `⬢` (outgoing) | U+2B22 | 1 | 1 |
| `漢` (control) | U+6F22 | 2 | 2 |

Reserved-mark collisions: none. The check is not a pasted list any more — see §4.

---

## 4. Vocabulary collisions: the mechanism, and the two recorded pairs

The theme contract carried an **Open question** recording two collisions and then reasoning that
"neither pair shares a column today". That is a position argument, and it was already unreliable: the
breadcrumb popup became a second consumer of this vocabulary on 2026-07-26 and the completion popup is
now a third. Worse, the check that was supposed to enforce it read a hand-written list that **did not
include the file-type marks at all** — an impossibility claim whose data source is incomplete is a
claim that cannot fail.

**The list is now an instrument.** `$markOwnerships` pairs every mark that can land in a list row's
mark column or a single-cell chrome strip with the surface that means something by it, **derived from
the vocabularies that paint it**, so a glyph swap can no longer leave the table describing the previous
glyph. The rule on top of it:

> **A mark may be shared only by owners that mean the SAME thing.**

Enforced by `undeclaredMarkSharings` (a sharing nobody declared fails), `staleMarkSharingDeclarations`
(a declaration whose sharing no longer exists also fails, so the record cannot rot into an unread
allowlist), and a **synthetic-list positive control** proving the detector can report a collision at all.

Running the rule against the now-complete table:

| mark | owners | verdict |
| --- | --- | --- |
| `⑂` | activity: Source Control · symbol class `versionControl` | **INTENDED.** Both mean *version control*. One mark for one meaning is consistency, not ambiguity — a structural reason, not a positional one. |
| `●` | the dirty/active tab marker · symbol class `javascript` | **FAILED and resolved.** "JavaScript source" and "unsaved changes" are unrelated. `.js`/`.jsx` moved to `◉` U+25C9 (solid, so nothing thin can vanish; one cell in both authorities; keeps the round silhouette users read as JS). `●` is now the tab marker's alone, asserted by its own test. The tab marker itself is a literal inside `TabBarRenderer` (off-limits), which is why the theme cannot read it from its owner — that is the one literal in the ownership table, and it is itself a finding (§7). |
| `⚙` | activity: Settings · the status-bar settings affordance · symbol class `shellScript` · symbol class `configuration` | **DECLARED, dated, NOT resolved here.** Two owners mean *settings* (a legitimate alias); the other two mean "a shell script" and "a configuration file" — different things that land in the **same mark column**, so a `.sh` row and a `.yaml` row are already indistinguishable in the tree, the breadcrumb popup, and now completion. This is the *worse* collision class (in-column, not cross-surface). Left to its own change on purpose: resolving it means choosing a new file-type mark, which moves the tree for every user. |
| `❯` | the buffer-tab separator · the status-bar terminal affordance | **DECLARED, dated, NOT resolved here.** Different meanings, different chrome strips, nothing composes them into one row. Unifying or splitting is a vocabulary decision, not a fix to make while adding a family. |

Explicitly **not yet covered**, named rather than silently omitted: the git-panel action buttons, the
staging checkboxes, the find-bar buttons, and the agent-transcript carets. Each sits in its own
dedicated affordance column rather than a shared mark column, and each has candidate collisions of its
own (`↗` is both panel-expand and open-externally; `▸`/`▾` are both directory state and transcript
disclosure). Extending the table there is a separate change because resolving any of them moves a hit
column. The record says exactly this.

The record's **Status stays `provisional`**, and the Open question is not deleted — it is replaced by
the mechanism plus the narrower `⚙` question, as instructed.

---

## 5. The Extensions activity glyph (`⬢` → `⧫`)

**Which cause it was: aesthetic, not width.** The suspicion (same class as the `☰`→`≡` fix) was that
`⬢` occupied two cells. It does not: U+2B22 measures **1** in the app's table and renders in **1** cell
in the terminal (§3). So the activity strip was never misaligned and no invariant was being violated —
the hexagon simply carries more ink than `≡ ⑂ ⌕ ⚙` beside it, which is exactly what "too big compared
to other activity bar glyphs" describes. There is therefore **no width-authority finding to record for
this slot**; the finding was elsewhere (§7).

**Chosen:** `⧫` U+29EB BLACK LOZENGE, the coordinator's recommendation, taken after verification.
Solid (no fine internal detail that can vanish — the failure that killed `⊞`), slimmer ink than the
hexagon, keeps a package-like read, one cell in both authorities, and East-Asian-Width **Neutral**
rather than Ambiguous — narrow by classification instead of by hope, which also removes a latent risk
`⬢` carried even though this terminal agreed on its width. Claimed by no other surface (asserted
through `markOwnersFor`, not a pasted list). The `ascii` rung stays `X` (it was fine) and the nerd row
`\u{f487}` is untouched.

**Rejected for this slot:** `⊞` (already rejected by the user); `❖` (the `css` file mark); `⬡` (the
`wasm` mark, and confusable with `⬢`); anything in the reserved set; `⬢` reused for `.js` — tempting
because the Node logo is a hexagon and it would have resolved the `●` collision, but it would have put
solid and hollow hexagons (`⬢` js, `⬡` wasm) in the **same** tree column, which is the confusability
the existing test comment already warns about.

**Driven:** `smoke-activitybar-harness` derives its expectations from the slot lookup, so the swap did
not re-break it. Grid evidence, run 3 of 3:

```
  PASS  unicode activity glyph slot renders ≡
  PASS  unicode activity glyph ≡ occupies exactly one terminal cell
  PASS  unicode activity glyph slot renders ⑂
  PASS  unicode activity glyph ⑂ occupies exactly one terminal cell
  PASS  unicode activity glyph slot renders ⧫
  PASS  unicode activity glyph ⧫ occupies exactly one terminal cell
  PASS  unicode activity rows keep the sidebar edge in one column
```

The last line is the alignment claim: every activity row's glyph is at column 2 and the sidebar edge
stays in one column, read from the emulator grid.

**Bare-token sweep** (no quoting assumption): `grep -rn '⬢' src scripts *.md` returns only the two
historical comments deliberately kept (`ThemeIcons.ts`, `ThemeIcons.test.ts`), the smoke's history
comment, and a `project.handoff.md` snapshot. `grep -rn '●' src scripts *.md` returns only the tab
marker's own sites plus documentation. Both marks are gone from every live resolution path.

---

## 6. Driven real-path evidence

Real tsgo, real PTY, real emulator grid, at a caret where kinds genuinely differ (`this.` in a class
method returns a method **and** data members). The glyph tier is forced to `unicode` via a per-run
`HOME/.config/invar/settings.json`, because a PTY without `LANG` would otherwise detect the ascii rung.

```
== harness completion: real tsgo trigger, narrowing, and acceptance ==
  PASS  a field and a property resolve to one value-family mark, so this claim holds whichever of the
        two kinds the server chooses for a class member
  PASS  the callable family and the value family do not share a mark, so the grid comparison below can
        distinguish them
  grid row 12: " ▪ property           "
  grid row 13: " ▪ power              "
  grid row 14: " ƒ method             "
  PASS  a real TypeScript member access paints a different mark for a callable than for a value
  PASS  real tsgo completion fills the selected property
```

How the assertions are written, against the rules that have cost this project time:

- **No control is found by appearance.** Rows are located by item **TEXT**; the expected marks come
  from `CompletionItemKinds.Class.symbolClassFor(kind)` → `ThemeIcons.Class.symbolMarkFor(tier, class)`.
  No glyph literal appears in the drive. A vocabulary change cannot re-break it.
- The kind numbers in the drive (2 Method, 5 Field, 10 Property) are **protocol facts** about what a
  TypeScript server answers, not appearance. The drive additionally asserts that Field and Property
  resolve to the same mark, so the claim holds whichever the server picks.
- **The label column is the width proof on the real path.** The drive computes the label column from
  the popup's *published* `listIconColumns` geometry and requires the label to start exactly there. Had
  the terminal rendered the mark in a different number of cells than the app reserved, the labels would
  not line up and the condition would time out.
- The 5,000-item drive additionally asserts `listIconColumns === 1` and reads the callable mark beside
  `push_str` from the grid.

---

## 7. Flat latency (re-measured)

`bun scripts/harness/measure-completion-list-latency.ts` at 10 / 1,000 / 5,000 items. Measured at the
fork point, after commit 1, and at branch HEAD.

| items | key med (ms) | key p95 | **key popup update (ms)** | wheel med (ms) | **wheel popup update (ms)** | frames | bytes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **BEFORE `e12206e`** | | | | | | | |
| 10 | 14.34 | 15.59 | 0.070 | 88.47 | 0.111 | 1 | 173 |
| 1,000 | 15.46 | 15.87 | 0.073 | 88.27 | 0.191 | 1 | 173 |
| 5,000 | 14.59 | 18.64 | 0.082 | 86.38 | 0.082 | 1 | 173 |
| **HEAD `992d835`** | | | | | | | |
| 10 | 15.17 | 16.39 | 0.075 | 86.73 | 0.113 | 1 | 175 |
| 1,000 | 15.44 | 17.67 | 0.081 | 85.71 | 0.114 | 1 | 175 |
| 5,000 | 15.03 | 16.61 | 0.082 | 86.72 | 0.106 | 1 | 175 |

**Flat in item count** (popup update 0.075 → 0.081 → 0.082 ms across a 500× item increase; key latency
15.17 → 15.44 → 15.03 ms, i.e. noise) and **unchanged against the pre-change baseline**. Frame count
stays 1 and frame bytes rise by 2 — the two extra painted columns, which is the only cost that should
exist. `completionRequestDelta` and `completionFilterDelta` are 0 at every scale, so movement and wheel
still issue zero requests and zero refilters.

Why it stays flat by construction: `popupItems` reads the tier's **whole mark row once per rebuild**
(`theme.symbolMarks`) and then does one plain property lookup per item, so marking 5,000 items is 5,000
property reads and **no** theme resolution; a movement or wheel frame does no per-item work at all,
because the visible rows already carry their mark and `BoundedListPopup` already sized the icon column
once per item set. No new per-item work was added to any paint path.

---

## 8. Exit codes (exact, at branch HEAD)

| command | exit |
| --- | --- |
| `bunx tsc --noEmit` | **0** |
| `bun test` (1433 pass, 0 fail, 16602 expect calls) | **0** |
| `bun scripts/check-file-grammar.ts` | **0** |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all` | **0** |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --refs` (0 problems) | **0** |
| `bash scripts/conventions-gate.sh` | **0** |
| `bun scripts/check-coverage-ratchet.ts` | **0** |
| `bash scripts/behavioral-contracts.sh` | **0** |

Smokes, three runs each (all post-swap, at HEAD):

| smoke | run 1 | run 2 | run 3 |
| --- | --- | --- | --- |
| `scripts/harness/smoke-completion-harness.ts` | 0 | 0 | 0 |
| `scripts/harness/smoke-bounded-list-popup-harness.ts` | 0 | 0 | 0 |
| `scripts/harness/smoke-activitybar-harness.ts` | 0 | 0 | 0 |

Additional single runs covering the surfaces the changed `.js` mark touches:
`smoke-tree-scroll-harness` 0, `smoke-quickopen-harness` 0, `smoke-layout-harness` 0.

`scripts/merge-gate.sh` was not run, per the brief.

---

## 9. Contracts recorded

- **NEW** `One table resolves every symbol mark` (`src/modules/theme/theme.invariants.md`) — the
  reduction, with Scope, Mechanism, Generates, **Rejected alternatives**, Evidence, Impossible-if-true,
  Verification.
- **REFRESHED** `The glyph ladder degrades icons single-cell and legible` — it described `$sets`,
  `iconSetFor`, and `set.ext[extension] ?? set.file`, none of which exist now. Extended with the
  code-symbol one-cell requirement, the mark-ownership rule, and the width-agreement instrument in
  Impossible-if-true. Its Open question is replaced by the mechanism + the `⚙` question (§4).
- **REFRESHED** `Appearance comes only from theme data` — `IconSet` → `SymbolClass`, `Theme.icons` →
  `Theme.symbolMarks`, and the one known breach (`TabBarRenderer`'s `●` literal) now named in Evidence.
- **REFRESHED** `Completion is provider-neutral` (`lsp.invariants.md`) — `item.kind` stays a protocol
  number and `CompletionItemKinds` is now the only place that interprets it; Impossible-if-true gained
  "a `CompletionItemKind` number interpreted outside `CompletionItemKinds`".
- **REFRESHED** `Completion reuses bounded popup geometry` (`ui.invariants.md`) — the mark column is
  the shared row generator's, not completion's; Impossible-if-true gained "a completion-specific mark
  column measured outside the shared row generator".
- `project.coverage-deltas.md` — five APPENDED rows in the counted grammar (never a rewrite of the
  table): `ThemeIcons.test.ts` 24 → 41 → 48 assertions / 10 → 16 → 19 waits,
  `CompletionItemKinds.test.ts` 0 → 10 / 0 → 4, `smoke-completion-harness.ts` 13 → 17 / 18 → 20,
  and `BreadcrumbPicker.test.ts` 19 → 19 / 2 → 2 (vocabulary substitution, same claim).

---

## 10. Defects found and NOT fixed

1. **The app and the terminal disagree about the two wide file pictographs.** `lineWidth` measures
   `🔒` (U+1F512) and `🖼` (U+1F5BC) at **2** cells; `@xterm/headless` renders each in **1**. The app
   therefore reserves a column the terminal does not use, so a tree or breadcrumb list containing a
   lock or image file is one column wider than its content. This is the #95 defect class, and an
   existing test asserts the 2-cell measurement as *intended*. It is now **enumerated** by the
   width-agreement test, so a third disagreement fails the gate — but choosing which authority is
   right (text-presentation pictographs are narrow; emoji-presentation are wide, and xterm's table may
   simply predate the emoji widening) moves the tree's layout and needs a real terminal to settle.
   **Not fixed: needs a decision plus a layout change on a surface I was asked to stay out of.**

2. **`⚙` means four things, two of them in the same column.** `.sh` and `.yaml`/`.toml` rows are
   visually identical in the tree, the breadcrumb popup, and now completion. Declared with a dated
   reason so it cannot be forgotten; **not fixed** because it needs a chosen file-type mark, which
   changes the tree for every user (see §4).

3. **`TabBarRenderer` writes the dirty/active tab marker `●` as a literal**, not a theme slot — a
   direct breach of *Appearance comes only from theme data*, and the reason the ownership table needs
   one hard-coded entry. `TabBarRenderer.ts` is on the do-not-touch list. **Not fixed; now named in the
   contract's Evidence.** The fix is a `dirtyMarker` slot in `InterfaceGlyphVocabulary`.

4. **`❯` is both the buffer-tab separator and the status-bar terminal affordance** — declared, dated,
   unresolved (§4).

5. **The nerd tier does not use codicons for the code-symbol families.** Not a defect in what shipped
   (the marks are correct and portable), but the tier is not as rich as it could be. Blocked on being
   able to verify Nerd-Font code points against an installed font (§2).

6. **`▤` appears in three recorded terminal-emulator fixtures** (`terminal-emulator-recorded-*.expected.json`)
   as an activity-bar glyph from an older vocabulary. Harmless — those fixtures replay stored BYTES, so
   they are independent of the current vocabulary — but worth knowing that the `module` mark's code
   point has historical usage in this repo. No action taken.

---

## 11. Required follow-up (blocked by scope, not judgement)

- **None for the tree renderer.** The reduction did *not* require editing `TreePaneRenderer` — the
  resolver changed and the tree's call-site shape (`Theme.icon(name, isDir, open)`) was preserved
  exactly, so the off-limits file was never touched. Nothing is owed here.
- Extend `$markOwnerships` to the git-panel action buttons, checkboxes, find-bar buttons, and
  transcript carets, and resolve or declare their collisions (§4).
- Resolve the `⚙` in-column ambiguity, and the `🔒`/`🖼` width disagreement (§10.1–10.2).
- Give the dirty tab marker a theme slot (§10.3).
