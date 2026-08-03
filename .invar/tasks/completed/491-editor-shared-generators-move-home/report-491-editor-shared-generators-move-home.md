## In plain words

The editor kept four shared text tools in its private folder. I moved those tools home to the text
folder, connected the editor through one factory, and made Monitoring ask each workspace for its
language server instead of reaching into the LSP plugin. File, diff, and Markdown split views still
show the same layout, and the small and large editor paths do the same amount of frame work.

## READY

Commit `89e8dab40bdec7b4a11098aee76af4e4a84e015a` is ready for the conductor to gate and land.
The worktree is clean. I did not run the merge gate and did not merge or push.

## What changed

- Moved [EditorWrap.ts](../../../../src/modules/text/EditorWrap.ts),
  [ReadOnlyTextBuffer.ts](../../../../src/modules/text/ReadOnlyTextBuffer.ts),
  [EditorFrameAttribution.ts](../../../../src/modules/text/EditorFrameAttribution.ts), and
  [EditorSourceTextViews.ts](../../../../src/modules/text/EditorSourceTextViews.ts) from the editor
  plugin to the core text module. Their generator tests moved with them.
- Made `EditorSourceTextViews` accept the view factory and contribution registry that composition
  supplies. The editor-specific assembly now lives in
  [EditorSourceTextViewProviderFactory.ts](../../../../src/modules/editor/EditorSourceTextViewProviderFactory.ts).
- Ported the production consumers in
  [RootView.ts](../../../../src/modules/ui/RootView.ts),
  [ScrollbarSync.ts](../../../../src/modules/ui/ScrollbarSync.ts),
  [DiffView.ts](../../../../src/modules/diff/DiffView.ts),
  [Bootstrap.ts](../../../../src/modules/app/Bootstrap.ts), and
  [MarkdownSplitView.ts](../../../../src/modules/markdown/MarkdownSplitView.ts).
  [AppLoader.ts](../../../../src/modules/app/AppLoader.ts) and
  [DefaultPlugins.ts](../../../../src/modules/plugins/DefaultPlugins.ts) now perform the concrete
  editor composition.
- Added the consumer-owned
  [LanguageServerProcessSource.interface.ts](../../../../src/modules/monitoring/LanguageServerProcessSource.interface.ts).
  [LspWorkspaceProvider.ts](../../../../src/modules/lsp/LspWorkspaceProvider.ts) publishes its own
  process through `Workspace.providers`. [MonitoringPlugin.ts](../../../../src/modules/monitoring/MonitoringPlugin.ts)
  resolves that interface across open workspaces. Monitoring no longer imports any LSP module.
- Updated the live contract records and the move declarations in
  [project.coverage-deltas.md](../../../../project.coverage-deltas.md).

## Coupling census

The same [core-to-plugin census](../../../../.invar/tasks/completed/488-core-to-plugin-coupling-census/census-488-imports.ts)
ran before and after the change.

| Reading | Before | After | Change |
| --- | ---: | ---: | ---: |
| Core-to-plugin findings | 15 | 11 | -4 |
| Findings caused by the four editor generators | 4 | 0 | -4 |
| Sanctioned composition imports | 14 | 15 | +1 |

The one new sanctioned import is the editor provider factory in `DefaultPlugins`. All four former
core-to-editor imports are gone. The census positive seed was found, and its Vue-package negative
control stayed at zero findings.

## Driven evidence

I drove the default experience first at `120x40`, before any edit. Markdown opens in editor mode by
default, so I then used an isolated home with `markdownViewMode: "split"` for the required split
probe. That setting was held fixed for the before/after comparison.

| Surface | Gesture and comparison | Result |
| --- | --- | --- |
| File | Open [Editor.ts](../../../../src/modules/editor/Editor.ts) | 40 rows compared. Two source rows changed because their imports now name `../text/`; the other 38 rows were byte-identical after normalizing the disposable workspace name and clock. |
| Diff | Open the fixture, press `Enter`, `Control+g`, `o`, and wait for `showingDiff=true` | All 40 final rows were byte-identical after clock normalization. |
| Markdown split | Open the [task brief](brief-491-1-editor-shared-generators-move-home.md) with the isolated split setting | All 40 final rows were byte-identical after normalizing the disposable workspace name and clock. |

The direct 500-line and 100,000-line wheel probes had the same settled frame fingerprint:
`documentLineReads=65`, `foldProjectionLookups=33`, `wrapProjectionLookups=2`, and
`layoutComputations=1`. The final behavioral contract also reported exact scale parity for its real
fling: `reads=3575/55` at 2,000 lines and `3575/55` at 100,000 lines, with every ratio `1.000000`.

