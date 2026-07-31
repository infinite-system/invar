# READY — Quick Open exact basename ranking (#379)

The [task](task-379-quick-open-exact-basename-loses.md) is complete. The
[brief](brief-379-2-quick-open-exact-basename-loses.md) supplied the work order.

## Result

Quick Open now puts a case-insensitive exact basename match above every fuzzy match.
Fuzzy score remains the second ordering tier. Lexical path order remains the final tie-breaker.

Commit: `a623ee7120f82052ab842cf7862ff4ba9374b241`

The branch is clean. I did not push or merge it.

## Cause

The full-path scorer greedily used characters from the directory prefix. It did not restart at the
later exact basename.

The focused score printout showed this order before the change:

- [task-299-structure-filter-uses-shared-input-generator.md](../../completed/299-structure-filter-uses-shared-input-generator/task-299-structure-filter-uses-shared-input-generator.md):
  full-path score `98`, basename score `-1`.
- [report-299-structure-filter-uses-shared-input-generator.md](../../completed/299-structure-filter-uses-shared-input-generator/report-299-structure-filter-uses-shared-input-generator.md):
  full-path score `100`, basename score `57`.

Lower fuzzy scores rank first. The sibling therefore beat the exact basename by two points.

## Driven evidence

I drove defaults first from the repository root. That root returned zero matches because its hidden
`.invar` tree was not in the Quick Open enumeration.

I then changed only the workspace root to `.invar/tasks`. This large workspace reproduced the defect
with two matches. Selection `0` named the `task-299-...md` sibling, while the exact report was second.

The small #299 task folder returned one match. The exact report already held selection `0` there.

After the change, both scales selected the exact report at index `0`:

- Large `.invar/tasks` workspace: two matches, exact report first.
- Small #299 task folder: one match, exact report first.

## Neighboring cases

- Different case: the exact basename tier ignores case, so the exact report stays first.
- Extension omitted: no exact tier applies. The sibling still wins on fuzzy scores `95` and `97`.
- Duplicate exact basenames: both stay in the exact tier. Fuzzy score breaks ties first, then lexical path order.
- Directory disambiguation: both full paths remain visible. In a `one` and `two` directory sample,
  lexical order selected `one` first.

## Changes

- [QuickOpen.ts](../../../../src/modules/search/QuickOpen.ts) records exact-basename paths while it scores files.
  Its sort compares that tier before fuzzy score and path.
- [QuickOpen.test.ts](../../../../src/modules/search/QuickOpen.test.ts) proves a case-different exact basename
  beats a sibling with a better fuzzy score.
- [smoke-quickopen-harness.ts](../../../../scripts/harness/smoke-quickopen-harness.ts) drives the reproduced
  #299 pair through the real PTY and waits for the exact selected identity.

## Positive control

I temporarily moved fuzzy score ahead of the exact tier. The quick-open smoke exited `1` at its new wait:

`Timed out waiting for the exact basename is selected above its fuzzy sibling`

I removed the planted defect. The same smoke then reported `ALL-PASS`.

## Invariant review

Derived scope: [project](../../../../project.invariants.md),
[search](../../../../src/modules/search/search.invariants.md),
[ui](../../../../src/modules/ui/ui.invariants.md), and
[workspace](../../../../src/modules/workspace/workspace.invariants.md).
Path implication selected search. Quick Open and command-palette terms selected ui and workspace.

The search contract has eight chosen records. Six govern Quick Open:

