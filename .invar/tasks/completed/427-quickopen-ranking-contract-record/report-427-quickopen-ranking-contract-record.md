# READY — Quick Open ranking contract record (#427)

The [task](task-427-quickopen-ranking-contract-record.md) is complete. The
[brief](brief-427-2-quickopen-ranking-contract-record.md) supplied the work order.

## Result

The [search contract](../../../../src/modules/search/search.invariants.md#exact-basenames-rank-above-fuzzy-paths)
now records the three Quick Open file-ranking tiers:

1. Case-insensitive exact basename matches rank above every fuzzy match.
2. Fuzzy score ranks paths within each tier.
3. Lexical path order breaks equal scores.

[QuickOpen.ts](../../../../src/modules/search/QuickOpen.ts) now points from the file-mode sort seam
back to this record.

Commit: `6a0f378258f37e6f816dd40a79ffa4d1ef19dfe1`

The branch is clean. I did not push or merge it.

## Evidence

The [score-printout diagnosis from #379 (Quick Open exact basename ranking)](../../completed/379-quick-open-exact-basename-loses/report-379-quick-open-exact-basename-loses.md#cause)
records the old full-path fuzzy scores. The sibling scored `98`, and the exact basename scored `100`.
Lower fuzzy scores ranked first, so a fuzzy-only order selected the sibling.

The new record cites that diagnosis and the exact-basename wait in
[smoke-quickopen-harness.ts](../../../../scripts/harness/smoke-quickopen-harness.ts).

## Driven evidence

I drove the default app first with `bun run drive`. It settled with exit `0`.

I then drove the full basename at both file-population scales:

- Small #299 task folder: one match, selection `0`, exact report selected.
- Large `.invar/tasks` workspace: two matches, selection `0`, exact report selected.

After the record and annotation change, the Quick Open PTY smoke selected the same exact report.
It finished with `ALL-PASS`.

## Positive control

I temporarily changed `basenames` to `basename` in the new annotation.
The reference checker exited `1` and named the orphan at `QuickOpen.ts:516`.
It also reported that no annotation referenced the new record.

I restored the exact name. The final reference check resolved 1,319 annotations with 0 problems.

## Invariant review

The six existing Quick Open records do not contradict the new ranking record:

- [Search results are click-set and highlight-shown](../../../../src/modules/search/search.invariants.md#search-results-are-click-set-and-highlight-shown)
  remains upheld. Ranking sets the initial row, while click, hover, and keyboard ownership stay unchanged.
- [The selected quick-open row is always visible](../../../../src/modules/search/search.invariants.md#the-selected-quick-open-row-is-always-visible)
  remains upheld. Ranking changes model order, not windowing or pointer mapping.
- [Quick Open activates the selected entry](../../../../src/modules/search/search.invariants.md#quick-open-activates-the-selected-entry)
  remains upheld. Activation still opens the selected `QuickOpenMatch.path`.
- [File enumeration failures stay visible](../../../../src/modules/search/search.invariants.md#file-enumeration-failures-stay-visible)
  remains upheld. Ranking runs after enumeration and does not change failure state.
- [The open-project path input is a live directory navigator](../../../../src/modules/search/search.invariants.md#the-open-project-path-input-is-a-live-directory-navigator)
  remains upheld. The new record excludes `workspacePath` mode.
- [An un-openable open-project path is flagged live](../../../../src/modules/search/search.invariants.md#an-un-openable-open-project-path-is-flagged-live)
  remains upheld. The file-mode tiers do not change directory validation.

Final invariant verdict: PASS. No existing Quick Open record is violated, stressed, stale, or refined.

## Verification

- `bun scripts/harness/smoke-quickopen-harness.ts`: exit `0`, `ALL-PASS`.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all`: exit `0`.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --refs`: exit `0`.
- Final reference totals: 1,319 annotations and 263 lattice links resolved, with 0 problems.
- Post-commit schema and reference checks both exited `0` after the hook formatted the contract.

I did not run `merge-gate.sh` or `behavioral-contracts.sh`, as required by the brief.

## Bycatch

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
  [workspace](../../../../src/modules/workspace/workspace.invariants.md). I did not change them.
- EXISTING COVERAGE NOTES: The baseline and final reference checks repeated coverage notes in 14
  contract or lattice documents. These include [project](../../../../project.invariants.md),
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
  [vendors lattice](../../../../src/modules/vendors/vendors.lattice.md). I did not change them.
- RUNTIME: None observed during the default, small-scale, large-scale, or final smoke drives.
