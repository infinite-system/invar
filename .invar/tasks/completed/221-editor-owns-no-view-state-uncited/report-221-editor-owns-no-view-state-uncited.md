# READY — Fold the uncited editor view-state record (#221)

Commit: `eced00ec6265b3776c209d3299ad8153d21d1b34`

The worktree is clean. I did not run `scripts/merge-gate.sh`. I did not push,
merge, tag, or delete a branch.

## Result

The uncovered record *The editor owns no view state* was stale and fully
subsumed. Its evidence named the old `RootView` source-text render path. The
source-text pane work replaced that path before this task.

I folded each clause into its current owner:

- *Document identity survives document instance replacement* now states that
  `DocumentHandle` retains document-adjacent fold state. `Workspace` attaches
  the same state to every replacement `SourceTextView`.
- *Renderables hold no model state* now names `SourceTextPaneContent` and
  `EditorPaneRenderer`. Its evidence and verification use the current render
  path.
- *ivue owns state and OpenTUI owns projection* and *Data flows one way* retain
  the model and render-write boundaries.
- *The source text editor is a pane content citizen* retains the host boundary.
  The host owns no source-text render, selection, caret, or hit-test path.
- The cursor and viewport ownership correction remains in
  [project.decisions.md](../../../../project.decisions.md).

[editor.invariants.md](../../../../src/modules/editor/editor.invariants.md) keeps a visible folded-record pointer. It names the
former position and links every replacement record.

[project.lattice.md](../../../../project.lattice.md) now records the composition *Source text state survives
replaceable projection*. It derives persistent fold state and replaceable
rendering from the five current records.

No production code changed.

## Counts

- Editor chosen records: 12 → 11.
- Resolved annotations: 973 → 973.
- Resolved lattice links: 67 → 77.
- Checker problems: 0.

The record decrease is intentional. One stale compound record became a pointer
to narrower current records. No annotation disappeared because the old record
had no annotation.

The checker still prints `one category is empty — fine while bootstrapping` for
[editor.invariants.md](../../../../src/modules/editor/editor.invariants.md). I left it in place. This fold did not expose an
editor-specific reality invariant.

## Positive control

I temporarily added this wrong root-relative citation:

`// invariant: Data flows one way (src/modules/editor/missing.invariants.md)`

The checker exited `1` and named the exact defect:

`src/modules/editor/Editor.ts:27: contract not found: src/modules/editor/missing.invariants.md`

I removed the planted citation before final verification.

## Final verification

One final pass produced these results:

- `bun run drive --open TASK.md`: exit `0`, 38-line fixture settled.
- `bun run drive --size 100000`: exit `0`, 100,000-line fixture settled.
- Both latest frames reported 31 document reads, 16 fold lookups, 2 wrap
  lookups, and 1 layout computation.
- `bun test src/modules/git/GitDocumentState.test.ts
  src/modules/workspace/OpenBufferSet.test.ts
  src/modules/editor/SourceTextPaneContent.test.ts
  src/modules/ui/PaneProjection.test.ts`: exit `0`, 29 passed, 0 failed,
  84 expectations.
- `git diff --check`: exit `0`.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`:
  exit `0`, 973 annotations, 77 lattice links, 0 problems.

Invariant verdict: PASS.

## Bycatch

No out-of-scope bug was observed in either drive.
