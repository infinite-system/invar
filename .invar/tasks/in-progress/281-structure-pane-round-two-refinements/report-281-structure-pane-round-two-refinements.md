# READY — #281 (structure pane round-two refinements)

State: READY

Task commit: `fa9366d1e7f7ab6291a8d26833591819ebdf6490`

Bycatch commit: `75e6754aa3dd1855f518cc5c8dadfada21da02e1`

Branch: `fleet/281-structure-pane-round-two-refinements`

The worktree is clean. The requested report directory existed. This report uses the requested
path, not the `/tmp` fallback.

## Result

All seven requested arms are complete.

1. The TypeScript refinement removes import declarations at the analyzer boundary for `.ts`,
   `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, and `.cjs`. It reuses
   `TypeScriptProvider.supportsPath`, so the provider and refinement have one extension generator.
2. Class members now carry public, protected, private, or hash-private visibility. The renderer
   gives each visibility its own fixed mark and semantic color.
3. An ivue member whose name starts with `$` carries a cache mark without replacing the language
   server's ordinary symbol class.
4. Override detection follows local and imported parent chains. It marks explicit overrides and
   matching inherited non-private members. It loads only the parent chain, not a workspace-wide
   TypeScript program.
5. The inheritance line is removed. It is analyzer noise, like an import row. A new setting would
   add policy for one unwanted row and would not reuse an existing flag, so removal is the smaller
   and honest choice.
6. Getters and setters have separate glyphs. Getter marks and labels use the subtle information
   color in both the dark and light palettes.
7. A gear beside the filter opens the shared context menu with depths 0 through 8. It writes and
   saves the existing `structureDefaultDepth` contribution through `Settings.setContributed`.
   Settings and the gear are two surfaces on one value.

[TypeScriptStructureAnalyzer.ts](../../../../src/modules/lsp/TypeScriptStructureAnalyzer.ts)
refines the server result. The provider-neutral fields travel through
[StructureSource.interface.ts](../../../../src/modules/structure/StructureSource.interface.ts) and
[StructureOutline.ts](../../../../src/modules/structure/StructureOutline.ts).
[StructurePaneRenderer.ts](../../../../src/modules/structure/StructurePaneRenderer.ts) paints the
fixed semantic slots.
[StructurePaneContent.ts](../../../../src/modules/structure/StructurePaneContent.ts) owns the gear
and shared menu gesture. [StructurePlugin.ts](../../../../src/modules/structure/StructurePlugin.ts)
writes the existing setting. The new record extends
[structure.invariants.md](../../../../src/modules/structure/structure.invariants.md#outline-labels-expose-source-semantics).

## Driven evidence

Defaults came first.

- Before the change, a drive of
  [StructureOutline.ts](../../../../src/modules/structure/StructureOutline.ts) showed import names
  at the top of the outline. It published `structureRows=97`, `structureDepth=1`, and no semantic
  marks or depth gear.
- After the change, the same default dark-theme drive published `structureRows=88` and
  `structureDepth=1`. Import rows were absent. `$watch` painted public and cache marks. Protected
  getters painted protected and getter marks. The filter row painted `⚙ 1`.
- Clicking the gear in that drive opened the real context menu. Clicking `Depth 2` published
  `structureDefaultDepth=2`, `structureDepth=2`, `structureDepthIsOverridden=false`, and
  `structureRows=150`.
- A second drive changed the existing Theme setting from dark to light. It reached
  `settingsSelectedValue="light"` and repainted the same semantic labels. The renderer contract
  also compared the private mark with `palette.warning` and the getter mark and label with
  `palette.info` under both `DARK` and `LIGHT`.
- The manifest PTY fixture drove one real TypeScript server answer. The query
  `importedOutlineNoise` returned zero rows, which proved that both the import and heritage
  pseudo-row were absent. Focused queries painted public, private, hash-private, cached getter,
  and inherited override marks. The same drive clicked `⚙ 1`, selected `Depth 2`, observed the
  setting and projection change, then selected `Depth 1` and restored the default projection.
- The 500-line TypeScript scale drive painted `symbol000000 :1`. Its right-dock thumb sequence was
  `0→47→93→140`.
- The 100,000-line TypeScript scale drive painted the same label. Its right-dock thumb sequence was
  also `0→47→93→140`. The semantic projection and interaction stayed document-length independent.
- The manifest drive then opened the Markdown table of contents. Its old labels and line numbers
  remained intact because non-TypeScript sources do not reserve TypeScript semantic slots.

The driven regression lives in
[smoke-plugin-manifest-harness.ts](../../../../scripts/harness/smoke-plugin-manifest-harness.ts).
The scale proof lives in
[smoke-scrollbars-harness.ts](../../../../scripts/harness/smoke-scrollbars-harness.ts).

## Positive controls

Each arm went red under a deliberate defect before the final green pass.

1. Import filtering: removing the import exclusion made the `.ts` matrix case return
   `dependency, answer` instead of `answer`.
2. Visibility: disabling explicit-private parsing made `hiddenMember` report `public` instead of
   `private`.
3. Cache: forcing `cached=false` made `$cachedValue` fail its expected cache fact.
4. Override: forcing `override=false` made the imported ivue parent case return false instead of
   true.
5. Inheritance row: removing the heritage exclusion left `Parent` in the child rows.
6. Getter: forcing `accessor=null` made `$cachedValue` return null instead of `getter`.
7. Depth gear: removing the contributed-setting write left `settingWrites=[]` instead of the
   expected `structureDefaultDepth=3` write.

All seven plants were removed. The focused checks returned green before the final pass.

## Verification

- `bunx tsc --noEmit` passed.
- `bun test` passed 1,924 tests across 295 files with 68,620 expectations and 0 failures.
- `bun scripts/harness/smoke-scrollbars-harness.ts` passed every arm, including the 500-line and
  100,000-line TypeScript structure drives.
- `bun scripts/harness/smoke-plugin-manifest-harness.ts` passed the new seven-arm Structure drive
  and every existing plugin lifecycle arm.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` resolved 1,128
  annotations and 222 lattice links with 0 problems.
- `bash scripts/conventions-gate.sh` passed.
- `git diff --check` passed.

The commits used `SKIP_GATE=1` only to avoid repeating the completed verification from the
pre-commit hook. The exact final state had already passed the commands above.

## Bycatch

- FIXED in `75e6754aa3dd1855f518cc5c8dadfada21da02e1`: the manifest smoke read the latest
  right-dock scrollbar diagnostic before the dock's settled layout frame. It reproduced twice as
  `laidH=1` even though the next grid showed the full-height dock. The smoke now waits for the
  published geometry condition before reading it. No timeout changed.
- Comment drift, confirmed on a second read:
  [PaneContent.interface.ts](../../../../src/modules/ui/PaneContent.interface.ts) first says the
  seam is not retrofitted onto the editor, tree, or Markdown panes. Its next paragraph says the
  file tree and source-text editor are citizens today. Not fixed.
- The worktree-root copy of the
  [task brief](brief-281-1-structure-pane-round-two-refinements.md) kept two task-folder-relative
  invariant links. The invariant checker first reported both as missing contracts. The local
  wrapper links now resolve from the worktree root. That wrapper is untracked, so this produced no
  repository commit.
