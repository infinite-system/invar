# READY — Find and replace doctrine pass (#537)

The [task](task-537-find-replace-doctrine-pass.md) is complete. The
[brief](brief-537-1-find-replace-doctrine-pass.md) supplied the work order.

## In plain words

Find buttons did not change color under the pointer, and one replacement said
"1 items." Search also said "1 files." I gave both Search surfaces the same
count words, button states, and driven scrollbar proof. These paths now hold at
10 and 100,000 lines.

## Result

The two Search surfaces now follow the six UI doctrine chapters. The
[implementation design](../../../../project-find-replace-design.md) stayed the
source design. Its section 12 records remain proposals. I did not move them into
the contract layer.

[SearchCountText.ts](../../../../src/modules/search/SearchCountText.ts) is the
one count-word seam. It generates result, file, and replacement-item nouns for
both surfaces. The workspace summary now paints `10 results in 1 file`. In-file
Replace All, Undo, and Redo now paint `1 item`.

[FindBarRenderer.ts](../../../../src/modules/ui/FindBarRenderer.ts) now paints
rest, hover, pressed, and on states. [OverlayLayer.ts](../../../../src/modules/ui/OverlayLayer.ts)
uses the renderer's stored half-open button zones for every pointer phase. A
release activates only the button pressed at the start.

The workspace Search buttons now keep readable foreground contrast while
pressed. The workspace Search smoke now finds the painted vertical thumb and
drags it through the shared scrollbar driver.

Commit: `5ac7e4a5f4cb3dc73e58d1d86de511eeff5507bd`

I did not push, merge, tag, or run `scripts/merge-gate.sh`.

## Driven doctrine table

| Chapter | In-file Find/Replace | Workspace Search |
| --- | --- | --- |
| Buttons | FIXED. `Aa` changed through rest `1447454`, hover `1974318`, and pressed `8037111`. The pressed foreground stayed distinct. Escape during a held regex press restored rest without toggling. Dragging a held whole-word press outside also left it off. Two immediate case clicks produced `false → true → false`, with state checked after each click. | PASS. One projection supplies the `Aa`, `ab`, regex, and ignore zones. Rest, hover, pressed, and on states were distinct. Pressed text kept contrast. The Search activity button hid and reopened the pane. |
| Dialogs | FIXED. The dialog painted `Replace 1 item in scale-10.txt?` and one undo-step consequence. Cancel had one-cell padding. Escape kept revision `1`. Selected dialog text copied `Replace` as 7 characters. | PASS. The dialog painted `Replace 1 item across 1 file?`. The safe No action held focus. Escape caused no mutation. Selected dialog text copied `Replace` as 7 characters. |
| Flows | PASS. Replace changed revision `1 → 2`. Cancelled Undo held `2`. Confirmed Undo restored the text at revision `3`. Redo stated the one-item consequence. Mid-press Escape left no stale state. | PASS. Apply, cancel, drift checks, Undo, and Redo passed at both scales. The missing-ripgrep path stated the failure and recovery action. Repeated dismissals kept the selected match dismissed. |
| Text input | PASS. Query and replacement fields handled Home, Shift+End, copy, Alt+Left, Alt+Right, Alt+Backspace, and Alt+Delete. `orbit amber quartz` became `amber quartz` through word deletion. | PASS. Query, replacement, include, and exclude fields handled the same actions. Each step checked the graph value before the next action. |
| Scroll | Not applicable. The in-file overlay has no scrolling result area. Its bounded content stayed inside an `80×24` terminal. | FIXED. PageDown, wheel momentum, contrary input, top and bottom limits, and thumb drag shared one position. The final smoke recorded `28→1873→3745→5618`. The drag left result selection unchanged. |
| Copy text | PASS. Query, replacement, and dialog selections copied through OSC 52 with visible character counts. | PASS. Input, result, and dialog text copied through the shared selection and clipboard seams. The existing result-copy arm passed at both scales. |

## Scale, width, and capability evidence

- The final workspace smoke passed at 10 and 100,000 lines. The large query
  produced 20,000 capped matches without changing the visible interaction path.
- The large manual Search drive moved from row `33` to `5618` by thumb drag,
  then to the true bottom `19976`. A contrary wheel moved it to `19975`.
- The narrow `80×24` drive kept both surfaces inside the terminal. Workspace
  ASCII `content` painted `10 results in 1 file`. Unicode `é` painted
  `0 results in 0 files`.
- The final in-file mouse smoke forced `NERD_FONT=0`, `TERM_PROGRAM=xterm`, and
  `LANG=C`. Its ASCII Replace control and dialog path passed.
- The default Unicode drive painted the theme glyph tier. No changed code
  hardcodes a capability tier.

## Positive controls