I removed the two generated drive homes from the worktree after the comparison. I moved them to
named `/tmp` paths instead of deleting them.

## Contract review

I checked every record in [editor.invariants.md](../../../../src/modules/editor/editor.invariants.md).

| Editor record | Verdict |
| --- | --- |
| Undo records deltas not whole-document snapshots | Upheld. The edit and undo paths did not change. |
| Selection is an anchor plus the cursor and edits replace it | Upheld. The read-only selection generator and its tests moved together. |
| Read-only text behavior excludes editing | Strengthened. The shared raw model now lives below the editor plugin, while concrete editor-extension assertions stay in `Editor.test.ts`. |
| Word wrap is a pure view mapping | Strengthened. The mapping and fold-range type now live in core text. Concrete editor mode tests remain with the editor. |
| One generator owns document-line-to-visual-row | Strengthened. Every editor and UI consumer imports the one text generator. |
| Editor frame work is independent of document length | Strengthened. Attribution is now a shared text generator, and the driven scale fingerprints match. |
| A fold toggle preserves the viewport anchor | Upheld. Folding behavior did not change. |
| Geometry aggregates match their consumers | Upheld. Only generator import paths changed. |
| A structural line edit is one atomic undo step that keeps the cursor on the moved line | Upheld. The edit path did not change. |
| A matched bracket pair is balanced within the same family | Upheld. Bracket behavior did not change. |
| Bracket matching skips brackets inside strings and comments | Upheld. Syntax behavior did not change. |

There were no editor-record misses. The change strengthens *Seams are drawn at the shared
generator* in [project.invariants.md](../../../../project.invariants.md). The monitoring repair
strengthens *Peer plugins can have different lifetimes* and *Provider rendezvous is host carried*
in [plugins.invariants.md](../../../../src/modules/plugins/plugins.invariants.md). *Extensions
states vendor authority before activation* was not touched.

## Checks

- `bun run typecheck`: pass.
- Focused unit pass: 113 tests across 11 files, 44,473 expectations, zero failures.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: 1,378 annotations and
  266 lattice links resolved, zero problems.
- `bun scripts/check-coverage-ratchet.ts`: 392 files inspected, no undeclared decrease.
- `bash scripts/conventions-gate.sh`: pass after the gate found and I fixed the three test-boundary
  mistakes described below.
- Provider rendezvous census with `--require-one`: one host registry found; its four-shape positive
  control passed.
- `bash scripts/behavioral-contracts.sh`: the process completed. The captured output had no failing
  contract. Its generated logs contained only the explicitly labeled positive-control red lines.
  The tool yielded before the shell returned, so its numeric exit code was not retained.
- `git diff --check`: pass before commit. The commit hook formatted 50 staged files.

The conventions gate first rejected two text tests that still imported `Editor` and one test probe
that extended `MonitoringPlugin.Class`. I moved the concrete assertions to
[Editor.test.ts](../../../../src/modules/editor/Editor.test.ts), kept the pure generator assertions
under text, changed the probe to extend `$Class`, and replayed the failed checks. The replay passed.

## Positive controls

- Removed editor contribution attachment from the provider factory. The new factory test failed
  with `Expected: 2, Received: 0`. I restored the attachment.
- Made Monitoring return no process sources. The new provider test failed because the expected
  `{ serverName: "fixture-language-server", processId: 91 }` row was absent. I restored the host
  registry resolution.
- The import and provider censuses each reported their built-in positive controls before their
  green verdicts.

## Bycatch

- The coupling census still reports 11 pre-existing core imports from the agent plugin. This task
  removed only the four editor findings and did not change the agent boundary.
- Contract-layer gap: no invariant record states the full core-to-plugin import vocabulary that
  the coupling census measures. The existing records cover provider authority and core governance,
  but not this exact import rule. I did not add a new record inside this move.
- Suspect settings-navigation mismatch: from the default Settings screen, two Down-key walks did
  not reach the published Markdown split value even though the settings labels included Markdown
  view mode. Both attempts timed out. I used the isolated settings home for the required probe and
  did not change Settings in this task.

## Instrument feedback

- EASY: `bun run drive` produced settled grids and graph state in one command. The import census
  gave exact before/after paths and proved its controls in the same run.
- CONFUSING: the Settings labels and the Down-key selection state did not give a reliable count to
  Markdown view mode. Two label-count attempts missed the `split` value.
- MISSING: `drive` has no primitive `--setting KEY=VALUE` option. Such an option would let a probe
  hold one user setting fixed without creating a temporary home and settings file.
