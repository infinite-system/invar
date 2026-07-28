# READY — grammar-wave-coretail

## Result

Converted `src/modules/app`, `src/modules/system`, and `src/modules/terminal` to the repository file grammar and enabled all three modules in `CONVERTED_MODULES`. The branch was rebased onto `origin/main` (`e70b3cdaba02c24d21d97bfea81571803a089109`) before the final verification.

Tip: `8d09b3197fedd03f5685b29321f199324b80ac9a`

## Commits

| Module/group | Commit |
| --- | --- |
| app | `3412fd755a741240dbd3a1b3428e9a3a29c5db7c` |
| system | `f2e00bb0fc6b21c05bca114b0e1d498542bb781d` |
| terminal | `92002d4b38094f85f2c5d66982190140059f897d` |
| final enforcement | `8d09b3197fedd03f5685b29321f199324b80ac9a` |

The three post-rebase conversion hashes are present in `.git-blame-ignore-revs`; each passed both `git cat-file -t` as a commit and `git merge-base --is-ancestor <hash> HEAD`.

## Files converted

- App: `App.ts`, `AppStatusProjection.ts`, `Bootstrap.ts`, `TerminalSession.ts`, with colocated/pair-complete tests for App, AppLoader, Bootstrap, HandlerGuard, and TerminalSession.
- System: `Clock.ts`, `Files.ts`, `FrameProbe.ts`, `Logging.ts`, `Momentum.ts`, `Processes.ts`, and `StatusChannel.ts`, with colocated/pair-complete tests for Clock, Environment, Files, Logging, Momentum, and StatusChannel.
- Terminal: `MockBackend.ts`, `OpenPty.ts`, `OpenPtyBackend.ts`, `TerminalCommandTyping.ts`, `TerminalFactory.ts`, `TerminalKeys.ts`, `TerminalPaneContent.ts`, and `TerminalPaneRenderer.ts`, with six colocated/pair-complete tests.
- Required system API call-site updates: `DiffView.ts`, `Viewport.ts`, `MarkdownSplitView.ts`, `ScrollableTextViewport.ts`, `FileTree.ts`, `GitPanel.ts`, and `Workspace.ts`.
- Enforcement/blame hygiene: `.git-blame-ignore-revs`, `scripts/check-file-grammar.ts`, and `scripts/check-file-grammar.test.ts`.

## Notable decisions

- Preserved the statement and coarse-effect signal-read ordering inside `Bootstrap.boot` while moving the implementation under the class.
- Preserved Momentum tuning exactly: default `22 / 80 / 0.015 / 3` and vertical `34 / 220 / 0.015 / 3`; exposed them through cached static getters and updated consumers.
- Kept TerminalObserver, TerminalInstance, and terminal follow surfaces behaviorally unchanged; the settings-applied smoke drove the live terminal-follow path successfully.
- During the final rebase, retained the upstream UI-wave file-grammar conversion of `ScrollableTextViewport` and applied only the required Momentum API substitutions.
- Left the user-provided untracked `TASK.md` untouched. No merge-gate was run.

## Verification

### Static and unit instruments

| Instrument | Result |
| --- | --- |
| `bun install --silent && git checkout bun.lock` | PASS (using `/home/parallels/.bun/bin/bun`) |
| `bun scripts/check-file-grammar.ts` | PASS — 367 TypeScript files, 22 enforced modules; only 10 reported legacy `layout` violations |
| `bunx tsc --noEmit` | PASS |
| `bun test` | PASS — 1,267 tests, 15,514 expectations, 194 files |
| invariant checker `--all --refs` | PASS — 608 annotations, 39 lattice links, 0 problems |
| `git diff --check origin/main...HEAD` | PASS |
| `git merge-base --is-ancestor origin/main HEAD` | PASS |
| conversion-hash existence and ancestry proof | PASS — 3/3 |

### Driven smokes

The machine-quiet check found no merge-gate and no other fleet `codex exec` verification process. Each harness was then run solo.

| Harness | Result |
| --- | --- |
| `smoke-settings-applied-harness.ts` | ALL-PASS — all 35 settings schema fields covered, including terminal follow mode |
| `smoke-voice-picker-harness.ts` | ALL-PASS |
| `smoke-quickopen-harness.ts` | ALL-PASS |
| `smoke-search-mouse-harness.ts` | ALL-PASS |
| `smoke-find-harness.ts` | ALL-PASS |
| `smoke-tabs-harness.ts` | ALL-PASS |
| `smoke-shortcut-help-harness.ts` | ALL-PASS |

Final worktree status: only the pre-existing untracked `TASK.md`; no tracked changes.
