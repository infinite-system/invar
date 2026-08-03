## In plain words

The brief asks for five Quick Open test fixes that are already in `main`. I checked the six sites and drove all five tests again. The fixes still work, but one unrelated full-suite test hit its existing 5,000 ms timeout.

## Result

NO-CHANGE FINDING at `3083c9f70986a1b8f7be3d8a5a2b5ed16fa50a7b`.

The [filed round brief](brief-481-1-shared-machinery-waits-and-drive-gesture-deletion.md) assigns the same six Quick Open sites that task #480 (migrate the Quick Open idiom) already landed. The implementation commit is `ad6d50383d84292427a1fca33070038ddbd297c0`. Merge commit `04ea99abffcb4487b526989ce8d1642600c51db5` brought it into `main` before this branch started.

I made no code change and created no commit. The worktree is clean.

The scoped behavior is complete. The required full test run is not green because `StartScript.test.ts` timed out once. This report does not claim a clean gate.

## Files done and remaining

| State | Files |
| --- | --- |
| Done before this task started | [smoke-bracket-match-harness.ts](../../../../scripts/harness/smoke-bracket-match-harness.ts): 1 site. [smoke-git-blame-harness.ts](../../../../scripts/harness/smoke-git-blame-harness.ts): 2 sites. [smoke-image-preview-harness.ts](../../../../scripts/harness/smoke-image-preview-harness.ts): 1 shared helper site across 4 queries. [smoke-breadcrumb-harness.ts](../../../../scripts/harness/smoke-breadcrumb-harness.ts): 1 site. [smoke-diagnostics-harness.ts](../../../../scripts/harness/smoke-diagnostics-harness.ts): 1 site across 2 server arms. |
| Remaining in the filed round brief | None. |
| Explicitly reserved by the filed round brief | [tui-harness.sh](../../../../scripts/tui-harness.sh), [HarnessSmoke.ts](../../../../scripts/harness/HarnessSmoke.ts), [PtyTestDriver.ts](../../../../scripts/harness/PtyTestDriver.ts), and [Drive.ts](../../../../scripts/harness/Drive.ts). The brief says not to touch them in this round. |

## Existing implementation

Each site waits for `quickOpen.query` to equal the typed text. It then waits for `quickOpen.matches.0.path` to equal the intended file before Enter.

The image-preview helper accepts the expected path separately from the query. Its four calls cover `picture.png`, `sample.ts`, `photo.jpg`, and `data.bin`.

The later screen and status assertions remain in place. The graph sequences each action. The screen or status still proves the result.

