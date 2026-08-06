# READY — bounded workspace search backend (#534)

## In plain words

Invar could search one open file, but it had no engine for a whole workspace. I added one search engine that streams file results, stops at 20,000 matches, obeys path filters, and uses unsaved open text instead of stale disk text. If ripgrep is missing, the engine now says search is unavailable and tells the user how to install it instead of reporting a generic process failure.

## Result

Commits:

- `03bc1556deca8ecc046d2616814c85e3b581e58e` (`Add bounded workspace search backend`)
- `56967242159ca020c68104e588f929c0b01a15ee` (`Handle unavailable workspace search binary`)
- `fe2b5d8a7d5599c0b74d402b1e5374534744aeb5` (`Inject workspace search backend in integration test`)

The task is complete on `fleet/534-workspace-search-backend`. The two follow-ups change 7 search and workspace files, with 200 insertions and 80 deletions. The dispatch-owned [agent law](../../../../AGENTS.md) and its untracked builder-fundamentals copy remain outside all three commits.

## Missing-binary choice

I chose option 2 from [the missing-ripgrep brief](brief-534-2-2.md): one resolution seam and an honest `unavailable` result.

I did not choose the vendored package. `@vscode/ripgrep` depends on an install script to obtain its platform binary. Bun blocks untrusted dependency scripts, and an offline install cannot fetch a missing binary. That path would move the same hidden assumption from runtime to install time.

I did not add a JavaScript folder walker. A correct walker must reproduce ignore-file rules, hidden-file rules, path confinement, cancellation, and bounded cost. That is a second search engine, not a cheap fallback. The explicit unavailable state preserves one result generator and names the remedy.

## What changed

- `src/modules/search/TextSearchPattern.ts` is now the one compiler and replacement-expansion seam for in-file and workspace search. `FindInBuffer` delegates matching and replacement expansion to it.
- `src/modules/search/WorkspaceSearchBackend.ts` starts ripgrep through the shared process seam. It reads ripgrep JSON as it arrives, treats ripgrep matches as file candidates, and reads each accepted file once. The shared local matcher produces the final spans and replacement previews.
- The backend resolves ripgrep through one injectable seam backed by `Processes.Class.which('rg')`. A resolved absolute path is the first process argument. A missing path returns `unavailable`, does not call spawn, and publishes `Install ripgrep, make rg available in PATH, and restart Invar.`
- The backend confines every candidate to the workspace root. It applies include globs first and exclude globs second. The ignore toggle controls ripgrep ignore behavior. Turning ignores off also includes hidden paths but still excludes `.git`.
- A search stops at exactly 20,000 accepted matches. A new search or an explicit cancel stops the active process. A result listener receives each file batch before process exit.
- `src/modules/search/WorkspaceSearchWorkspace.ts` owns four separate text input models, the query options, generation state, compact result storage, and one result-version signal. A generation token rejects stale callbacks.
- `OpenBufferSet.attachedDocumentHandles()` supplies one live-document enumeration seam. Workspace search skips those paths on disk and overlays their current document text. An unsaved addition appears, and an unsaved deletion hides its disk match.
- Every `Workspace` owns and disposes one independent workspace-search model.
- `WorkspaceOptions.workspaceSearchBackend` carries a test or host backend through the workspace's existing creation seam. Workspace-search construction now runs in the constructor body, after those options exist. The round-3 integration test injects the same resolved-path and streamed-process seams as the backend tests.
- The include and exclude policy lives once in `src/modules/search/WorkspaceSearchPathFilter.ts`. Disk candidates and open documents use the same policy.

## Invariants

### Search contract, record by record

