# READY — repair UI contract sibling rot, #243

State: READY
Branch: `fleet/243-ui-contract-sibling-rot-round-two`
Commit: `849dd408baa6b76f8b9b32bac5d68615c1aaa6c3`
Subject: `contracts: repair ui citation drift (#243)`
Files: [src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) only
Tree: clean

## Scope

The changed contract is [src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md). The task named
three stale citation areas in that file. The neighborhood review found stale
claims in two adjacent editor records and deeper stale formulas in the
selection record.

[src/modules/ui/ui.lattice.md](../../../../src/modules/ui/ui.lattice.md) is also in scope. The change did not edit it.
Its resolved link count had to stay at 217.

## What changed

- Repointed command-palette windowing from `RootView` to `OverlayLayer`.
  `OverlayLayer.update` owns the visible command slice.
- Repointed wrap-off renderables from `RootView` to
  `SourceTextPaneContent`. `EditorPane` owns the visual-row mapping.
- Repointed caret mapping to `EditorPane.visualPosition` and
  `SourceTextPaneContent.caretAnchor`. `RootView` still projects the native
  cursor.
- Removed the dead `wrapVisualPosition` citation. The current mapping uses
  `visualPosition` and `visualRowsWindow`.
- Repointed selection rendering to `SourceTextPaneContent` and
  `EditorPane.applySelection`.
- Replaced the old line-minus-scroll formula with the current
  `visualRowsWindow` mapping.
- Replaced the dead `TextBufferView.setLocalSelection` claim with the current
  `SelectableText` mechanism. It writes `lastLocalSelection`, refreshes the
  local selection, and requests a render.
- Repointed `GitPanel.ts` and `GitPanel.test.ts` from `workspace` to `git`.

No production code changed.

## Current-main check

The worktree base was
`e2cb12371a45109bfbcb1dc5d3704c0f6a7862c1`. Current `main` was
`954d258cc05d74af14f95485c7120079fee1da1e`.

`git diff --name-status e2cb1237..954d258c -- <named owner paths>` returned
no changes. The relevant owners in this worktree match current `main`.

## AST ownership evidence

I read every replacement owner before the edit. I used
`bun scripts/ast-query.ts identifiers <name> --tests` for structural checks.

- `commandPaletteList`: 8 matches, all in `OverlayLayer.ts`.
- `commandPaletteViewportRows`: 7 matches, all in `OverlayLayer.ts`.
- `wrapVisualPosition`: 0 matches.
- `visualPosition`: 5 matches in `EditorPane.ts`,
  `SourceTextPaneContent.ts`, and its test.
- `caretAnchor`: 13 matches across `SourceTextPaneContent`, `RootView`, the
  pane interface, and tests.
- `applySelection`: 3 matches in `EditorPane.ts`,
  `SourceTextPaneContent.ts`, and its test.
- `documentPositionAtCell`: 7 matches, all in `EditorPane.ts`.
- `lastLocalSelection`: 3 matches in `SelectableText.ts`.
- `refreshLocalSelection`: 1 match in `SelectableText.ts`.
- `GitPanel`: 9 matches. Its declaration and test are under
  `src/modules/git/`.
- `setChangesSelection`: 5 matches. `setLogSelection`: 4 matches. Their
  declarations and tests are in `src/modules/git/GitPanel.ts` and
  `GitPanel.test.ts`.

## Is the rot exhausted?

No. The honest next step is a separate systematic sweep of every citation in
[ui.invariants.md](../../../../src/modules/ui/ui.invariants.md).

The three filed areas exposed more stale claims in their neighborhoods. A
path-only census then checked 99 explicit `src/...` citations and found one
more missing path at `ui.invariants.md:767`:
`src/modules/keybindings/__tests__/registry.test.ts`.

Existence checks cannot validate ownership. The next task should enumerate
every Mechanism, Evidence, Scope, and Verification citation. It should
AST-verify each named symbol against current code. It should start with the
dead keybinding test path and the comment drift listed below.

## Verification

Baseline command:

`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`

Baseline result: exit 0, 1,027 annotations resolved, 217 lattice links
resolved, and 0 problems.

Positive control: I changed the first annotation in
`SourceTextPaneContent.ts` to the wrong root-relative path
`src/modules/ui/missing-ui.invariants.md`.

The checker exited 1 and reported:

`src/modules/editor/SourceTextPaneContent.ts:14: contract not found: src/modules/ui/missing-ui.invariants.md`

The control resolved 1,026 annotations and 217 lattice links, with 1 problem.
I removed the planted defect before editing the contract.

Final result: exit 0, 1,027 annotations resolved, 217 lattice links resolved,
and 0 problems. The lattice-link count stayed at 217.

`git diff --check` passed. I did not run the merge gate, as the brief
required.

No app drive applies to this contract-only task. Dead citations do not change
a terminal frame. The AST tool and contract checker observed the real failure
path. Scale parity also does not apply because no executable behavior
changed.

## Bycatch

- **Invariant violated in function:** None observed. The current command
  window, source-text projection, selection, caret, and Git selection owners
  uphold the records.
- **Comment drift:** `ui.invariants.md:767` cites the missing
  `src/modules/keybindings/__tests__/registry.test.ts`. The current test is
  `src/modules/keybindings/KeybindingRegistry.test.ts`. The path census
  reproduced this once. The AST query found 53 `KeybindingRegistry`
  identifiers across code and tests.
- **Comment drift:** `src/modules/ui/SelectableText.ts:7` still says selection
  rows equal `documentLine - scrollTop`. Folding and wrapping now require
  `EditorPane.visualRowsWindow`.
- **Comment drift:** `src/modules/ui/SelectableText.ts:10` says
  `setLocalSelection` applies the selection. The current class writes
  `lastLocalSelection` and calls `refreshLocalSelection`.
- **Comment drift:** `src/modules/ui/RootView.ts:1716` and
  `src/modules/ui/RootView.ts:1738` cite `(ui.invariants.md)`. The repository
  convention requires the root-relative
  `(src/modules/ui/ui.invariants.md)` form. The checker currently accepts the
  short form.
- **Distillation possibility:** None observed in the five repaired records.
- **Generator drift or introduced variance:** None observed. The change
  updates contract pointers and formulas only.
- **Plain nonsense:** None beyond the dead symbols and paths named above.
- **Contract-layer gap:** The [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) header says the contract
  governs `src/modules/ui/`, but these records now depend on owners in
  `editor`, `filetree`, and `git`. The contract boundary has not followed the
  pane extractions.
