# Editor grammar wave — READY

Branch: `grammar-wave-editor`

Tip: `7ba64f251f896403e738e1c162ec1f2dbae1d2fc`

Base: rebased onto `origin/main` (`4cd1bd70a0b45964fb218670822c7e146209cfee`);
`origin/main` is an ancestor of the tip.

## Files converted

All nine editor source files now satisfy the FILE GRAMMAR:

- `BracketMatch.ts`
- `Cursor.ts`
- `Editor.ts`
- `EditorCoordinates.ts`
- `EditorWrap.ts`
- `ReadOnlyTextBuffer.ts`
- `TextDocument.ts`
- `TextEditing.ts`
- `Viewport.ts`

All 14 editor tests are colocated beside their sources:

- `BracketMatch.test.ts`
- `Cursor.test.ts`
- `Editor.test.ts`
- `EditorCoordinates.test.ts`
- `EditorGoalColumn.test.ts`
- `EditorMoveLine.test.ts`
- `EditorSelection.test.ts`
- `EditorWordJump.test.ts`
- `EditorWrap.test.ts`
- `EditorWrapIndex.test.ts`
- `ReadOnlyTextBuffer.test.ts`
- `TextDocument.test.ts`
- `TextEditing.test.ts`
- `Viewport.test.ts`

The former `src/modules/editor/__tests__/` suites were moved/split without dropping
coverage: the editor module still runs 119 tests and 4,333 assertions.

Supporting conversion updates:

- `scripts/check-file-grammar.ts` now enforces `editor`.
- `scripts/check-file-grammar.test.ts` uses `app` as its unconverted-module fixture.
- `.git-blame-ignore-revs` contains all three grammar-only conversion hashes.
- `scripts/smoke-move-line.sh`,
  `scripts/harness/smoke-move-line-harness.ts`, and
  `src/modules/editor/editor.invariants.md` reference the new colocated test paths.

## Notable decisions

- Detached static behavior became prototype-reachable static methods, with internal
  dispatch through `this` so subclass overrides govern base behavior.
- Module constants became protected static getters. Coordinate and wrap memo maps use
  `$`-cached static getters, preserving bounded memoization while making construction
  overridable.
- Cross-module static dependencies introduced during conversion are read through
  protected late getters; no cross-module ref getter was read in a constructor.
- Existing reactive class kinds were preserved (`let Class = Reactive($Class)`), static
  capabilities remain `const Class = Static($Class)`, and the raw read-only buffer remains
  a plain stateful class.
- Every `private` member in editor source became `protected`; the final AST census reports
  zero private members.
- No product behavior was intentionally changed. The only harness change updates a moved
  unit-test path.

## Commits

| Group | Commit |
|---|---|
| Static capabilities | `0f234d5dd280eba59260e212e03e5c3d0d774e6d` |
| Wrap capability | `2df6f7ad2fc6f88b8c436d9e5cd523682a2de8bb` |
| Reactive/plain models and test colocation | `3a685be1386372a320168ba8e1e9701ad8142bb0` |
| Final editor enforcement ratchet | `7ba64f251f896403e738e1c162ec1f2dbae1d2fc` |

## Full-instrument verification

| Instrument | Result |
|---|---|
| Rebase onto `origin/main` | PASS — branch up to date; ancestor check exit 0 |
| `bun scripts/check-file-grammar.ts src/modules/editor` | PASS, exit 0 — 23 TypeScript files, 0 violations, `editor` enforced |
| `bunx tsc --noEmit` | PASS, exit 0 |
| `bun test` | PASS, exit 0 — 1,062 pass, 0 fail, 14,615 assertions across 128 files |
| Invariant checker `--all --refs` | PASS, exit 0 — 559 annotations resolved, 39 lattice links resolved, 0 problems |
| Blame-ignore commit resolution | PASS — all three conversion hashes resolve to commits |
| Machine-quiet check | PASS before every driven smoke — no merge gate and no other wave Codex |
| `bash scripts/smoke-editor.sh` | ALL-PASS, solo 1/1 |
| `bash scripts/smoke-word-delete.sh` | ALL-PASS, solo 1/1 |
| `bash scripts/smoke-move-line.sh` | ALL-PASS, solo 1/1 |
| `bash scripts/smoke-bracket-match.sh` | ALL-PASS, solo 1/1 |
| `git diff --check origin/main..HEAD` | PASS |

No merge-gate run was performed. No push, branch deletion, or worktree-external
repository change was performed.
