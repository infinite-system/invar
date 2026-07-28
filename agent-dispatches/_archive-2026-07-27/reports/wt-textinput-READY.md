# READY — One shared text-input primitive

Branch: `feat-text-input-primitive`

Tip: `2fbd5c895010926fe641422f34402164caa1a11c`

Rebased base: `c529342b368dbaefec395c3ba2c797609cc332c2` (`origin/main` from the
successful final rebase). Both that base and the required `7b7be1c` navigator baseline are proven
ancestors of the tip. A redundant fetch after verification hit temporary GitHub DNS failure; the
worktree remains based on the last successfully fetched `origin/main`.

## Extraction and adoption

`src/modules/editor/TextInputModel.ts` is the class-first reactive one-logical-line model. It owns a
grapheme-indexed caret and implements insertion at the caret, backspace, forward delete,
previous/next-word deletion, whole-line deletion, clear, Left/Right, word Left/Right, Home, and End.
It uses `EditorCoordinates` for grapheme conversions and `TextEditing` for both word boundaries.

Adopters:

- `AgentComposer` delegates its editing core while retaining wrapping, selection, pointer mapping,
  scrolling, and history behavior.
- `QuickOpen.query`, including open-project path navigation.
- `CommandRegistry.query` for the command palette.
- Both `FindInBuffer` inputs used by the find/replace bar.

The palette, quick-open, and find renderers paint the caret between the model's before/after
projections. `Bootstrap` observes caret revisions. `KeybindingDefaults.textInputBindings` generates
the same 18-entry movement/deletion table for palette, quick-open, find, and agent contexts.

Open-project Right is readline-shaped: it moves the caret while text remains to its right, and only
drills into the selected folder at end-of-input.

## Recurrence prevention

The new `Editable text fields share one input model` invariant is linked into the project lattice.
`bun scripts/ast-query.ts text-input-census` is report-only in `conventions-gate.sh`.

Current census: **1 result**

`src/modules/ui/BoundedListPopup.ts:25 class $BoundedListPopup
state=[query] edits=[appendQuery,setQuery,eraseQueryCharacter,moveSelection]`

`BoundedListPopup` is the only remaining consumer. It stays deferred for the immediate overlay
follow-up as directed. Once it adopts `TextInputModel`, the report-only census can become an enforced
zero-count check.

## Verification

| Check | Result |
| --- | --- |
| `bunx tsc --noEmit` | PASS, exit 0 |
| `bun test` | PASS, 1,314 tests / 15,549 expectations / 0 failures |
| invariant checker `--all` | PASS, exit 0 |
| invariant checker `--all --refs` | PASS, 661 annotations and 41 lattice links resolved, 0 problems |
| `bun scripts/check-file-grammar.ts` | PASS, 381 TypeScript files, 0 violations |
| `bash scripts/conventions-gate.sh` | PASS, exit 0; census reports one deferred popup |
| `bun scripts/harness/smoke-text-input-harness.ts` | PASS, exit 0; byte-level caret-cell drives for Left, Right, Alt-Left/Right, Alt-Backspace, Alt-Delete, Home, End in open-project, palette, and find; Right-at-end drills |
| `bun scripts/harness/smoke-agent-pane-ux-harness.ts` | PASS, exit 0 |
| `bun scripts/harness/smoke-agent-harness.ts` | PASS, exit 0 |
| `bun scripts/harness/smoke-word-delete-harness.ts` | PASS, exit 0 |
| `git diff --check` | PASS |
| ancestry | `c529342` and `7b7be1c` are ancestors of tip |
| worktree | CLEAN; no tracked task packet |

The shared text-input smoke is registered as a hard PTY step in `scripts/merge-gate.sh`.

## Principal files

- `src/modules/editor/TextInputModel.ts`
- `src/modules/editor/TextInputModel.test.ts`
- `src/modules/editor/TextEditing.ts`
- `src/modules/agent/AgentComposer.ts`
- `src/modules/search/QuickOpen.ts`
- `src/modules/commands/CommandRegistry.ts`
- `src/modules/search/FindInBuffer.ts`
- `src/modules/search/FindBar.ts`
- `src/modules/keybindings/KeybindingDefaults.ts`
- `src/modules/app/Bootstrap.ts`
- `src/modules/ui/OverlayLayer.ts`
- `src/modules/ui/FindBarRenderer.ts`
- `scripts/ast-query.ts`
- `scripts/harness/smoke-text-input-harness.ts`
- `scripts/conventions-gate.sh`
- `scripts/merge-gate.sh`
- `project.invariants.md`
- `project.lattice.md`
- editor, agent, search, and keybinding invariant files