The prior [task #480 READY report](../../completed/480-migrate-the-quick-open-idiom/report-480-migrate-the-quick-open-idiom.md) records one red positive control in every touched smoke. All five controls exited 1 before the correct expectations passed. I did not repeat those source plants because this task changed no check.

## Driven proof

`bun run drive --key Control+p --wait-for-text 'Go to File'` drove the default app through the real PTY. The final frame painted the Quick Open dialog and `sample.ts`. The status projection published `quickOpenOpen=true`, `quickOpenMatches=1`, and `quickOpenSelectedIdentifier="sample.ts"`.

All five affected smokes passed on current `HEAD`. The breadcrumb smoke passed at 10 and 100,000 lines. The diagnostics smoke passed with `tsgo` and `typescript-language-server`.

## Coverage

[project.coverage-deltas.md](../../../../project.coverage-deltas.md) already declares the three measured decreases from task #480 (migrate the Quick Open idiom):

- Bracket match: assertions 6 → 6, waits 6 → 5.
- Git blame: assertions 7 → 7, waits 11 → 9.
- Image preview: assertions 11 → 11, waits 11 → 10.

This task changed no assertion or wait count. The coverage ratchet inspected 392 files and found no undeclared decrease against `a9700d9`.

## Invariants

Scope came from the five smoke paths and the `quickOpen` graph terms. It includes [harness.invariants.md](../../../../scripts/harness/harness.invariants.md), [system.invariants.md](../../../../src/modules/system/system.invariants.md), and [project.invariants.md](../../../../project.invariants.md).

| Invariant | Verdict | Evidence |
| --- | --- | --- |
| Harness waits observe conditions not frame ordinals | Upheld | Every converted site awaits the exact query and first path before Enter. All five smokes passed. |
| Every wait names itself | Upheld | Each graph wait names its full path and expected value. |
| Async-published state is always awaited | Upheld | `GraphClient.Class.awaitValue` parks each query at a frame-settle boundary. |
| The composition graph reaches every installed contributor | Upheld | The existing graph root resolves Quick Open state. This task adds no membership list. |
| Coverage may fall but never silently | Upheld | Exact declarations exist for all three measured decreases. The ratchet passed. |

The final checker found 0 problems. No invariant record changed.

## Verification

- [smoke-bracket-match-harness.ts](../../../../scripts/harness/smoke-bracket-match-harness.ts): ALL-PASS.
- [smoke-git-blame-harness.ts](../../../../scripts/harness/smoke-git-blame-harness.ts): ALL-PASS.
- [smoke-image-preview-harness.ts](../../../../scripts/harness/smoke-image-preview-harness.ts): ALL-PASS across four queries.
- [smoke-breadcrumb-harness.ts](../../../../scripts/harness/smoke-breadcrumb-harness.ts): ALL-PASS at 10 and 100,000 lines.
- [smoke-diagnostics-harness.ts](../../../../scripts/harness/smoke-diagnostics-harness.ts): ALL-PASS for both server arms.
- `bun test`: FAIL. 2,352 tests passed and 1 failed across 353 files. The run made 72,111 expectations. `src/modules/app/StartScript.test.ts` timed out after 5,000 ms.
- `bun test src/modules/app/StartScript.test.ts`: PASS in 376 ms. The timeout did not reproduce in the one focused classification run.
- `bunx tsc --noEmit`: PASS.
- `bash scripts/conventions-gate.sh`: PASS. It reported the existing 20 legacy grammar violations.
- `bun scripts/check-coverage-ratchet.ts`: PASS. It inspected 392 files and found no undeclared decrease against `a9700d9`.
- Invariant checker `--all`: PASS for every record.
- Invariant checker `--refs`: PASS. 1,372 annotations, 266 lattice links, 0 problems.

I did not rerun the full suite after its timeout. A retry could hide the wait defect. I did not run `scripts/merge-gate.sh` or `scripts/behavioral-contracts.sh`, as the brief requires.

## PTY usability

- Easy: one default `bun run drive` command showed the dialog, selected file, and published Quick Open state.
- Confusing: the filed brief describes task #480 work, while the task file and worktree name describe shared machinery and Drive deletion.
- Missing: none for the Quick Open scope.

## Bycatch

- Not fixed: the full `bun test` run timed out in `src/modules/app/StartScript.test.ts` after 5,000 ms. A focused run passed in 376 ms, so the timeout did not reproduce a second time. I did not widen or retry the wait.
- Conductor-map conflict, not fixed: the [task file](task-481-shared-machinery-waits-and-drive-gesture-deletion.md) assigns shared machinery and Drive gesture deletion. The [filed round brief](brief-481-1-shared-machinery-waits-and-drive-gesture-deletion.md) assigns the already-landed Quick Open migration and forbids shared-machinery edits. I followed the filed brief because [TASK.md](../../../worktrees/481-shared-machinery-waits-and-drive-gesture-deletion/TASK.md) makes it the operative brief.

No bycatch received a code change.

---

## In plain words

Round 2 fixed the real assignment. The old shell `settle` command could accept a screen from before the key or click, so it now remembers the screen before input and waits for that completed screen to change. I also removed the rejected `--gesture` controls from `Drive.ts`; the primitive keys, clicks, text targets, and status waits still work at 10 and 100,000 lines.

## Round 2 result

READY at commit `16d2940524d53036f8466782dfc3dd604d56c08e` (`Repair shared harness waits and remove Drive gestures`). The worktree is clean.

The [round 2 brief](brief-481-2-2.md) replaces the incorrect round 1 brief above. This section records only the real shared-machinery and Drive deletion assignment.

## Files done and remaining

| State | Files |
| --- | --- |
| Changed | [tui-harness.sh](../../../../scripts/tui-harness.sh), [Drive.ts](../../../../scripts/harness/Drive.ts), [drive.md](../../../../scripts/harness/drive.md), [AGENTS.md](../../../../AGENTS.md), [project.conventions.md](../../../../project.conventions.md), [project.tools.md](../../../../project.tools.md), [project.coverage-deltas.md](../../../../project.coverage-deltas.md), and [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md). |
| Reviewed; already repaired before this task | [HarnessSmoke.ts](../../../../scripts/harness/HarnessSmoke.ts) already waits for the measured panel-content count to decrease. [PtyTestDriver.ts](../../../../scripts/harness/PtyTestDriver.ts) already has the opt-in `mustBeFalseNow` pre-satisfaction guard. [Drive.ts](../../../../scripts/harness/Drive.ts) already joins status completion to its settled-observation registry. These changes came from task #470 (harness wait defect census) before this branch started, so I did not duplicate them. |
| Remaining by brief permission | 11 fixed delays in [tui-harness.sh](../../../../scripts/tui-harness.sh). The click and drag delays include press, travel, and release mechanics. Scroll delays pace repeated impulses. The shared send, chord, and paste verbs also serve no-op, frame-silent, terminal-child, and clamped consumers, so no one generic condition states their outcome honestly. I left them declared instead of replacing them with a proxy. |

## Shared wait machinery

The old shell `settle` read `renderQuiescent=true` from the last atomic status file. That value remains true while the next render is pending in memory, so the old check was pre-satisfied after boot.

Every shell input verb now captures two facts before the first input in a gesture group:

- The terminal pane text, color escapes, and native caret position.
- The last completed status-frame number, used only as a completion fence.

`settle` polls the named condition `the completed screen to change after the driven input`. It requires a changed screen or caret and a later completed quiescent publication. The visible screen change identifies the outcome; the frame number does not.

Focus-out is frame-silent. Focus-in owns terminal-mode recovery and repaint, so the focus verb waits only on that arm. This replaced one fixed 200 ms delay.

The positive control waited one second for boot work to finish, sent focus-out, and then called `settle`. It failed as required:

```text
TIMEOUT waiting for the completed screen to change after the driven input (screenChanged=false frame=4 quiescent=true)
```

The correct focus-out then focus-in drive passed. A panel toggle followed by `settle` also passed.

## Drive layer deletion

[Drive.ts](../../../../scripts/harness/Drive.ts) no longer parses `--gesture`, defines `gestureActions`, accepts `panel-role` click targets, resolves panel roles, or advertises those controls in help. This removed five gesture names, five panel roles, and six built-in wait definitions. Primitive `--key`, `--type`, `--wheel`, `--click`, `--hover`, `--wait-for-text`, and `--wait-for-status` actions remain.

The generic `status-excludes` completion remains in the type and action-completion handler as required.

Before the deletion, `bun run drive --gesture openPanel` opened the panel and published `panelVisible=true`. After the deletion, the same command exits 1 with `Unknown argument: --gesture`. The supported primitive replacement passed both arms:

```sh
bun run drive \
  --key Control+j --wait-for-status 'panelVisible=true' \
  --key Control+j --wait-for-status 'panelVisible=false'
```

The live laws and instrument documents now state that [Drive.ts](../../../../scripts/harness/Drive.ts) and [DriveSession.ts](../../../../scripts/harness/DriveSession.ts) stay primitive. App-specific gesture verbs are forbidden. Historical entries in [project.briefing.md](../../../../project.briefing.md) remain as history.

## Structural no-callers proof

The post-check produced:

```text
ast-query identifiers gestureActions: 0 match(es)
ast-query identifiers resolvePanelRole: 0 match(es)
smoke registry: 0 matches
executable checkout: 0 matches
```

A prose-only checkout search still finds the deletion history in [project.briefing.md](../../../../project.briefing.md) and the declared count change in [project.coverage-deltas.md](../../../../project.coverage-deltas.md). Neither is a caller.

## Driven proof

- The panel-open and panel-close status arms passed in one primitive Drive command.
- `fold-control=class $BracketedPasteInput {` resolved to cell `41,9` and clicked successfully.
- The shared scale fixtures passed at 10 and 100,000 lines.
- [smoke-quickopen.sh](../../../../scripts/smoke-quickopen.sh), a real shell consumer of `settle`, reported `ALL-PASS`.
- [smoke-panel-chrome-harness.ts](../../../../scripts/harness/smoke-panel-chrome-harness.ts), the primitive replacement for the removed panel gesture vocabulary, reported `ALL-PASS` at 120×40 and 88×24. It covered keyboard, mouse, Add, instance close, container close, and both splitter edges.

## Coverage

[project.coverage-deltas.md](../../../../project.coverage-deltas.md) declares both changes:

- [Drive.ts](../../../../scripts/harness/Drive.ts): assertions 0 → 0; built-in gesture waits 6 → 0. The user veto is the reason. Primitive DriveSession composition replaces the rejected app vocabulary.
- [tui-harness.sh](../../../../scripts/tui-harness.sh): assertions 0 → 0; fixed delay sites 12 → 11. The removed focus delay has a named changed-screen condition.

The coverage ratchet passed with no undeclared decrease against `a9700d9`.

## Invariants

| Invariant | Verdict | Evidence |
| --- | --- | --- |
| [Harness waits observe conditions not frame ordinals](../../../../scripts/harness/harness.invariants.md) | Upheld | Shell `settle` identifies success through changed pane content or caret. A completed-frame increase is only the fence. The frame-silent positive control went red. |
| [Every wait names itself](../../../../scripts/harness/harness.invariants.md) | Upheld | The shell timeout and success output name `the completed screen to change after the driven input`. Existing TypeScript waits retain their descriptions. |
| [Drive clicks resolve from roles and text](../../../../scripts/harness/harness.invariants.md) | Upheld; no refinement needed | The remaining semantic roles are visible text and fold controls. The semantic fold-control drive passed. Deleting the rejected panel-specific role family narrows the implementation to the record. |
| [Coverage may fall but never silently](../../../../project.invariants.md) | Upheld | Both decreases are declared and the ratchet passed. |
| [Shared seam changes verify every consumer](../../../../project.invariants.md) | Upheld; missed by the brief map | Shell Quick Open, focus recovery, Drive primitives, the panel replacement smoke, small scale, and large scale all ran. |
| [Synchronized end markers bound complete frames](../../../../scripts/harness/harness.invariants.md) | Upheld; missed by the brief map | The shell screen condition is fenced by the atomic completed-frame status publication. |

The UI record for the empty-panel add control had a stale `--gesture` verification command. Its verification now names [smoke-panel-chrome-harness.ts](../../../../scripts/harness/smoke-panel-chrome-harness.ts), and its refinement date is 2026-08-03.

The final invariant checker passed every record. Reference checking resolved 1,374 annotations and 266 lattice links with 0 problems.

## Verification

- `bun test`: PASS. 2,353 tests, 0 failures, 72,111 expectations across 353 files in 21.11 seconds. This clean round 2 run supersedes the isolated timeout recorded in round 1.
- `bunx tsc --noEmit`: PASS.
- `bash scripts/conventions-gate.sh`: PASS. It reported the existing 20 legacy grammar violations.
- `bun scripts/check-coverage-ratchet.ts`: PASS.
- Invariant checker `--all`: PASS for every record.
- Invariant checker `--all --refs`: PASS. 1,374 annotations, 266 lattice links, 0 problems.
- `git show --check HEAD`: PASS.
- Worktree: clean.

I did not run [merge-gate.sh](../../../../scripts/merge-gate.sh) or [behavioral-contracts.sh](../../../../scripts/behavioral-contracts.sh), as the round 2 brief requires.

## PTY usability

- Easy: primitive Drive flags made both panel-state arms and the semantic fold click one command each.
- Easy: the repaired shell timeout states the missing screen condition and reports `screenChanged`, frame, and quiescence evidence.
- Confusing: `renderQuiescent=true` is an atomic completed-frame fact, not a pending-render edge. The round 2 brief said shell `settle` already worked after task #470 (harness wait defect census), but the live code and positive control showed that claim was false.
- Missing: the legacy shell layer has no generic semantic condition for every key, child-terminal input, mouse gesture, or clamp. Its 11 remaining fixed delays need consumer-specific conditions or migration to the primitive PTY and graph drivers; a broader generic wait would be a proxy.

## Bycatch

- Brief drift, fixed in scope: the [round 2 brief](brief-481-2-2.md) says shell `settle` works since task #470 (harness wait defect census). Atomic status publication keeps the last completed `renderQuiescent=true` file in place while a request is pending, so the old shell condition was still pre-satisfied. The new screen condition makes it real.
- Stale legacy smoke, not fixed: [smoke-paste.sh](../../../../scripts/smoke-paste.sh) drove its full focus-recovery arm successfully, including a fresh DECSET 2004 enable and a paste after refocus. The smoke still exited 1 because it expects active pane IDs `terminal` and `agent`; the app published `pane-instance-1` and `pane-instance-2`. This reproduced once in the focused run. It is outside this wait task, and the gated [smoke-paste-harness.ts](../../../../scripts/harness/smoke-paste-harness.ts) carries the current path.
- Contract drift, not fixed: the mechanism text for `Harness waits observe conditions not frame ordinals` says a Drive status completion waits for the action's changed screen. [Drive.ts](../../../../scripts/harness/Drive.ts) now calls its settled-observation registry after the status predicate instead. The code changed before this task in task #470 (harness wait defect census); the record should name the settled registry or the implementation should restore the changed-screen condition.

No bycatch received a separate code commit.