| Record | Verdict |
| --- | --- |
| [Search results are click-set and highlight-shown](../../../../src/modules/search/search.invariants.md#search-results-are-click-set-and-highlight-shown) | Unchanged. This task adds no result surface or pointer path. |
| [The selected quick-open row is always visible](../../../../src/modules/search/search.invariants.md#the-selected-quick-open-row-is-always-visible) | Unchanged. Workspace search does not use or alter Quick Open. |
| [Quick Open activates the selected entry](../../../../src/modules/search/search.invariants.md#quick-open-activates-the-selected-entry) | Unchanged. No Quick Open activation code changed. |
| [Exact basenames rank above fuzzy paths](../../../../src/modules/search/search.invariants.md#exact-basenames-rank-above-fuzzy-paths) | Unchanged. Workspace results do not use Quick Open ranking. |
| [File enumeration failures stay visible](../../../../src/modules/search/search.invariants.md#file-enumeration-failures-stay-visible) | Unchanged in Quick Open. The new backend also keeps unavailable, failed, cancelled, ready, and empty outcomes distinct for its later surface. |
| [Find bar controls are mouse-clickable buttons](../../../../src/modules/search/search.invariants.md#find-bar-controls-are-mouse-clickable-buttons) | Unchanged. The existing Find Bar drive still reached its controls through real keys. |
| [Find options re-run the active query](../../../../src/modules/search/search.invariants.md#find-options-re-run-the-active-query) | Upheld. The shared compiler preserves case, whole-word, and regular-expression options. The driven Find Bar refreshed 10 matches to 0 and back to 10 when case changed, and refreshed to 2 for the regular expression. |
| [The open-project path input is a live directory navigator](../../../../src/modules/search/search.invariants.md#the-open-project-path-input-is-a-live-directory-navigator) | Unchanged. The new include and exclude inputs are independent models and do not use the open-project navigator. |
| [An un-openable open-project path is flagged live](../../../../src/modules/search/search.invariants.md#an-un-openable-open-project-path-is-flagged-live) | Unchanged. No open-project state or rendering changed. |

### Cross-domain records

- [Seams are drawn at the shared generator](../../../../project.invariants.md#seams-are-drawn-at-the-shared-generator): strengthened. Both search scopes now use `TextSearchPattern`; there is no second query compiler or replacement expander.
- [Construction goes through overridable seams](../../../../project.invariants.md#construction-goes-through-overridable-seams): strengthened. `Workspace.createWorkspaceSearchWorkspace` now receives an optional backend from `WorkspaceOptions`, and the integration test no longer reaches ambient executable resolution.
- [Cost tracks the actively observed set](../../../../project.invariants.md#cost-tracks-the-actively-observed-set): upheld. Ripgrep streams candidate files, each accepted file is read once, local matching stops after the remaining cap plus one, and streaming appends do not copy all earlier results.
- [An async result can outlive the state it described](../../../../project.invariants.md#an-async-result-can-outlive-the-state-it-described): upheld. Each query has a generation number, and late file batches cannot enter a newer query.
- [External tools share one launch policy](../../../../src/modules/system/system.invariants.md#external-tools-share-one-launch-policy): strengthened. The backend resolves through `Processes.Class.which`, then starts only the resolved path through `Processes.Class.spawn` with an argument vector and no shell. The absent arm never reaches spawn.
- [File access is confined to a single root](../../../../src/modules/system/system.invariants.md#file-access-is-confined-to-a-single-root): upheld. Every ripgrep path passes through `Files.Class.confineToRoot` before any read.
- [Document identity survives document instance replacement](../../../../src/modules/workspace/workspace.invariants.md#document-identity-survives-document-instance-replacement): upheld. The overlay takes attached `DocumentHandle` instances and reads the document attached at search start.
- [N open tabs do not cost N live documents](../../../../src/modules/workspace/workspace.invariants.md#n-open-tabs-do-not-cost-n-live-documents): upheld. Search enumerates only handles that already have an attached document. It does not hydrate dormant tabs.
- The four proposed replacement records in [the design](../../../../project-find-replace-design.md#12-proposed-invariant-records) remain proposals. This task did not apply or edit them.

## Driven proof

- Default 10-line fixture: the app settled with 10 document lines and `workspaceSearch.flowState = idle`. The real `Ctrl+F` path found `DRIVE-LINE-000010` once. Escape closed Find without any new visible surface.
- Default 100,000-line fixture: the same keys and graph assertions found the same text once. The document reported 100,000 lines and workspace search stayed idle. This proves the backend addition did not change the current visible experience at either scale.
- Adversarial Find drive on the 10-line fixture: `drive-line` found 10 case-insensitive matches; case-sensitive mode found 0; switching case off restored 10; `DRIVE-LINE-00000[12]` in regular-expression mode found 2. Each option change had a graph assertion before the next action.
- Repeated open, change, clear, close, and reopen cycles kept the query and match state coherent after every step.
- Backend drives used the shared 10-line and 100,000-line fixtures. Both returned one canonical result at line 9, columns 0 through 17.
- The ignore drive proved both commands: the default ignored `ignored.ts`, and disabled ignores included it. Include `**/*.ts` allowed TypeScript paths, then exclude `**/drop.ts` removed the named path.
- The live overlay proved both directions in one cycle. Unsaved text added the only match in `added.txt`; unsaved text removed the disk-only match from `removed.txt`. Follow-up queries produced two, zero, empty-query zero, and one result, with the file count checked after each step.
- A controlled stream emitted one file before process exit. A separate count-driven stream cancelled after its first file batch, killed once, and never read the second file.
- A duplicate ripgrep candidate caused one file read. A `../escape.txt` candidate caused no read. The literal text `TARGET; touch escaped` stayed one argument and executed no shell command.
- A planted 20,001st match returned exactly 20,000 results and set `limited = true`.
- With `PATH=/definitely-no-search-tools`, the backend test file passed 8 tests and 50 expectations. This PATH contains no ripgrep or Git. The absent resolver returned `unavailable`, an empty result, and the install remedy without calling spawn.
- With the same empty tool PATH, `Workspace.test.ts` passed all 15 tests and 76 expectations. Its independent-search test received one streamed `file1.txt` candidate from the injected backend and never read the host resolver.
- The round-3 sweep used structural identifier searches for `workspaceSearch`, `WorkspaceSearchWorkspace`, and `resolveRipgrepPath`. Backend tests inject the resolved or absent arm. Workspace-search model tests either stop before binary resolution or inject the absent arm. `Workspace.test.ts` contains the only other search call, and it now injects the resolved arm. No test search call remains on the real resolver.

## Positive controls

- I temporarily changed the cap from 20,000 to 20,001. The cap check failed with `expected 20000, received 20001` and exit 1. I restored the exact cap, and the check passed.
- I temporarily disconnected cancellation. The count-driven check failed with `expected cancelled, received ready` and exit 1. I restored cancellation, and the check passed.
- I temporarily bypassed the null-path guard. The absent-ripgrep check failed with `expected unavailable, received ready` and exit 1. I restored the guard, and the check passed.
- For [round 3](brief-534-3-3.md), I temporarily dropped `workspaceSearchBackend` from the workspace test helper. The exact rg-less test failed with `expected length 1, received length 0`, matching the conductor's gate failure. I restored the injection, and the file passed 15/15.
- None of the four planted defects remains in the commits.

## Final verification

- `PATH=/definitely-no-search-tools /home/parallels/.bun/bin/bun test src/modules/search/WorkspaceSearchBackend.test.ts`: exit 0; 8 tests passed, 0 failed, with 50 expectations.
- `PATH=/definitely-no-search-tools /home/parallels/.bun/bin/bun test src/modules/workspace/Workspace.test.ts`: exit 0; 15 tests passed, 0 failed, with 76 expectations.
- `bun test src/modules/search`: exit 0; 52 tests passed, 0 failed, with 225 expectations.
- `bunx tsc --noEmit && bun test`: exit 0; 2,477 tests passed in 379 files, 0 failed, with 72,757 expectations.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: exit 0; 1,412 annotations and 287 links resolved, with 0 problems.
- `bash scripts/conventions-gate.sh`: exit 0; `conventions-gate: PASS`. Its file-grammar and static-getter checks also passed.
- `bash scripts/behavioral-contracts.sh`: exit 0; `behavioral-contracts: ALL-PASS`.
- `git diff --cached --check` passed before the commit. The task commit is clean. Only the two dispatch-owned files named above remain as pre-existing worktree changes.

I did not run `scripts/merge-gate.sh`. The conductor owns that gate and landing.

## Bycatch

- Contract-layer gap: [search.invariants.md](../../../../src/modules/search/search.invariants.md) has no record for bounded workspace results, cancellation, live-document overlay precedence, or the ripgrep-candidate and local-canonical-match split. The implementation and [design](../../../../project-find-replace-design.md#13-implementation-milestones) plainly promise these behaviors. The brief says the four proposed replacement records must remain proposals, so I did not add a new record in this task.
- Runtime UI bycatch: None observed in the small, large, repeated, case, and regular-expression drives.
