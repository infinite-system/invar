# READY — repair UI contract citations, #239

State: READY
Branch: `fleet/239-ui-contract-citation-repairs`
Commit: `e3d8d04d8d931dcfd239403016bb7d9eed83a591`
Subject: `contracts: repair ui contract citations (#239)`
Files: `src/modules/ui/ui.invariants.md` only
Tree: clean

## What changed

- Replaced `renderGitPanel` with the current `GitPaneContent.render` to
  `GitPaneRenderer.render` height path.
- Replaced `renderEditorStyled` with `EditorPaneRenderer.render`.
- Replaced `renderTree` with `TreePaneRenderer.render`.
- Replaced the two `src/modules/ui/EditorPaneRenderer.ts` citations with
  `src/modules/editor/EditorPaneRenderer.ts`.
- Replaced `src/modules/ui/EditorPane.ts` with
  `src/modules/editor/EditorPane.ts`.
- Repointed the list-selection Mechanism and Evidence to
  `TreePaneRenderer`, `GitPaneRenderer`, `FileTreePaneContent`, and
  `GitPaneContent`.
- Removed the second copy of the mouse-selection paragraph. One copy remains.

The AST query found zero code identifiers for `renderEditorStyled`,
`renderTree`, and `renderGitPanel`. I read each replacement owner before the
edit. No production code changed.

## Verification

Baseline command:

`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`

Baseline result: 993 annotations resolved, 217 lattice links resolved, and 0
problems.

Positive control: I changed one annotation to the wrong root-relative path
`src/modules/ui/missing-ui.invariants.md`. The checker exited 1 and reported:

`src/modules/filetree/TreePaneRenderer.ts:10: contract not found: src/modules/ui/missing-ui.invariants.md`

The control resolved 992 annotations and 217 lattice links, with 1 problem. I
removed the planted defect before the final pass.

Final result: exit 0, 993 annotations resolved, 217 lattice links resolved,
and 0 problems. The lattice-link count stayed 217 before and after.

`git diff --check` passed before the commit. I did not run
`scripts/merge-gate.sh`, as the brief required.

No app drive applies to this task. Dead citations do not change runtime
behavior and cannot appear in a terminal frame. I reproduced the defect with
AST ownership checks and the contract checker. Scale parity also does not
apply because no executable behavior changed.

## Bycatch

- **Invariant violated in function:** None observed. I read the current
  height, windowing, selection, and editor-renderer owners.
- **Comment drift:** `ui.invariants.md:1777-1787` still cites
  `src/modules/workspace/GitPanel.ts` and its test. Both files now live under
  `src/modules/git/`. I left them unchanged because the brief fixed only the
  named six sites.
- **Comment drift:** `ui.invariants.md:1522` still says `RootView` owns the
  editor code renderable and `applySelection`. `SourceTextPaneContent` now
  constructs the renderable, and `EditorPane` applies the selection. I left
  this sibling unchanged.
- **Comment drift:** `ui.invariants.md:1411` still places palette-list
  rendering in `RootView`. Current `commandPalette` projection identifiers
  live in `OverlayLayer`. I left this sibling unchanged.
- **Distillation possibility:** None newly observed in the six edited sites.
- **Generator drift or introduced variance:** None observed. The edit changes
  pointers only.
- **Plain nonsense:** None beyond the duplicated paragraph fixed by this
  task.
- **Contract-layer gap:** The file header says the contract governs
  `src/modules/ui/`, but these records now cite owners in `editor`,
  `filetree`, and `git`. The contract boundary has not followed the pane
  extraction. This is the existing UI-contract split question, not part of
  this repair.

