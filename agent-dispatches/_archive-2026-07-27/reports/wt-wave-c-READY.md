# Grammar wave C — LSP READY

Tip: `b3de2d8b9f129afee8b1a665397a4527ea6d5645`

Branch: `grammar-wave-c-lsp`

Rebase: fresh `git fetch origin && git rebase origin/main` immediately before final verification;
branch was already up to date.

## Files converted

- `src/modules/lsp/JsonRpc.ts`
- `src/modules/lsp/LanguageClient.ts`
- `src/modules/lsp/LanguageProvider.ts`
- `src/modules/lsp/LspProcess.ts`
- `src/modules/lsp/LspTransport.ts`
- `src/modules/lsp/TypeScriptProvider.ts`
- Strictly colocated tests/support:
  `JsonRpc.test.ts`, `LanguageClient.test.ts`, `LanguageClient.coordinates.test.ts`,
  `LanguageClient.diagnostics.test.ts`, `LspProcess.test.ts`, `LspTransport.test.ts`,
  `TypeScriptProvider.test.ts`, and `lsp.fakes.test.ts`
- Updated the moved fake import in
  `src/modules/workspace/Workspace.goToDefinition.test.ts`
- Added `lsp` to `CONVERTED_MODULES` in `scripts/check-file-grammar.ts`
- Added all grammar-only conversion commits to `.git-blame-ignore-revs`

## Notable decisions

- All source declarations now follow imports → eponymous class/interface seam → exported types.
- `LanguageProvider.ts` uses the contract-interface-first grammar and remains pair-exempt.
- Module constants became protected static getters. Constructed sentinels/tables/sets use cached
  `$` getters.
- Instance methods read static constants through `this.constructor`, so subclass overrides govern
  base behavior.
- `Environment`, `Files`, `Logging`, `StatusChannel`, `EditorCoordinates`, and `Processes` are
  protected late dependencies. Tests subclass the owning class instead of mutating Static `Class`
  bindings.
- All non-test implementation members use `protected` as the overrideable floor. The colocated fake
  support class was also brought to the protected floor.
- Existing Reactive `let Class` and plain-stateful `let Class = $Class` selections were preserved.
- No merge gate was run.

## Commits

| Commit | File group |
| --- | --- |
| `2acfd4275b61c01bdd945c30b0bb8f074ab7a1a7` | transport stack and test colocation |
| `6e569a953d49009fba75e40ce1aecb0ab48e5eb6` | provider contract/provider |
| `4f15b9e327236908bd1cc8c00de6ba5125369407` | reactive language client |
| `b3de2d8b9f129afee8b1a665397a4527ea6d5645` | enforcement ratchet and blame hashes |

## Verification

Machine-quiet check before driven smokes: no merge gate or other smoke active; the layout agent
had no build/test/harness child and was between tool bursts. Smokes ran serially, one invocation
each.

| Instrument | Result |
| --- | --- |
| `bun scripts/check-file-grammar.ts src/modules/lsp` | PASS; 14 TypeScript files, 0 violations, 4 converted modules enforced |
| `bunx tsc --noEmit` | PASS |
| `bun test` | PASS; 1,041 tests, 0 failures, 14,522 expectations |
| `bash scripts/smoke-diagnostics.sh` | ALL-PASS first/solo run; tsgo pull + typescript-language-server push |
| `bash scripts/smoke-goto-definition.sh` | ALL-PASS first/solo run; Ctrl-click and F12 landed at `0,16` |
| `bash scripts/smoke-hover.sh` | ALL-PASS first/solo run; dwell, type card, selection/copy, dismissal |
| `bun scripts/check-file-grammar.test.ts` | PASS; 18 tests, 0 failures |
| `bun .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` | PASS; 545 annotations and 39 lattice links resolved, 0 problems |
| `git diff --check origin/main..HEAD` | PASS |

The only worktree status entry is the task input file: untracked `TASK.md`.
