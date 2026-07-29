# READY: one input primitive everywhere (#299)

## Outcome

Commit `736eef848033916be2d3583cd150905fd71abee9` makes selection, selected-text
copy, and selection-aware editing part of the shared input generator.

[`TextInputModel`](../../../../src/modules/text/TextInputModel.ts) now owns the
selection anchor, grapheme range, selected text, exact copy, Shift movement,
select-all, and edit-over-selection behavior. An unselected copy is a defined
no-op which publishes zero copied characters.

[`TextFieldPainter`](../../../../src/modules/ui/TextFieldPainter.ts) now paints
the model's selection with one theme-derived tone. Structure, breadcrumb,
palette, Quick Open, find, go-to-line, and database fields inherit this paint.
The wrapped agent composer keeps its own row projection, but now maps pointer
and keyboard selection into the same `TextInputModel` range.

The structure search mark now has one leading cell. Its active field and the
breadcrumb search both use the shared focused tone.

## Census

The structural census found eight owner classes and nine model roles. Every
editable one-logical-line surface now uses `TextInputModel`. Every single-line
surface uses `TextFieldPainter`.

| Surface | Input generator | Painter or projection | Result |
| --- | --- | --- | --- |
| Structure filter | [`StructureOutline.filterInput`](../../../../src/modules/structure/StructureOutline.ts) | [`StructurePaneRenderer`](../../../../src/modules/structure/StructurePaneRenderer.ts) | Shared model and painter |
| Breadcrumb search | [`BoundedListPopup.queryInput`](../../../../src/modules/ui/BoundedListPopup.ts) through [`BreadcrumbPicker`](../../../../src/modules/ui/BreadcrumbPicker.ts) | `TextFieldPainter` in `BoundedListPopup` | Shared model and painter |
| Open Buffers search | `BoundedListPopup.queryInput` through [`TabBar`](../../../../src/modules/ui/TabBar.ts) | `TextFieldPainter` in `BoundedListPopup` | Shared model and painter when the popup is searchable |
| Layout search | `BoundedListPopup.queryInput` through [`CommandBar`](../../../../src/modules/ui/CommandBar.ts) | `TextFieldPainter` in `BoundedListPopup` | Shared model and painter when the item threshold shows search |
| Git branch-history search | `BoundedListPopup.queryInput` through [`GitPaneContent`](../../../../src/modules/git/GitPaneContent.ts) | `TextFieldPainter` in `BoundedListPopup` | Shared model and painter |
| Command Palette query | [`CommandRegistry.queryInput`](../../../../src/modules/commands/CommandRegistry.ts) | [`OverlayLayer`](../../../../src/modules/ui/OverlayLayer.ts) | Shared model and painter |
| Go to File query | [`QuickOpen.queryInput`](../../../../src/modules/search/QuickOpen.ts), file mode | `OverlayLayer` | Shared model and painter |
| Open Project Folder path | `QuickOpen.queryInput`, workspace-path mode | `OverlayLayer` | Shared model and painter |
| Find query | [`FindInBuffer.queryInput`](../../../../src/modules/search/FindInBuffer.ts) | [`FindBarRenderer`](../../../../src/modules/ui/FindBarRenderer.ts) | Shared model and painter |
| Find replacement | `FindInBuffer.replacementInput` | `FindBarRenderer` | Shared model and painter |
| Go-to-line input | [`GoToLinePrompt.input`](../../../../src/modules/navigation/GoToLinePrompt.ts) | `OverlayLayer` | Shared model and painter |
| Database connection path | [`DatabasePaneContent.pathInput`](../../../../src/modules/database/DatabasePaneContent.ts) | `TextFieldPainter` in `DatabasePaneContent` | Shared model and painter |
| Agent composer | [`AgentComposer.input`](../../../../src/modules/agent/AgentComposer.ts) | `AgentWordWrap` row projection | Shared model; wrapped projection is the declared painter exception |

The current Settings panel has no text filter. Context menus and confirmation
dialogs have no editable field. Panel Add hides the bounded popup search.
Terminal input belongs to its subprocess, and there is no terminal-rename
field. Full source editors are outside the one-line input rule.

The named structure and breadcrumb surfaces already composed the shared model
and painter when this branch started. Their defect was missing generator
capability and routing. The agent composer was the one non-conforming
selection consumer: it held a second `TextSelectionModel` and a second copy
implementation. That duplicate is removed.

## Shared behavior

[`KeybindingDefaults.textInputBindings`](../../../../src/modules/keybindings/KeybindingDefaults.ts)
now emits one selection and copy vocabulary for every field context:

- Shift+Left and Shift+Right select by grapheme.
- modified Shift+arrows select by word or field edge.
- Ctrl+A and the macOS primary-modifier alias select all.
- Ctrl+C and the macOS primary-modifier alias copy the active input selection.
- plain movement declares `shift: false`, so it cannot swallow a selection
  gesture.
- existing Backspace, Delete, word deletion, line deletion, and movement still
  use the same table.

[`Bootstrap`](../../../../src/modules/app/Bootstrap.ts) resolves one active
text-input port, then sends edit and copy actions through it. Agent Ctrl+C
keeps transcript ownership and delegates to the composer model when the
composer has the selection.

All insertion and deletion actions replace an active selection. Copy preserves
the selection. Plain movement clears it. Copy slices the exact UTF-8 text at
grapheme boundaries through the existing
[`Clipboard`](../../../../src/modules/system/Clipboard.ts) seam.