- I forced the shared result and file nouns to stay plural. The renderer test
  rejected the singular summary. I restored the seam before the final pass.
- I forced `itemNoun(1)` to return `items`. The unit test rejected it. The PTY
  smoke also showed `Replace 1 items in sample.txt?` and failed. I restored the
  singular branch.
- I removed the workspace Search scrollbar extent. The new smoke failed with
  `FAIL the Search vertical thumb is not painted`. I restored the extent.
- I added the Find hover assertion before the renderer change. It timed out on
  `the Find Aa button paints its hover state`. The same assertion passed after
  the change.

## Invariant review

The derived scope is [search](../../../../src/modules/search/search.invariants.md),
[UI](../../../../src/modules/ui/ui.invariants.md),
[scroll](../../../../src/modules/ui/scroll.invariants.md),
[app](../../../../src/modules/app/app.invariants.md), and
[project](../../../../project.invariants.md). Search paths and terms implicated
these contracts. Dialog, input, pointer, and scrollbar behavior added the UI,
scroll, app, and project contracts.

### Search records

| Record | Verdict | Evidence |
| --- | --- | --- |
| [Search results are click-set and highlight-shown](../../../../src/modules/search/search.invariants.md#search-results-are-click-set-and-highlight-shown) | Upheld | Workspace result click, hover, keyboard selection, dismissal, and copy passed at both scales. |
| [The selected quick-open row is always visible](../../../../src/modules/search/search.invariants.md#the-selected-quick-open-row-is-always-visible) | Untouched | This change did not alter Quick Open windowing. Its neighboring mouse arm still passed. |
| [Quick Open activates the selected entry](../../../../src/modules/search/search.invariants.md#quick-open-activates-the-selected-entry) | Untouched | The existing click-open arm still opened `sample.txt`. |
| [Exact basenames rank above fuzzy paths](../../../../src/modules/search/search.invariants.md#exact-basenames-rank-above-fuzzy-paths) | Untouched | No ranking code changed. |
| [File enumeration failures stay visible](../../../../src/modules/search/search.invariants.md#file-enumeration-failures-stay-visible) | Untouched | No file enumeration code changed. |
| [Find bar controls are mouse-clickable buttons](../../../../src/modules/search/search.invariants.md#find-bar-controls-are-mouse-clickable-buttons) | Strengthened | Hover and press now paint from the same zones used for hit testing and activation. The PTY smoke locks the states and contrast. |
| [Find options re-run the active query](../../../../src/modules/search/search.invariants.md#find-options-re-run-the-active-query) | Upheld | The `Aa` click changed four matches to one. Whole-word and regex published their active state. |
| [The open-project path input is a live directory navigator](../../../../src/modules/search/search.invariants.md#the-open-project-path-input-is-a-live-directory-navigator) | Untouched | Its sibling drive still filtered two folders and drilled into the clicked folder. |
| [An un-openable open-project path is flagged live](../../../../src/modules/search/search.invariants.md#an-un-openable-open-project-path-is-flagged-live) | Untouched | Its sibling warning arm still painted a distinct alert. |

### Implicated cross-contract records

- [Seams are drawn at the shared generator](../../../../project.invariants.md#seams-are-drawn-at-the-shared-generator)
  is strengthened. Both surfaces now use one count-word generator.
- [Editable text fields share one input model](../../../../project.invariants.md#editable-text-fields-share-one-input-model)
  is upheld. The manual drive covered every Search field.
- [Appearance is data with a capability fallback](../../../../project.invariants.md#appearance-is-data-with-a-capability-fallback)
  is upheld. Unicode and ASCII paths both passed.
- [Panel controls share paint and hit geometry](../../../../src/modules/ui/ui.invariants.md#panel-controls-share-paint-and-hit-geometry)
  and [Overlay keyboard actions have visible mouse paths](../../../../src/modules/ui/ui.invariants.md#overlay-keyboard-actions-have-visible-mouse-paths)
  are strengthened by the one-zone pointer path.
- [One painter draws every single-line text field](../../../../src/modules/ui/ui.invariants.md#one-painter-draws-every-single-line-text-field),
  [Input overlays share one modal slot](../../../../src/modules/ui/ui.invariants.md#input-overlays-share-one-modal-slot),
  [Overlay dialogs stay inside the terminal](../../../../src/modules/ui/ui.invariants.md#overlay-dialogs-stay-inside-the-terminal),
  and [Renderables hold no model state](../../../../src/modules/ui/ui.invariants.md#renderables-hold-no-model-state)
  are upheld.
- [A scrollbar track is derived per frame from its region rect](../../../../src/modules/ui/ui.invariants.md#a-scrollbar-track-is-derived-per-frame-from-its-region-rect),
  [One scrollbar painter gives each axis equal visual weight](../../../../src/modules/ui/ui.invariants.md#one-scrollbar-painter-gives-each-axis-equal-visual-weight), and
  [One generator owns each scroll position](../../../../src/modules/ui/scroll.invariants.md#one-generator-owns-each-scroll-position)
  are upheld by the painted-thumb drive.
- [Quit requires explicit confirmation](../../../../src/modules/app/app.invariants.md#quit-requires-explicit-confirmation)
  is upheld as the dialog-family exemplar. Search uses the same safe-default,
  padded-button, and Escape behavior.
- [Small counts state their attachment](../../../../design.invariants.md#small-counts-state-their-attachment)
  is strengthened by `1 result in 1 file` and `1 item` copy.

Final invariant verdict: PASS. No implicated record is violated, stressed,
stale, or refined. The implementation strengthens four chosen records and
upholds the rest. It does not need a contract edit.

## Verification

- `bun test`: exit `0`. `2499` tests passed across `386` files, with `72,882`
  expectations and `0` failures.
- `bunx tsc --noEmit`: exit `0`.
- `bun scripts/harness/smoke-search-mouse-harness.ts`: exit `0`, `ALL-PASS`.
- `bun scripts/harness/smoke-workspace-search-harness.ts`: exit `0`,
  `ALL-PASS` at 10 and 100,000 lines.
- `bash scripts/conventions-gate.sh`: exit `0`.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all`: exit
  `0`.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --refs`: exit
  `0`. It resolved `1,428` annotations and `287` lattice links with `0`
  problems.
- `bash scripts/behavioral-contracts.sh`: exit `1`. Every Search contract
  passed. One unrelated Structure scrollbar diagnostic timed out. The
  targeted plugin-manifest smoke then passed in `10.3` seconds. See Bycatch.

## Bycatch

- RUNTIME, DID NOT REPRODUCE: The full behavioral pass timed out at
  `smoke-plugin-manifest-harness.ts:74`. It waited 15 seconds for Structure
  scrollbar diagnostic geometry. The same smoke passed on the second run.
  It found the scrollbar and completed every later plugin arm in `10.3`
  seconds. I did not change Structure or diagnostic code.
- CONTRACT NAMES, REPRODUCED: The baseline and final schema checks reported
  old punctuation in record names under
  [agent](../../../../src/modules/agent/agent.invariants.md),
  [git](../../../../src/modules/git/git.invariants.md),
  [markdown](../../../../src/modules/markdown/markdown.invariants.md),
  [narration](../../../../src/modules/narration/narration.invariants.md),
  [structure](../../../../src/modules/structure/structure.invariants.md),
  [tasks dashboard](../../../../src/modules/tasks-dashboard/tasks-dashboard.invariants.md),
  [text](../../../../src/modules/text/text.invariants.md),
  [UI](../../../../src/modules/ui/ui.invariants.md),
  [vendors](../../../../src/modules/vendors/vendors.invariants.md), and
  [workspace](../../../../src/modules/workspace/workspace.invariants.md).
  These names predate this task. I did not rename them.
- CONTRACT COVERAGE, REPRODUCED: The baseline and final reference checks
  reported existing unreferenced records or lattice entries in
  [design](../../../../design.invariants.md),
  [project](../../../../project.invariants.md),
  [project lattice](../../../../project.lattice.md),
  [harness](../../../../scripts/harness/harness.invariants.md),
  [app](../../../../src/modules/app/app.invariants.md),
  [git](../../../../src/modules/git/git.invariants.md),
  [layout](../../../../src/modules/layout/layout.invariants.md),
  [markdown](../../../../src/modules/markdown/markdown.invariants.md),
  [settings](../../../../src/modules/settings/settings.invariants.md),
  [text](../../../../src/modules/text/text.invariants.md),
  [scroll](../../../../src/modules/ui/scroll.invariants.md),
  [UI](../../../../src/modules/ui/ui.invariants.md),
  [UI lattice](../../../../src/modules/ui/ui.lattice.md),
  [vendors](../../../../src/modules/vendors/vendors.invariants.md), and
  [vendors lattice](../../../../src/modules/vendors/vendors.lattice.md).
  I did not add annotations outside this task.
- CONVENTIONS, REPRODUCED: The conventions gate reported 21 allowed legacy
  file-grammar violations in Monitoring, Plugins, Text, Vendors, and Vue.
  It still exited `0`. I did not change those modules.

## Worktree state

The commit contains only the 11 task files. The worktree still contains the
dispatch-injected [AGENTS.md](../../../../.invar/worktrees/537-find-replace-doctrine-pass/AGENTS.md)
change and untracked
[BUILDER-FUNDAMENTALS.md](../../../../.invar/worktrees/537-find-replace-doctrine-pass/BUILDER-FUNDAMENTALS.md).
I did not edit or commit them.
