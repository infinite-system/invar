# READY — Popup hardening and provider-neutral autocomplete

## Result

Complete on `feat-popup-autocomplete` in two ordered commits:

1. `7a3271e95ab993fec79b55d9bca2f1ef24a79e36` — `fix(ui): harden bounded list popup interaction`
2. `372ee9a5d3314e6d31ab2abdca72c0eec75d611f` — `feat(lsp): add provider-neutral autocomplete`

Tip: `372ee9a5d3314e6d31ab2abdca72c0eec75d611f`

The branch was fetched and rebased onto `origin/main`; it was already current at
`ba11d3a06b67949f6a4d3eb0dfd2f8cc79ee9925`.

## Focus-theft root cause

The bounded popup search row is not a native focused input. Bootstrap owns query input whenever
the modal popup is open. Moving across list rows changes only `hoveredIndex` and repaints the list;
it does not transfer keyboard ownership to the editor. The user-visible failure was therefore an
affordance/ownership gap: the search row had no hover projection, and query acceptance was not
expressed as an explicit popup capability for every input route.

The shared generator now exposes `acceptsQueryInput`, paints the search row rest-muted/hover-lit,
and retains modal query routing across row-hover repaints. The PTY drive interleaves every character
of a multi-character query with pointer moves and proves that every character reaches the query.

## Contract and architecture decisions

- `LanguageProvider` is the provider-neutral semantic contract:
  `completion(document, position, context)` plus advertised completion trigger characters.
  `LanguageServerProvider` is the separate process-launch seam.
- `LanguageClient` implements the semantic contract and is the sole LSP wire mapper. It maps
  `label`, `kind`, `insertText`, `textEdit`, `sortText`, `filterText`, incomplete lists, trigger
  kinds, trigger characters, and UTF-16 ranges. `TypeScriptProvider` contains only TypeScript
  extension/server selection.
- `CompletionPopup` is an adapter over a separately identified `BoundedListPopup`. It hides the
  search row and modal backdrop, anchors to RootView's laid-out caret cell, inherits flip/scroll/
  hit/wrap geometry, prefilters only when the prefix changes, caches matches/width, and paints only
  the viewport slice.
- The editor retains focus. Printable input mutates the document and narrows/re-requests completion;
  Up/Down wrap, Enter/Tab accept, Escape and cursor movement dismiss, and server triggers plus
  Ctrl+Space open the list.
- `TextDocument.replaceRange` applies an accepted edit with exactly one revision bump.
  `Editor.applyCompletion` records one undo state and honors an LSP `textEdit` exactly, falling back
  to the current prefix range only when the server omitted one.
- The Rust-flavored driven proof is injected through the existing ivue `LanguageClient.Class` swap
  seam from a harness preload. Production editor routing contains no provider-specific branch.

## Files

Contract/client:

- `src/modules/lsp/LanguageProvider.interface.ts`
- `src/modules/lsp/LanguageClient.ts`
- `src/modules/lsp/TypeScriptProvider.ts`
- `src/modules/workspace/Workspace.ts`

Editor/UI/application:

- `src/modules/editor/TextDocument.ts`
- `src/modules/editor/Editor.ts`
- `src/modules/ui/BoundedListPopup.ts`
- `src/modules/ui/CompletionPopup.ts`
- `src/modules/ui/RootView.ts`
- `src/modules/ui/OverlayCoordinator.ts`
- `src/modules/app/Bootstrap.ts`
- `src/modules/app/AppStatusProjection.ts`
- `src/modules/system/StatusChannel.ts`
- `src/modules/keybindings/KeybindingDefaults.ts`

Tests, contracts, and drives:

- `src/modules/lsp/LanguageClient.test.ts`
- `src/modules/lsp/lsp.fakes.test.ts`
- `src/modules/editor/TextDocument.test.ts`
- `src/modules/editor/Editor.test.ts`
- `src/modules/ui/BoundedListPopup.test.ts`
- `src/modules/ui/CompletionPopup.test.ts`
- `src/modules/ui/OverlayCoordinator.test.ts`
- `src/modules/app/AppStatusProjection.test.ts`
- `src/modules/lsp/lsp.invariants.md`
- `src/modules/ui/ui.invariants.md`
- `scripts/harness/smoke-bounded-list-popup-harness.ts`
- `scripts/harness/completion-mock-provider-preload.ts`
- `scripts/harness/smoke-completion-harness.ts`
- `scripts/merge-gate.sh`

## Verification

| Check | Result |
|---|---|
| Required install and `bun.lock` restore | PASS |
| `bunx tsc --noEmit` | PASS |
| `bun test` | PASS — 1,285 tests, 15,430 expectations |
| Targeted completion/popup/editor tests | PASS — 39 tests, 207 expectations |
| `bun scripts/check-file-grammar.ts` | PASS — 369 files, 23 enforced modules, 0 violations |
| Invariants `--all --refs` | PASS — 631 annotations resolved, 0 problems |
| `bash scripts/conventions-gate.sh` | PASS |
| `git diff --check` | PASS |
| Phase-1 PTY popup harness | ALL-PASS — both adapters, hover, pointer-sweep typing, filtered wrap/reveal, wheel, keyboard, mouse |
| Completion PTY harness — mock Rust provider | ALL-PASS — same editor path, 1,502 items, viewport-bounded paint, prefix narrowing, exact acceptance, cursor/Escape dismissal |
| Completion PTY harness — real tsgo | ALL-PASS — typed `this.p`, server-triggered popup, keyboard selection accepted `property` |
| Quiet-machine precheck | PASS — 0 active merge gates and 0 other builders before the final completion drive |
| Rebase onto `origin/main` | PASS — already up to date |
| `origin/main` → phase 1 ancestry | PASS |
| phase 1 → tip ancestry | PASS |

Per protocol, the full merge gate was not invoked, pushed, merged, or tagged. The new completion
smoke is registered in `scripts/merge-gate.sh`.