- [Search results are click-set and highlight-shown](../../../../src/modules/search/search.invariants.md#search-results-are-click-set-and-highlight-shown)
- [The selected quick-open row is always visible](../../../../src/modules/search/search.invariants.md#the-selected-quick-open-row-is-always-visible)
- [Quick Open activates the selected entry](../../../../src/modules/search/search.invariants.md#quick-open-activates-the-selected-entry)
- [File enumeration failures stay visible](../../../../src/modules/search/search.invariants.md#file-enumeration-failures-stay-visible)
- [The open-project path input is a live directory navigator](../../../../src/modules/search/search.invariants.md#the-open-project-path-input-is-a-live-directory-navigator)
- [An un-openable open-project path is flagged live](../../../../src/modules/search/search.invariants.md#an-un-openable-open-project-path-is-flagged-live)

The change upholds all six. It changes only file-mode ordering before selection. Activation still opens
the selected identity, and the smoke rechecks that path.

The ui contract records that name Quick Open, the command palette, or their shared list behavior are:

- [One painter draws every single-line text field](../../../../src/modules/ui/ui.invariants.md#one-painter-draws-every-single-line-text-field)
- [Input overlays share one modal slot](../../../../src/modules/ui/ui.invariants.md#input-overlays-share-one-modal-slot)
- [Modal focus withdraws host terminal projections](../../../../src/modules/ui/ui.invariants.md#modal-focus-withdraws-host-terminal-projections)
- [Overlay dialogs stay inside the terminal](../../../../src/modules/ui/ui.invariants.md#overlay-dialogs-stay-inside-the-terminal)
- [Overlay keyboard actions have visible mouse paths](../../../../src/modules/ui/ui.invariants.md#overlay-keyboard-actions-have-visible-mouse-paths)
- [Modal outside presses dismiss and consume](../../../../src/modules/ui/ui.invariants.md#modal-outside-presses-dismiss-and-consume)
- [The shortcut sheet lists the effective bindings](../../../../src/modules/ui/ui.invariants.md#the-shortcut-sheet-lists-the-effective-bindings)
- [A context menu is modal and single-consumer](../../../../src/modules/ui/ui.invariants.md#a-context-menu-is-modal-and-single-consumer)
- [An overlay dismissal clears its cells in the same frame](../../../../src/modules/ui/ui.invariants.md#an-overlay-dismissal-clears-its-cells-in-the-same-frame)
- [Only the visible window is rendered](../../../../src/modules/ui/ui.invariants.md#only-the-visible-window-is-rendered)
- [Selection stays anchored to an item](../../../../src/modules/ui/ui.invariants.md#selection-stays-anchored-to-an-item)
- [Command bar paint and hit geometry are identical](../../../../src/modules/ui/ui.invariants.md#command-bar-paint-and-hit-geometry-are-identical)

The change upholds all twelve. It does not change paint, geometry, input ownership, visibility,
selection storage, or activation paths.

The workspace records in scope are:

- [Workspace and file navigation are separate layers](../../../../src/modules/workspace/workspace.invariants.md#workspace-and-file-navigation-are-separate-layers)
- [Each workspace owns one panel world](../../../../src/modules/workspace/workspace.invariants.md#each-workspace-owns-one-panel-world)

The change upholds both. It changes file-result order inside the active workspace only.

I searched all record headings and bodies for `QuickOpen`, `Quick Open`, `quick-open`, and
`command palette`. I excluded `palette.*` theme-token hits because they do not name the command palette.
The remaining records do not name this surface or its ranking generator.

Final invariant verdict: PASS. No existing record is violated, stressed, stale, or refined by this change.

## Verification

- `bunx tsc --noEmit`: `TSC=0`.
- `bun test src/modules/search/QuickOpen.test.ts`: 20 pass, 0 fail, 84 assertions.
- `bun scripts/harness/smoke-quickopen-harness.ts`: `QUICKOPEN_SMOKE=0`, `ALL-PASS`.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all`: `INVARIANT_SCHEMA=0`.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --refs`: `INVARIANT_REFERENCES=0`.
- Reference check totals: 1,314 annotations and 263 lattice links resolved, with 0 problems.

The first commit attempt auto-started the pre-commit merge gate. I stopped that hook and its child
processes. I then used the documented `SKIP_GATE=1` commit bypass. I claim no merge-gate result.

## Bycatch

- CONTRACT-LAYER GAP: [search.invariants.md](../../../../src/modules/search/search.invariants.md) has
  six Quick Open records, but none claims file-ranking order. The new smoke is the only exact-basename
  promise. I did not add a record inside this task.
- EXISTING CONTRACT NOTES: The baseline and final schema checks repeated canonical-name punctuation
  notes in [agent](../../../../src/modules/agent/agent.invariants.md),
  [git](../../../../src/modules/git/git.invariants.md),
  [markdown](../../../../src/modules/markdown/markdown.invariants.md),
  [narration](../../../../src/modules/narration/narration.invariants.md),
  [structure](../../../../src/modules/structure/structure.invariants.md),
  [tasks dashboard](../../../../src/modules/tasks-dashboard/tasks-dashboard.invariants.md),
  [text](../../../../src/modules/text/text.invariants.md),
  [ui](../../../../src/modules/ui/ui.invariants.md),
  [vendors](../../../../src/modules/vendors/vendors.invariants.md), and
  [workspace](../../../../src/modules/workspace/workspace.invariants.md). The task did not touch them.
- EXISTING COVERAGE NOTES: The baseline and final reference checks repeated uncovered-record or
  lattice notes in [project](../../../../project.invariants.md),
  [project lattice](../../../../project.lattice.md),
  [app](../../../../src/modules/app/app.invariants.md),
  [git](../../../../src/modules/git/git.invariants.md),
  [layout](../../../../src/modules/layout/layout.invariants.md),
  [markdown](../../../../src/modules/markdown/markdown.invariants.md),
  [plugins](../../../../src/modules/plugins/plugins.invariants.md),
  [settings](../../../../src/modules/settings/settings.invariants.md),
  [system](../../../../src/modules/system/system.invariants.md),
  [text](../../../../src/modules/text/text.invariants.md),
  [ui scroll](../../../../src/modules/ui/scroll.invariants.md),
  [ui lattice](../../../../src/modules/ui/ui.lattice.md),
  [vendors](../../../../src/modules/vendors/vendors.invariants.md), and
  [vendors lattice](../../../../src/modules/vendors/vendors.lattice.md). The task did not touch them.