## Bypass control

`bun scripts/ast-query.ts text-input-census --require-zero` reports
`0 match(es)` in the source tree.

The conventions gate now runs the same census against the known-bad
[`IndependentFilterInput`](../../../../scripts/fixtures/text-input-census-positive-control/IndependentFilterInput.ts)
first. The planted class produces one match and exit code 1. The real source
tree then produces zero matches and exit code 0. A consumer which owns its own
query state and editing behavior is therefore mechanically catchable.

## Real PTY evidence

The default structure drive typed `alpha beta`, selected `ta` with two
Shift+Left gestures, and copied two characters. The published SHA-256 was
`76592b9de6d38238a52a3651867871e5c670e6320a8ef46a84b5590f8933f33e`.
Unselected copy published `0`. Alt+Backspace left `alpha `.

The breadcrumb drive produced the same selected-copy count and hash. The
published caret moved from grapheme 10 to 8. Its search row used the shared
focused tone. The structure PTY smoke also observed the same focused tone in
the new leading cell before the search mark.

Direct PTY drives also proved selected and unselected copy in go-to-line and
the database path. The shared input smoke proves both copy polarities,
selection paint, Alt+Backspace, and Alt+Delete through open-project, Command
Palette, and find. The bounded-popup smoke proves the same behavior through
the popup instance used by breadcrumb search. The agent smoke proves pointer
selection, Shift selection, exact copy, unselected copy, and word deletion in
the wrapped composer.

## Scale parity

The existing documented structure fixture generator in
[`282-scrollbar-drag-history-probe.ts`](../../completed/282-scrollbar-drag-broken-and-horizontal-thickness/282-scrollbar-drag-history-probe.ts)
now has a `filter-input` mode. No second large-fixture generator was added.

| Surface | Scale | Input fingerprint |
| --- | ---: | --- |
| Structure | 500 lines | `unselectedCopy:0, selectedCopy:2, wordDelete:"alpha "` |
| Structure | 100,000 lines | `unselectedCopy:0, selectedCopy:2, wordDelete:"alpha "` |
| Breadcrumb | 10 lines | caret `10→8`, copied `2`, hash `76592b9d…f8933f33e` |
| Breadcrumb | 100,000 lines | caret `10→8`, copied `2`, hash `76592b9d…f8933f33e` |

The structure scroll projection also stayed identical across document scale:
the right-dock drag sequence was `0,45,90,136` at both 500 and 100,000 lines.

## Contract changes

The records now state that the input model owns selection and copy, the
single-line painter owns selection paint, structure filtering uses both shared
seams, every selected input copies through the clipboard seam, and the agent
composer has no second selection generator:

- [`project.invariants.md`](../../../../project.invariants.md)
- [`ui.invariants.md`](../../../../src/modules/ui/ui.invariants.md)
- [`text.invariants.md`](../../../../src/modules/text/text.invariants.md)
- [`structure.invariants.md`](../../../../src/modules/structure/structure.invariants.md)
- [`system.invariants.md`](../../../../src/modules/system/system.invariants.md)
- [`agent.invariants.md`](../../../../src/modules/agent/agent.invariants.md)

The invariant checker resolved 1,140 annotations and 220 lattice links with
zero problems.

## Verification

- `bun test`: 1,951 passed, 0 failed, across 297 files.
- `bash scripts/conventions-gate.sh`: passed, including typecheck, file
  grammar, the planted text-input control, and the zero-match real census.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`:
  1,140 annotations, 220 lattice links, 0 problems.
- [`smoke-text-input-harness.ts`](../../../../scripts/harness/smoke-text-input-harness.ts):
  all passed.
- [`smoke-field-caret-harness.ts`](../../../../scripts/harness/smoke-field-caret-harness.ts):
  all passed.
- [`smoke-plugin-manifest-harness.ts`](../../../../scripts/harness/smoke-plugin-manifest-harness.ts):
  all passed.
- [`smoke-agent-pane-ux-harness.ts`](../../../../scripts/harness/smoke-agent-pane-ux-harness.ts):
  all passed.
- [`smoke-database-harness.ts`](../../../../scripts/harness/smoke-database-harness.ts):
  all passed.
- [`smoke-word-delete.sh`](../../../../scripts/smoke-word-delete.sh): all
  passed.
- `bash scripts/behavioral-contracts.sh`: all passed.
- The worktree is clean.

The pre-commit merge-gate run was red for unrelated intermittent checks. Its
second full-unit run captured one stale Markdown grid although status already
reported `markdownParsing=false`; the exact
[`Drive.test.ts`](../../../../scripts/harness/Drive.test.ts) rerun then passed
11 of 11. The gate also reported the scrollbar and panel-chrome smokes as
timeout-class failures which passed on their built-in retries. The task
commit used the acknowledged `SKIP_GATE=1` hook after the clean deliberate
verification above. The conductor still owns the landing gate.

## Bycatch

- The merge-gate's `Drive.test.ts` Markdown-settle case captured a stale
  “Parsing Markdown…” frame once. The same test passed in the earlier full
  suite and in the immediate 11-test rerun. It did not reproduce a second
  time.
- The merge-gate reported one timeout-class scrollbar smoke failure. Its
  built-in retry passed. I did not reproduce it separately.
- The merge-gate reported one timeout-class panel-chrome smoke failure. Its
  built-in retry passed. I did not reproduce it separately.
