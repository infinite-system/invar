# ReadOnlyTextBuffer extraction — READY

## Tip

`7bba7ed1f94fe1efad3db59a76146f1270c67560`

Commit: `refactor(editor): extract read-only text buffer seam`

## Files changed

- Added `src/modules/editor/ReadOnlyTextBuffer.ts`: raw stateful namespace class
  (`Class = $Class`) composed from `TextDocument`, `Cursor`, selection/copy, and read-only
  `FindBarTarget` behavior.
- Added `src/modules/editor/ReadOnlyTextBuffer.test.ts`: grapheme-safe selection/copy/find
  coverage plus the negative boundary that insert, undo, save, and viewport behavior are not on
  the read-only seam.
- Changed `src/modules/editor/Editor.ts`: `Editor` extends `ReadOnlyTextBuffer.$Class`; editor-only
  viewport, mutation, persistence, and undo remain on `Editor`.
- Changed `src/modules/diff/DiffView.ts`: one `ReadOnlyTextBuffer` per side now serves both
  selection and find. Removed the two hidden find Editors and the recreated selection Editor.
- Changed `src/modules/markdown/MarkdownSplitView.ts`: the preview now owns one
  `ReadOnlyTextBuffer`; removed its hidden mutable Editor.
- Updated `project.invariants.md` and the editor, diff, and markdown colocated contracts and
  annotations to record the new seam.

## Seam and generator

The shared generator is selectable and searchable read-only text: document storage, a
cursor/anchor range, grapheme-correct selection text, clipboard copy, and a find target that
forbids replacement. `ReadOnlyTextBuffer` owns exactly that generator.

`Editor` extends the raw seam and adds the behavior that read-only consumers do not generate:
viewport movement, editing, undo/redo, save, and editable clipboard operations. Diff and Markdown
construct the raw class directly, so they no longer carry mutation, undo, persistence, or editor
viewport behavior that they must suppress.

This avoids both failure modes:

- no duplicate selection/copy/find model in Diff or Markdown;
- no full mutable Editor forced into a read-only surface.

## Verification transcript

Dependencies were restored from the committed lockfile with
`/home/parallels/.bun/bin/bun install --frozen-lockfile`.

- `PATH="$HOME/.bun/bin:$PATH" bunx tsc --noEmit`
  - PASS, no diagnostics.
- `PATH="$HOME/.bun/bin:$PATH" bun test`
  - PASS: 797 tests, 0 failures, 12,746 expectations across 103 files.
- `bash scripts/smoke-editor.sh`
  - PASS, exit 0: real TUI editor selection/copy, editing, undo, cursor, mouse, scroll, tabs, and
    idle-quiescence assertions passed.
- `bash scripts/smoke-diff-overview.sh`
  - `smoke-diff-overview: ALL-PASS`.
  - The driven diff selection autoscrolled, painted 34 rows, and copied the exact 2,321-character
    span with matching SHA-256.
- `bash scripts/smoke-markdown.sh`
  - `RESULT: ALL-PASS`.
  - The driven preview selection copied exactly, paste still targeted the editable source, and
    source/preview find state remained independent.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`
  - PASS: 0 problems; 405 annotations and 38 lattice links resolved.
  - `TASK.md` names `scripts/check_invariants.mjs`, but that path does not exist in this checkout.
    The canonical checker path required by `AGENTS.md` and the invariants skill was used.
- `bash scripts/conventions-gate.sh`
  - `conventions-gate: PASS`.
- `git diff --check`
  - PASS.
- `rg "new Editor\\.Class|from '../editor/Editor'" src/modules/diff src/modules/markdown`
  - No matches.

The editor, Diff, and Markdown smokes were also run before the edit and passed, establishing the
same live behavioral baseline.

Per task instruction, `scripts/merge-gate.sh` was not run.

## Residual behavior-change risk

No in-repository behavior risk remains known after the full unit suite and the three real-app
smokes. One compatibility risk is outside the repository's verified surface: an out-of-tree
subclass overriding the old `DiffView.createFindEditor` or
`MarkdownSplitView.createPreviewSelectionEditor` factory names would need to adopt the new
read-only buffer factory names. No in-repository subclass or caller uses those old seams.

The conductor-provided untracked `TASK.md` remains untouched and was not committed.
