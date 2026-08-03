# Harness flake-prone wait census

Read-only audit. No source file was changed. Date 2026-08-02.

Defect classes: **1** pre-satisfied wait, **2** proxy wait, **3** sleep-as-synchronization,
**4** stale needle, **5** transient/blink.

Replacement verbs: `GraphClient.Class.awaitValue(statusPath, path, value)` parks the condition in
the app and answers at a frame-settle boundary — use it for classes 1 and 2.
`GraphClient.Class.awaitTransition(...)` is for class 5 only. Graph path roots are the keys of
`statusProjectionPorts`, `src/modules/app/Bootstrap.ts:1403`.

---

## COVERAGE STATEMENT — read this first

This census is **partial**. Files are listed by name below.

**Audited (43 files):**

- Shared machinery: `scripts/harness/PtyTestDriver.ts`, `scripts/harness/HarnessSmoke.ts`,
  `scripts/harness/Drive.ts` (panel-role resolver only), `scripts/tui-harness.sh`,
  `src/modules/system/StatusChannel.ts`.
- `scripts/harness/smoke-scrollbars-harness.ts`, `smoke-git-watch-harness.ts` (contention tier).
- `scripts/harness/smoke-agent-harness.ts`, `smoke-agent-cancel-harness.ts`,
  `smoke-agent-pane-ux-harness.ts`, `smoke-agent-permissions-harness.ts`,
  `smoke-agent-search-harness.ts`, `smoke-agent-skill-popup-harness.ts`,
  `smoke-agent-engine-switch-harness.ts`, `smoke-terminal-harness.ts`,
  `smoke-terminal-follow-harness.ts`, `smoke-terminal-stage-harness.ts`,
  `smoke-terminal-backpressure-harness.ts`, `smoke-inline-rewrite-harness.ts`,
  `smoke-monitoring-harness.ts`.
- All `scripts/smoke-*.sh` except `smoke-plugin-manifest.sh`, `smoke-panel-split.sh`,
  `smoke-activitybar.sh`, `smoke-markdown.sh`, `smoke-tasks-dashboard.sh` (36 scripts).
- `scripts/harness/smoke-panel-chrome-harness.ts` — ONLY the one wait the coordinator named
  (lines 698-750). The rest of the file is already migrated and was not re-audited.

**NOT audited — deferred (34 files).** These batches were dispatched but had not returned when the
report was due:

- `scripts/harness/smoke-plugin-manifest-harness.ts` and `scripts/smoke-plugin-manifest.sh`
  — **CONTENTION TIER, the largest unaudited risk** (49 `awaitGridCondition`, 119 `awaitStatus`,
  and three bare `Bun.sleep(500)` at lines 646, 750, 900).
- `scripts/harness/smoke-panel-split-harness.ts`, `smoke-layout-harness.ts`,
  `smoke-activitybar-harness.ts`, and `scripts/smoke-panel-split.sh`, `scripts/smoke-activitybar.sh`.
- `scripts/harness/smoke-overlay-dialog-harness.ts`, `smoke-markdown-harness.ts`,
  `smoke-markdown-view-mode-harness.ts`, `smoke-tasks-dashboard-harness.ts`,
  `smoke-tasks-harness.ts`, and `scripts/smoke-markdown.sh`, `scripts/smoke-tasks-dashboard.sh`.
- `scripts/harness/smoke-bounded-list-popup-harness.ts`, `smoke-code-folding-harness.ts`,
  `smoke-pixel-preview-harness.ts`, `smoke-settings-applied-harness.ts`,
  `smoke-navigation-history-harness.ts`, `smoke-tree-scroll-harness.ts`,
  `smoke-workspace-tabs-harness.ts`, `smoke-editor-harness.ts`, `smoke-completion-harness.ts`,
  `smoke-field-caret-harness.ts`.
- `scripts/harness/` remainder: `smoke-breadcrumb`, `smoke-quickopen`, `smoke-dirty-marker`,
  `smoke-clipboard-frame-boundary`, `smoke-quit-confirmation`, `smoke-voice-picker`, `smoke-media`,
  `smoke-shortcut-help`, `smoke-goto-definition`, `smoke-database`, `smoke-tabs`, `smoke-text-input`,
  `smoke-horizontal-extent`, `smoke-openproject`, `smoke-gutter-diff`, `smoke-search-mouse`,
  `smoke-hover`, `smoke-diff-overview`, `smoke-selection`, `smoke-git-blame`, `smoke-diagnostics`,
  `smoke-git-log`, `smoke-mode-coherence`, `smoke-find`, `smoke-audio-narration`, `smoke-word-delete`,
  `smoke-image-preview`, `smoke-bracket-match`, `smoke-sdk-extraction`,
  `smoke-workspace-layout-isolation`, `smoke-paste`, `smoke-go-to-line`, `smoke-reserved-chord`,
  `smoke-move-line`, `smoke-indent-guides`, `smoke-comment-styling`, `smoke-wrap`
  (`-harness.ts` each).

Mechanical counts over the deferred set, as a size estimate only (not classified):
80 `typeof status.X === '...'` existence predicates — invariant shape (b) candidates — and
71 bare `driver.awaitScreenChange()` calls suite-wide.

**CONTENTION tier** (`grep contention_smoke scripts/merge-gate.sh`): scrollbars harness (audited),
git-watch harness (audited), panel-chrome harness (migrated), plugin-manifest lifecycle
(**not audited**).

---

## A. SHARED MACHINERY — one fix, many call sites

### A1. `scripts/tui-harness.sh:101-113` — class 1 — **the single highest-value finding**

```
ready|settle)
  r="$(_field ready)"; q="$(_field renderQuiescent)"
  if [ "$cmd" = settle ] && [ "$q" = "true" ]; then echo "settled"; exit 0; fi
```

`renderQuiescent` is set `true` at `src/modules/system/StatusChannel.ts:97` and is **never set back
to `false`** — I verified by grep that line 33 (the initial literal) and line 97 are its only two
writes in all of `src/`, and `Bootstrap.ts:1772` calls `settle()` after every frame. So from the
first painted frame onward `"$H" settle` returns on its first poll against the pre-gesture screen.
**236 call sites across 36 shell smokes are a no-op.** `ready` is sound (`renderQuiescent` is
genuinely `false` before frame one); only `settle` is dead.
Fix: clear `renderQuiescent` when a render is scheduled, making `settle` a real edge; or pass the
pre-gesture frame and poll `StatusSnapshot.frame` (`StatusChannel.ts:96`, field at `:109`) for a
strict increase. Evidence: `StatusChannel.ts:33`, `:97`, `:109`; `Bootstrap.ts:1772`.

### A2. `scripts/tui-harness.sh:118,137,145,152,154,161,164,166,168,178,191,193` — class 3

Every gesture verb carries a hardcoded trailing delay (`send` 0.25, `chord` 0.25, `paste` 0.3,
`click` 0.1+0.2, `drag` 0.08x3+0.2, `focus` 0.2, `scroll` 0.05xN+0.2). Because A1 is dead, **these
sleeps are the only synchronization in the entire shell suite.** No shell-side model path; they
collapse into `settle` once A1 is repaired.

### A3. `scripts/harness/HarnessSmoke.ts:313-316` — class 1 — contention tier

```ts
await driver.awaitGridCondition(
  `${visibleTitle} remains painted after one matching row closes`,
  (candidate) => candidate.findText(visibleTitle) !== null,
);
```

The `expectedRemainingCount > 0` branch of `closePanelContentsListRow`. Already true when issued: a
duplicate row survives the close, so the title is painted both before and after. It returns the
pre-relayout frame while every row below the closed one moves. This is the #464 shape surviving in
the branch that was not fixed — the `=== 0` branch at `:302-307` is correct.
Replacement: `awaitValue(statusPath, 'panelHost.orderedContents.length', measuredCount - 1)`.
Evidence: `get orderedContents()`, `src/modules/ui/PanelHost.ts:780`.

### A4. `scripts/harness/PtyTestDriver.ts:412-439` — structural enabler of class 1

`awaitGridCondition` evaluates the predicate against `this.snapshot()` immediately, with no
pre-satisfaction guard. Its sibling `sendKeysAndAwaitGridConditionByteArrival` at `:277-282`
**already refuses** an already-satisfied predicate (`Cannot measure grid condition already satisfied
before input`). The guard exists in the class and is not applied to the verb everybody calls. An
opt-in `mustBeFalseNow` parameter would make class 1 unwritable rather than merely forbidden. The
invariant *Harness waits observe conditions not frame ordinals*
(`scripts/harness/harness.invariants.md:502-579`, shape (b)) already names this defect; it has no
mechanical enforcement.

### A5. `scripts/harness/Drive.ts:1012-1013` — class 4 (low severity)

```ts
snapshot.findText('Add Terminal') ?? snapshot.findText('Add Database')
```

Dead fallbacks in `resolvePanelRole`. The UI never paints these: `PanelContentsList.ts:86` records
the swap away from them and `PanelContentsList.test.ts:152,157` assert the render does **not**
contain `Add Terminal`. Harmless today because the live `'+ Terminal'` / `'+ Database'` needles
precede them, but the dead arm hides the next rename.

---

## B. CONTENTION TIER — `smoke-scrollbars-harness.ts`

| line | class | wait as written | why | replacement |
|---|---|---|---|---|
| 595-602 | 1 | `awaitStatus('source returns to its first row before preview bar input', markdownPaneFocus === 'source' && Number(editorScrollTop) === 0)` | The click at 590-593 already put leadership on `source` and the source pane was never scrolled, so `editorScrollTop` is still 0 | No path fixes it — the value is already 0; scroll the source down first so the return to 0 is a real transition |
| 1613-1618 | 1 | `sendKeys('Tab'); awaitStatus('the ${modeLabel} probe focuses the opened editor', status.focus === 'editor')` | `focus` defaults to `'editor'` and quick-open activation never leaves it, so the wait passes before Tab — and Tab may then move focus *after* it returned | `workspaceSet.active.focus` (`src/modules/workspace/Workspace.ts:449`); better, drop the Tab |
| 1838-1841 | 1 | `awaitGridCondition('the edited diff fixture returns to the Git changes pane', findText('VERY-LONG-COMM') !== null)` | The commit subject stays painted in the primary dock across `Control+g`, so the pre-keystroke frame satisfies it and the `o` at 1842 races pane ownership | `awaitValue(statusPath, 'primaryDockHost.activeId', <git content id>)` (projected as `sidebarView`, `src/modules/app/AppStatusProjection.ts:169`) |
| 2403-2413 | 1 | `awaitGridCondition('the tree filename tail is clipped at the leftmost horizontal offset', proof.thumbStartRow === initialThumb.thumbStartRow && findText('CHANGES-END-MARKER') === null)` | Both conjuncts are true on entry — the thumb row was fixed by the wait at 2399-2402 and the tree has not been scrolled right yet (that happens at 2418) | None; this is the assertion at 2414-2417 written twice, once as a wait. Delete the wait |
| 2526-2533 | 1 | `awaitStatus('the expanded agent composer owns focus before the long paste', panelActiveContentKind === 'agent' && panelFocused === true)` | The pane was opened at 2501 and confirmed at 2502-2509; expanding does not unfocus, so it holds before the click at 2521-2525 and the paste at 2539 is unsynchronised | Paths exist but are equally pre-satisfied (`panelHost.focused` `src/modules/ui/PanelHost.ts:52`, `panelHost.activeId` `:60`) — needs a composer-caret condition that is false at issue |
| 2549-2556 | 1 | same predicate as 2526-2533, after a second `clickText('Claude')` | Nothing between the two removes focus; a pure no-op | Delete |
| 618-623 | 1 | `awaitStatus('${lineCount}-line horizontal preview bar input claims preview leadership', markdownPaneFocus === 'preview')` | `dragScrollbarThumb` at 603-607 only returns after four advancing preview positions, so leadership already flipped | No model path — `markdownPaneFocus` is a plugin contribution (`src/modules/markdown/MarkdownPlugin.ts:204`) and `statusProjectionContributions` serializes contributor functions as `<function>`. Make it a `requireCondition` |
| 660-667 | 1 (weak) | `awaitStatus(... markdownPaneFocus === 'preview' && Number(editorScrollTop) > sourcePositionBeforePreviewDrag)` | The `preview` conjunct is already true after the completed drag; only the source-follow half can still be false | Largely benign — demote the leading conjunct to an assert |
| 2330-2335 | 1 (mild) | `awaitStatus('the coarse deep-line wheel drive is halted …', workspaceScrollMomentumAtRest === true)` | If the coarse loop exited by exhausting its 180 impulses, momentum may already be at rest when the halting click is sent | Harmless, but it proves nothing about the click |
| 1832-1836 | 3 / 2 | `sendKeys('Control+s'); await driver.awaitScreenChange();` | A save synchronised by "any screen diff"; if the write has not landed the git re-scan below reads the old file | `awaitValue(statusPath, 'workspaceSet.active.editor.document.dirty', false)` (`AppStatusProjection.ts:83`) |
| 281, 523, 1606, 2182 | 2 | `awaitScreenChange()` after `sendText(<filename>)` in Quick Open | "Some cell changed" is a proxy for "the filter narrowed to my file"; Enter can open the wrong file | `awaitValue(statusPath, 'quickOpen.query', '<name>')` (`Bootstrap.ts:1548`; root at `:1408`; `get open` at `src/modules/search/QuickOpen.ts:31`) |
| 276-279, 517-521, 1601-1604, 2177-2180 | 2 (low) | `awaitGridCondition('… opens Quick Open', findText('Go to File') !== null)` | Screen text as a proxy for an overlay-open flag; the needle is live but is also the command-bar tooltip (`src/modules/ui/CommandBar.ts:234`), so it is not unique | `awaitValue(statusPath, 'quickOpen.open', true)` (`QuickOpen.ts:31`) |
| 362-370, 434-441 | 2 (low) | theme switches awaited through `settingsSelectedValue` | Waits on the row's rendered value text, not the setting | `awaitValue(statusPath, 'settings.theme', 'light'\|'dark')` (`src/modules/settings/Settings.ts:98`) |
| 1639-1642 | 2 | `sendKeys('Alt+z'); await driver.awaitScreenChange();` | Wrap toggling awaited by repaint | `awaitValue(statusPath, 'workspaceSet.active.editor.wordWrap', true)` (`AppStatusProjection.ts:193`) |
| 2293-2313 | 3 | `Bun.sleep(20)` inside a 180-iteration wheel loop | The sleep paces the impulses; 180x20 ms of wall clock is the only thing before the observation window | Park on `editorScrollTop` per impulse |
| 2363-2368 | 5 | `awaitStatus('a precision wheel gesture starts …', workspaceScrollMomentumAtRest === false)` | A two-notch gesture can start and rest between two publications, so frame-settle sampling can miss the `false` window entirely | `awaitTransition` on the momentum flag, or drop it and keep only the at-rest wait at 2369-2374 |

Verified live, not stale: `'✓ 3 lines'` / `'$ echo'` (`src/modules/agent/EchoAgentBackend.ts:94-117`,
`src/modules/agent/AgentToolSummary.ts:61,96`), `'local echo backend'` (`EchoAgentBackend.ts:37`).
No class 4 in this file.

---

## C. CONTENTION TIER — `smoke-git-watch-harness.ts`

| line | class | wait as written | why | replacement |
|---|---|---|---|---|
| 68-73 | 1 | `awaitStatus(status.focus === 'git' && status.gitChangedCount === 0)` | `gitChangedCount` is **0 whenever the repository object is absent** (`repository ? staged+unstaged+untracked : 0`, `src/modules/git/GitPlugin.ts:460-464`), so "clean repo, 0 changes" is satisfied by a repo that has not scanned yet | No model path distinguishes the two zeroes — needs a scan-completion field on GitPlugin, or a first assertion against a known non-zero count |
| 143-149 | 1 | `sendKeys('Control+g'); awaitStatus('Number(status.gitChangedCount) >= 1')` | The watcher publishes the untracked symlink regardless of which pane is visible, so this is already true before `Control+g`, and there is no `focus === 'git'` conjunct at all; the `o` at 150 goes to the file tree | `awaitValue(statusPath, 'primaryDockHost.activeId', <git content id>)` (`AppStatusProjection.ts:169`) or `workspaceSet.active.focus` (`Workspace.ts:449`) |
| 159-164 | 1 | `awaitStatus('the Git changed count remains published after opening the untracked symlink row', gitChangedCount >= 1)` | Identical to the condition 143-149 established; intended as a did-not-crash probe, but a **crashed app leaves the same status file on disk**, so it structurally cannot fail for the reason it claims | Liveness needs a fresh answer only a live app can give: `GraphClient.Class.query(statusPath, 'panelHost.orderedContents.length', 'settle')` (the handshake is served in-app, `GraphClient.ts:55-73`) |
| 150-151 | 2 | `sendKeys('o'); sendKeys('Control+p');` with nothing between | The EISDIR regression is then "proved" by `quickOpenOpen === true`, which is a proxy for the app being alive, not for the row having opened | Add a real wait on the `o` outcome, then the graph liveness read above |
| 165-168 | — | `requireCondition(Number(beforeOpenStatus.gitChangedCount) >= 1, 'opening the untracked node_modules-symlink row did not crash the app')` | Not a wait: `beforeOpenStatus` was captured at 144, *before* `o` was sent. The label claims something the value cannot say | Re-read after the gesture |

Clean: 63-66, 139-142, 85-91, 107-113.

---

## D. THE NAMED CONTENTION FAILURE — `smoke-panel-chrome-harness.ts`

Coordinator's question: the wait
`"88-column a drag begun on the last cell of the drag span still resizes the panel"`.

**Verdict: the named wait is NOT the defect — it is the victim. The defect is its precondition wait
eight lines above, which is class 1.**

`scripts/harness/smoke-panel-chrome-harness.ts:740-745` — the named wait — is **sound**:

```ts
const rowBeforeEdgeDrag = tabBar(HarnessSmoke.Class.readStatus(statusPath)).row;   // :709-711
...
await HarnessSmoke.Class.awaitStatus(driver, statusPath,
  `${columns}-column a drag begun on ${edgeName} still resizes the panel`,
  (candidate) => tabBar(candidate).row !== rowBeforeEdgeDrag);                      // :740-745
```

`rowBeforeEdgeDrag` is sampled fresh immediately before the press, so the predicate is genuinely
false at issue. It timed out because the press never landed on the splitter.

**`scripts/harness/smoke-panel-chrome-harness.ts:712-717` — class 1** is why:

```ts
const edgeSnapshot = await driver.awaitGridCondition(
  `${columns}-column splitter mark is painted before the ${edgeName} drag`,
  (snapshot) => Array.from(snapshot.rowText(rowBeforeEdgeDrag)).indexOf('─') >= 0,
);
const edgeColumn = edgeColumnOf(splitterMarkRun(edgeSnapshot, rowBeforeEdgeDrag));  // :718-720
```

What makes it already true: the splitter always paints `─` — it was asserted painted at 668-687
before the loop, and it is painted both before and after each drag. So on the **second** loop
iteration (`edgeName === 'the last cell of the drag span'`, the one that failed) the wait returns
instantly.

The failure mechanism, and why it is contention-only:

1. `rowBeforeEdgeDrag` comes from the **status file** (the model), which iteration 1's drag has
   already updated.
2. `edgeSnapshot` comes from the **grid**, which under load may still be painting the pre-relayout
   frame.
3. The predicate only asks for *some* `─` anywhere on that row number. In the stale frame the old
   splitter or tab chrome satisfies it, so nothing forces the grid to catch up to the model.
4. `splitterMarkRun` (`:77-88`) then takes `lastIndexOf('─')` over that stale row, so `edgeColumn`
   is the **old** span's last column.
5. The press at `:722-727` lands outside the new splitter's grab band, no resize occurs, and the
   named wait at 740 burns its full timeout.

Contention widens exactly the model-to-paint window in step 2, which is why this passes in
isolation and failed once under load.

Fix: make the precondition wait observe the relayout instead of the glyph. The model row is
addressable — `panelSeparatorGeometry.row` is published from
`src/modules/ui/RootView.ts:2515` (the projection object built at `:2510-2519`) — so wait for the
grid row to agree with the model row before reading the mark run, e.g. require the `─` run on
`rowBeforeEdgeDrag` **and** no `─` run on the previous iteration's row, or gate the snapshot read
on `awaitValue(statusPath, ...)` for the settled geometry first. Do not read `edgeColumn` from a
frame that no wait tied to the current layout.

Secondary note, same block: `splitterMarkRun` scans the **whole row** with `indexOf`/`lastIndexOf`
and the frame controls sit on that row to the right of the drag span (`:659-664`). Any future `─`
in a control glyph silently moves `lastColumn`. Bound the scan to
`[drag.left, drag.left + drag.width)`.

---

## E. AGENT AND TERMINAL FAMILY

### Class 1 — pre-satisfied

| file:line | wait as written | why | replacement |
|---|---|---|---|
| `smoke-terminal-follow-harness.ts:788-792` | `awaitStatus('the assistant count remains unchanged after the terminal action…', agentAssistantEntryCount === assistantEntryCount)` | **Highest value in this family.** This is the NEGATIVE arm of the whole follow-mode contract — what proves `on-error`, `on-request` and `off` stay silent — and the two values are equal at the instant of the call, so it returns immediately. Every "stays silent" pass in this harness is vacuous. Called from :88, :103, :108, :125, :130, :225, :341 | No path fixes a negative — needs an observation WINDOW over `agentPaneContent.agentSession.transcript.length` (`AppStatusProjection.ts:386`), in the shape already used at `smoke-terminal-harness.ts:532-557` |
| `smoke-terminal-follow-harness.ts:633-639` | `awaitStatus(terminalObservedEventCount === observedEventCount && agentBusy === false && agentTurnState === 'idle')` | All three are the state captured at :612-617 | Hold-window on `terminalPaneContent.observedEventCount` (`src/modules/terminal/TerminalPaneContent.ts:257`) |
| `smoke-agent-cancel-harness.ts:541-551` | `awaitGridCondition('held queued message exposes its click target', findText('[queued]'))`, then click at `queuedMarker.column + 2` | `[queued]` was painted before the Escape at :522, and the cancel inserts a `canceled` transcript row that MOVES every row below it — the #464 geometry shift verbatim | Measure `agentPaneContent.agentSession.transcript.length`, `awaitValue` for `length + 1`, then re-find the marker (`AppStatusProjection.ts:386-389`) |
| `smoke-agent-engine-switch-harness.ts:137-139` | `submitTurn`: `awaitSnapshot(findText('You said'))` | The echo backend prints `You said:` on EVERY reply, so from the second call on (:264) the previous reply satisfies it and the new turn is never awaited | `awaitValue` on `agentPaneContent.agentSession.transcript.length` above a measured baseline |
| `smoke-agent-search-harness.ts:108-113` | `sendTurn`: `awaitStatus(status.agentBusy === false)` right after `Enter` | The session is idle at that instant, so all seven seeded turns can "complete" without a reply landing; the later `findMatchCount === 4` then depends on luck | `agentPaneContent.agentSession.transcript.length` at baseline+2 (`AppStatusProjection.ts:386-389`) |
| `smoke-agent-harness.ts:121-126` and `:175-180` | `awaitStatus('status condition: status.terminalVisible === false')` after hiding the agent pane | `terminalVisible` is false from boot (asserted at :73-82) and never becomes true in this smoke; the hide is never observed | `awaitValue(statusPath, 'panelHost.visible', false)` (`AppStatusProjection.ts:266`) |
| `smoke-agent-permissions-harness.ts:210-215` | `awaitStatus('the gated agent tool remains busy…', agentBusy === true)` | `submitPrompt` already waited for the pending permission, which implies busy | — |
| `smoke-agent-permissions-harness.ts:252-259` | `awaitGridCondition('the permission prompt remains visible without rendering stray input', '[y] allow' && '[n] deny' && '[a] always' && findText('zqx') === null)` | All four conjuncts are true the moment `zqx` is sent, before the app can paint. A "remains" claim cannot be a wait | No model path — needs an observation window |
| `smoke-agent-permissions-harness.ts:260-265` | `awaitStatus('stray typing leaves the Bash permission unresolved', agentPendingPermissionTool === 'Bash')` | Already true from `submitPrompt` :97-104 | — |
| `smoke-agent-permissions-harness.ts:275-278` | `awaitSnapshot(findText('gated for: fourth-gated-command'))` | The permission prompt itself paints `$ echo gated for: <prompt>` (asserted at :219), so the needle is on screen before the tool runs | — |
| `smoke-agent-cancel-harness.ts:381-384` | `awaitGridCondition('running prompt remains visible after the overlay closes', findText('hang-overlay'))` | Painted at submit time (:325) and never covered; the snapshot then supplies a click target at :385 | — |
| `smoke-agent-cancel-harness.ts:400-405` | `awaitGridCondition('the transcript visibly marks cancellation', findText('canceled') && findTextInRectangle('❯'))` | The FIRST cancel at :311-316 already pushed a `'canceled'` system entry (`src/modules/agent/AgentSession.ts:303`) | `agentPaneContent.agentSession.turnState === 'canceled'` is already used at :393; the grid wait adds nothing |
| `smoke-agent-pane-ux-harness.ts:527-532` | `awaitStatus('the collapsed tool publishes no expanded tool rows', agentExpandedCount === 0)` | Nothing has ever been expanded; 0 since boot | — |
| `smoke-agent-pane-ux-harness.ts:590-593` | `awaitGridCondition('the wrapped reply row ending in phase 2 is visible after the tool collapses', findText('phase 2).'))` | The echo reply has painted since :459; collapsing does not create it | — |
| `smoke-agent-pane-ux-harness.ts:717-720` | `awaitGridCondition('the newest transcript row is visible after tail anchoring is restored', findText('gamma-newest-prompt'))` | Tail anchoring was already re-armed by the model wait at :705-711; the returned snapshot supplies drag coordinates at :728-734 | — |
| `smoke-agent-engine-switch-harness.ts:265-270` | `awaitGridCondition(findText('End of ported context') && findText('MAGENTA-8842'))` | `MAGENTA-8842` was the first prompt (:228) and sits in the transcript | Weak barrier atop a pre-satisfied `submitTurn` |
| `smoke-agent-engine-switch-harness.ts:230-233`, `:280-283` | `awaitGridCondition(hasTranscriptLabel(…, 'Claude'\|'Codex'))` | Made true on entry by the pre-satisfied `submitTurn` and by the PageUp loop at :271-279 | Assertion-shaped, low blast radius |
| `smoke-agent-skill-popup-harness.ts:224` | `awaitSnapshot(findText('❯ /iv'))` after Escape | The point is that Escape *preserves* it, so the needle never changes | Model side already covered at :218-223 |
| `smoke-agent-skill-popup-harness.ts:233-237` | `readStatus(...)` with **no wait**, then `requireCondition(agentSkillPopupOpen === false)` | The file may predate the keystrokes, and `false` is also the prior state; the negative can never fail | `agentSkillPopup` is a graph root (`Bootstrap.ts:1403`); needs a hold-window |
| `smoke-terminal-harness.ts:1033-1035` | `awaitSnapshot(findText('NEW-OUTPUT-RETURNS-BOTTOM'))` after `sendText('echo NEW-OUTPUT-RETURNS-BOTTOM')` | **The shell ECHOES the typed command**, so the needle is on screen before `Enter` is sent | `terminalPaneContent.scrollTop` / `.scrollContentRows` (`TerminalPaneContent.ts:273-281`) — already done at :1036-1044 |
| `smoke-terminal-harness.ts:1189-1191` | `awaitSnapshot(findText(tasksWatchBaselineMarker))` after `printf 'TASKS-WATCH-BASELINE\n'` | Same echo problem; partly rescued by `awaitOutputCondition` at :1192-1202 | — |
| `smoke-terminal-harness.ts:1106-1108` | `awaitSnapshot(findText('CHILD-MODE-READY'))` | Painted since :1055, never cleared | — |
| `smoke-terminal-harness.ts:1375-1387` | `awaitGridCondition('the status-bar minute clock renders as HH MM', /[0-2][0-9]:[0-5][0-9]/)` | The clock has painted for the whole run | — |
| `smoke-terminal-harness.ts:1388-1393` | `awaitStatus('the terminal remains focused before quit', terminalFocused === true)` | True since :816 | — |
| `smoke-terminal-backpressure-harness.ts:64-67` | `awaitGridCondition('the nested shell completes a readiness round trip', findText('BACKPRESSURE_READY'))` | Echoed command satisfies it; no round trip observed | — |
| `smoke-terminal-backpressure-harness.ts:112-115` | `awaitGridCondition('the terminal heading names the running shell before the backpressured paste', findText('bash'))` | The typed command at :75-78 literally begins `bash -c '…'`. The comment says this line was hardened after a 2026-07-26 gate failure — the hardening is void because the needle is one the *input* paints | `awaitValue` on `terminalPaneContent.title` (`TerminalPaneContent.ts:96`) |
| `smoke-terminal-stage-harness.ts:191-193` | `awaitSnapshot(textRows().join('\n').includes('/tmp'))` after `cd /tmp` + `pwd` | `cd /tmp` is echoed | — |
| `smoke-terminal-stage-harness.ts:326-328` | `awaitSnapshot(terminalText().includes('echo "test — with emoji 🦊'))` | Already asserted at :293-301 and the edits leave it unchanged; the mid-line edit is never awaited | — |
| `smoke-terminal-stage-harness.ts:496-501` | `awaitStatus(candidate.panelFocusedIndex === terminalCellIndex)` | `terminalCellIndex` was read at :250 as the then-focused index and focus has not moved | — |
| `smoke-terminal-stage-harness.ts:528-530` | `awaitSnapshot(terminalText().includes('ANIMATED_RUN'))` | The agent types `printf ANIMATED_RUN > …`, so the literal is in the command line before execution | The `awaitFileContents` at :527 is the only real barrier |

### Class 2 — proxy

- `smoke-agent-pane-ux-harness.ts:471-479`, `:686-693`; `smoke-agent-engine-switch-harness.ts:271-279`;
  `smoke-terminal-stage-harness.ts:212-224` — PageUp loops driven by `driver.awaitScreenChange()`.
  Replace with `agentPaneContent.scrollTop` decreasing per page
  (`src/modules/agent/AgentPaneContent.ts:346`).
- `smoke-agent-harness.ts:84`, `smoke-agent-skill-popup-harness.ts:87`, `smoke-terminal-harness.ts:762`
  — bare `awaitScreenChange()` to make the status bar safe to measure.
  `panelHost.visible` / `panelHost.focused` (`AppStatusProjection.ts:266-267`).
- `smoke-agent-permissions-harness.ts:192-204` — `Shift+Tab` verified only by a footer row-text diff,
  with no model wait at all; the sibling `smoke-agent-pane-ux-harness.ts:412-417` does it correctly.
  `settings.agentSkipPermissions` (`AppStatusProjection.ts:380`).
- `smoke-agent-search-harness.ts:206-210` — the search icon is located by scanning cells for the
  themed glyph although `findBar` is a graph root and the footer geometry is published at :198-203.

### Class 3 — sleep as synchronization

- `smoke-inline-rewrite-harness.ts:281` — `Bun.sleep(800)` inside the per-character typing loop,
  chosen to straddle the rewrite debounce. The only true "sleep to sequence the app" here.
  `inlineRewriteMockRequestCount` / `inlineRewriteRequestInFlight` are already published (used at
  :262-269).
- `smoke-monitoring-harness.ts:360` — `Bun.sleep(3_000)` then compare sample counts. A deliberate
  negative window, but 3 s of gate wall clock behind a magic constant.
- `smoke-agent-cancel-harness.ts:535-540` (`requirePromptCountRemainsUnchangedFor(…, 450, …)`) and
  `smoke-terminal-harness.ts:1159-1165` (`…RemainsUnchangedFor(…, 250)`) — honest hold-windows, the
  right shape for the class-1 negatives above, but the durations are invented.
- Acceptable poll grain (external artifacts, nothing in the model to park on):
  `smoke-agent-cancel-harness.ts:76,95,115,136`; `smoke-agent-pane-ux-harness.ts:237`;
  `smoke-terminal-harness.ts:354,371,550`; `smoke-terminal-stage-harness.ts:92`;
  `smoke-terminal-backpressure-harness.ts:102`.

### Class 4 — none

Verified live: `esc to cancel` (`src/modules/agent/AgentPaneContent.ts:674`), `canceled`
(`AgentSession.ts:303`), `Terminal ×` (`src/modules/ui/PanelTabBar.test.ts:116`), `▸`/`▾`
(`src/modules/theme/ThemeIcons.ts:840-841`), `switched to codex — context ported`
(`AgentSession.ts:210`), `End of ported context`
(`src/modules/agent/TranscriptContextSerializer.ts:81`).

### Class 5 — transient/blink (flag only; `awaitTransition` if anything)

- `smoke-agent-cancel-harness.ts:482-485` — `[queued]` during a ~900 ms drain.
- `smoke-agent-pane-ux-harness.ts:432-437` — `thinkingLine && '0s' && '⧗ Bash'`, alive only inside
  the 2 s echo delay; `:447-452` waits for spinner text to DIFFER from a captured frame — an
  animation phase, not a state.
- `smoke-terminal-follow-harness.ts:402`, `:492`, `:695-697` — spinner glyph inside a 700 ms turn.
- `smoke-terminal-follow-harness.ts:426-433`, `:457-462`, `:478-483` —
  `assistantEntryCount >= baseline+2 && agentBusy === true && queuedMessageCount === 0` is a
  hand-off *instant*; if turn two finishes before the next sample the wait fails on a correct run.
- `smoke-terminal-stage-harness.ts:515-521` — `includes('printf ANI') && !includes(fullCommand)`,
  an intermediate typing frame by construction.
- `smoke-inline-rewrite-harness.ts:421-428` — `requestInFlight === true && renderQuiescent === true`
  sampled inside a 3.5 s window; safe today only because the delay is large.

### Separate defect — floating promise

`smoke-agent-cancel-harness.ts:317, :421, :465, :530` — `awaitProcessAbsence(...)` is called
**without `await`** at all four sites. The "process group is absent" checks never gate the smoke,
and a timeout becomes an unhandled rejection racing `driver.dispose()` in the `finally`. Four passes
are reported that were never verified.

---

## F. SHELL SMOKES (36 scripts)

Beyond the shared-helper findings A1 and A2:

### Class 1

| file:line | wait as written | why |
|---|---|---|
| `scripts/smoke-editor.sh:298` | `"$H" capture "$S" \| grep -q "Command Palette"` as the "app quit" verdict after `C-q` | `Command Palette` is painted only as an overlay title (`src/modules/ui/OverlayLayer.ts:177,1181`) and no palette is open, so the absence check is true before `C-q` and passes on a live app. Use the `smoke-terminal.sh:131-135` pattern, or poll `tmux display-message -p '#{pane_current_command}'` as `smoke-mode-coherence.sh:193-198` does |
| `scripts/smoke-gutter-diff.sh:145` | `wait_for_no_diff_marker "$EDIT_SESSION" 'alpha'` | Both conjuncts true the instant the clean file paints, before the git diff can run; cannot distinguish "computed, correctly empty" from "not computed yet". No status field for gutter state — needs one, or port to the harness twin (named in this file's own comment at :216) |
| `scripts/smoke-tree-scroll.sh:35` | `[ "$after_click" = "$scrolled" ]` after only `sleep 0.3` | If the click has not been processed, `treeScrollTop` is trivially unchanged and it passes for the wrong reason. Anchor on `activeBuffer` (already read at :33) becoming non-null first |
| `scripts/smoke-selection.sh:175`, `:227` | `expect_equal "$(field treeSelected)" '15'` / `"$(field gitChangesIndex)" '10'` | No-change assertions read after the dead `settle`; the value already equals the expected one and hover paints nothing else these scripts read. Contrast :180/:232/:264, which ARE anchored by an adjacent `expect_greater_than`. No hover-row field exists in `AppStatusProjection.ts` today |
| `scripts/smoke-paste.sh:92-93` | `sleep 0.5` then `grep -aq $'\x1b\[?2004h' "$RAWLOG"` | `pipe-pane` is armed at :88 and the log is never truncated, so ANY `2004h` since arming satisfies it — including one from focus-*out*. Record the byte length before `focus … in` and grep only the tail |
| `scripts/smoke-scrollbars.sh:368` | `wait_for_frame_text "$overflow_frame" 'END-MARKER.txt'` | The needle is a suffix of the tree fixture's own filename, scrolled into view at :351 and never scrolled back; if the tree stays painted the wait is satisfied by the tree, not the changes pane |
| `scripts/smoke-scrollbars.sh:400` | `wait_for_frame_text "$fits_frame" 'fit'` as "fitting git panel loaded" | The workspace is `mktemp -d /tmp/tui-scrollbars-fits.XXXXXX` and the tab strip paints the project name, so `fit` is on screen at boot, before `C-g`. Use the commit subject, or `gitChangedCount` |

### Class 4 — the one confirmed stale needle (I verified this myself)

`scripts/smoke-activitybar.sh:155` and `:177` —
`expect_frame_contains 'Space/Enter installs or'`.
The app paints `'\n   Space/Enter changes state · Enter again restarts to apply\n'`
(`src/modules/plugins/ExtensionsPaneContent.ts:76`). The word `installs` appears nowhere in `src/`.
The harness twin already uses the current text (`smoke-activitybar-harness.ts:816`, `:946`,
`findText('Space/Enter changes')`). This script only runs under `INVAR_FULL_TMUX=1`, which is why
it rotted unseen. (This file was in a deferred batch; the needle is reported because I confirmed it
directly.)

### Class 2

- `scripts/smoke-git-log.sh:65`, `:86`, `:112` — `wait_for_capture 'ext-tip-C' 12` etc. grep the pane
  for a commit subject to detect reconciliation, while the script reads the authoritative field two
  lines later (`f gitLogTipSha`, `src/modules/git/GitPlugin.ts`). Poll the field.
- `scripts/smoke-scrollbars.sh:352`, `:357`, `:374` — `wait_for_frame_text` on fixture text as a
  transition proxy; :357 has a model twin (`gitChangedCount`). :352/:374 are genuinely visual and
  only need a frame-advance anchor.
- `scripts/smoke-shortcut-help.sh:117-121` — `scroll_sheet_until` pages until the frame contains
  text; `shortcutHelpOpen` exists but no row-window field does. Needs a sheet scroll-offset field or
  the harness twin.
- `scripts/smoke-word-delete.sh:40-48` — `find_query_verdict` scrapes the frame for `no results` /
  `\d+ of \d+`; the query is a field (`findQuery`, used by `smoke-agent-search.sh:122`).
- `scripts/smoke-git-watch.sh:19-28` — `wait_for_count` calls the dead `settle` each iteration
  (:22); harmless, but misleading. The real wait (the `gitChangedCount` compare) is correct.

Acceptable proxies, not defects: `smoke-pixel-preview.sh:78-86` (raw PTY log — the escape sequence
IS the contract), `smoke-terminal.sh:70/80/88` (child shell output is ground truth),
`smoke-keyboard-invariant.sh:217-222` (polls the file the child reporter writes).

### Class 3 — the dominant shell class

**244 `sleep` lines across the 36 scripts; ~238 are synchronization.** Four repeating shapes:

- **Shape A — `sleep N; "$H" settle` after a gesture** (the most common line in the suite; the
  `settle` is dead, so `sleep N` alone stands in for "the app consumed the key and repainted").
  Hits: `smoke-agent-search.sh:27,28,109,120,129,131,159,161,162,177,179,184`;
  `smoke-agent.sh:22,50,54,68,71`; `smoke-audio-narration.sh:38,43,45,91,95`;
  `smoke-bracket-match.sh:58,60,65,71,83`; `smoke-comment-styling.sh:69,91,109,113,117,127`;
  `smoke-editor.sh:111,114,123,127,140,156,166,174,185,189,190,194,195,196,198,201,215`;
  `smoke-find.sh:21,26,27,37,39,41,45`; `smoke-git-blame.sh:26,59,61,64,79,81,86`;
  `smoke-git-log.sh:54,75,97,101,107,108,117,123,129`; `smoke-git-watch.sh:33,62,65`;
  `smoke-goto-definition.sh:106,160,171`; `smoke-image-preview.sh:100,103,137,139,150,152,196,198`;
  `smoke-indent-guides.sh:22,55,76`; `smoke-mode-coherence.sh:44,93,184`;
  `smoke-move-line.sh:21,41,43,46,57,70`; `smoke-navigation-history.sh:41,42,48,60,70`;
  `smoke-openproject.sh:35,80,82,90,107,116,129`; `smoke-paste.sh:24,92`;
  `smoke-pixel-preview.sh:60,63`; `smoke-quickopen.sh:22,32`;
  `smoke-search-mouse.sh:38,113,130,140,145,147,155,160,166,170,177,180,182,190,220`;
  `smoke-selection.sh:32,211,255`; `smoke-shortcut-help.sh:49,211,246`;
  `smoke-tabs.sh:41,45,60,62,70`; `smoke-terminal.sh:64,69,77,83,105,131`;
  `smoke-tree-scroll.sh:25,32`; `smoke-voice-picker.sh:43,65,66,69,72,84`; `smoke-word-delete.sh:51`;
  `smoke-workspace-tabs.sh:89,94,100,145,154,159,175,200,209,216`;
  `smoke-wrap.sh:37,58,60,83,106,111,120,124`; `smoke-keyboard-invariant.sh:49,61,221,293,348`.
- **Shape B — inter-keystroke pacing** (`sleep 0.03`-`0.06` per character), standing in for "the
  input decoder drained the previous byte": `smoke-agent-search.sh:119`; `smoke-bracket-match.sh:21`;
  `smoke-find.sh:27,40,42`; `smoke-git-blame.sh:30`; `smoke-image-preview.sh:102,138,151,197`;
  `smoke-move-line.sh:19`; `smoke-openproject.sh:81,89,106`; `smoke-pixel-preview.sh:62`;
  `smoke-quickopen.sh:31`; `smoke-search-mouse.sh:146,181,189`; `smoke-voice-picker.sh:77`.
- **Shape C — wheel/drag pacing**: `smoke-editor.sh:184,188`; `smoke-scrollbars.sh:48,193,346`;
  `smoke-tree-scroll.sh:24`; `tui-harness.sh:161,164,166,191`.
- **Shape D — poll grain inside a deadline loop (acceptable)**:
  `smoke-gutter-diff.sh:83,96,106,116`; `smoke-pixel-preview.sh:74,83,92`;
  `smoke-scrollbars.sh:40,205,216,226,241,256,266,277`; `smoke-goto-definition.sh:90`;
  `smoke-git-log.sh:33`; `smoke-git-watch.sh:25`; `smoke-git-blame.sh:26`;
  `smoke-keyboard-invariant.sh:49,61`.

Legitimate deadline sleeps (measuring an interval — not defects): `smoke-editor.sh:284,286`,
`smoke-terminal.sh:123`, `smoke-agent.sh:78`, `smoke-agent-search.sh:171`,
`smoke-audio-narration.sh:101`.

Shapes A-C cannot be repaired inside bash while A1 is dead. Fix `settle` first; every Shape-A sleep
then collapses into it. Shapes B and C need a per-byte acknowledgement the shell cannot see — port
those to `PtyTestDriver`.

### Class 5

`smoke-hover.sh:135` (0.2 s sample against a 0.5 s dwell); `smoke-hover.sh:148-157` (the 30 s card
poll calls `move_mouse_to` each iteration, perturbing the dwell it samples);
`smoke-gutter-diff.sh:112-119`, `smoke-scrollbars.sh:266-273` and `:275-282` (0.5 s
absence/persistence sampling that cannot distinguish "converged" from "has not reconciled yet").

Clean (thin wrappers, no shell waits): `smoke-monitoring.sh`, `smoke-diagnostics.sh`.

---

## COUNTS PER CLASS (audited files only)

| Class | Count | Notes |
|---|---|---|
| 1 — pre-satisfied | **53** | 1 shared helper (`tui-harness.sh settle`) standing behind 236 shell call sites; 1 shared helper (`HarnessSmoke.closePanelContentsListRow`); 1 in the named panel-chrome block; 11 scrollbars; 3 git-watch; 30 agent/terminal; 7 shell-script-local |
| 2 — proxy | **22** | 4 scrollbars groups (12 sites); 1 git-watch; 9 agent/terminal; 8 shell |
| 3 — sleep as sync | **~258** | 12 in `tui-harness.sh` gesture verbs; ~238 shell-script-local; 6 in the agent/terminal harnesses (+9 acceptable poll loops) |
| 4 — stale needle | **2** | `smoke-activitybar.sh:155,177` (confirmed against `ExtensionsPaneContent.ts:76`); `Drive.ts:1012-1013` (dead fallbacks) |
| 5 — transient/blink | **13** | 1 scrollbars; 7 agent/terminal; 5 shell |
| Other (not a wait class) | **6** | 4 floating `awaitProcessAbsence` promises; 2 tautological assertions (`smoke-git-watch-harness.ts:165-168`, `smoke-agent-skill-popup-harness.ts:233-237`) |

---

## TOP 5 FIXES, by flake reduction per unit of change

1. **`scripts/tui-harness.sh:101-113` — make `settle` a real edge.** One helper, 236 dead call sites
   across 36 shell smokes. Today the entire shell suite is synchronized by hardcoded sleeps
   (A2) because its only condition-wait always returns instantly. Clearing `renderQuiescent` in
   `StatusChannel` when a render is scheduled is a two-line app change that converts ~238 class-3
   sleeps into real waits. Nothing else in this census has this leverage.

2. **`scripts/harness/HarnessSmoke.ts:313-316` — the surviving half of the #464 bug.** One wait, in
   a shared helper, on the **contention tier**. The `count === 0` branch was fixed and the
   `count > 0` branch was not, so any close that leaves a duplicate still hands back a pre-relayout
   frame. `awaitValue(statusPath, 'panelHost.orderedContents.length', measured - 1)`
   (`PanelHost.ts:780`). One-line shape, already proven by commit 97c89a44.

3. **`scripts/harness/smoke-panel-chrome-harness.ts:712-717` — the undiagnosed contention red.**
   Explains tonight's failure exactly, and the mechanism (model-to-paint skew widened by load) is
   the one contention is built to expose. Small, local, and it retires an open unknown.

4. **`scripts/harness/smoke-terminal-follow-harness.ts:788-792` — a vacuous negative arm behind
   seven call sites.** Every "the terminal action stays silent" pass in the follow-mode harness is
   currently unfalsifiable, so the contract the file exists to protect is unprotected. Rebuild the
   primitive as a hold-window over `agentPaneContent.agentSession.transcript.length`
   (`AppStatusProjection.ts:386`) and all seven call sites become real at once.

5. **`scripts/harness/PtyTestDriver.ts:412-439` — add the pre-satisfaction guard that already exists
   at `:277-282`.** This is the only fix that stops class 1 being *written again*. The sibling method
   refuses an already-true predicate with a clear error; exposing the same check on
   `awaitGridCondition` (opt-in per call, then ratcheted) converts a documented invariant
   (`harness.invariants.md:502-579`, shape (b)) into a mechanical one. 53 findings in this census are
   the same mistake made 53 times.

---

## FILES DENSE ENOUGH TO REWORK RATHER THAN PATCH

1. **`scripts/harness/smoke-terminal-follow-harness.ts`** — its negative primitive (:788-792) and
   `runExitedTerminalScenario` (:633-639) are structurally vacuous, and seven call sites depend on
   them. Patching one line does not fix it.
2. **`scripts/harness/smoke-git-watch-harness.ts`** (contention tier) — 181 lines, and three of its
   five real waits are pre-satisfied. Both headline claims ("clean repo, 0 changes"; "opening the
   symlink did not crash") are satisfiable by an app that never scanned or already died. Rebuild
   :116-168 around a graph liveness read and a scan-completion signal.
3. **`scripts/harness/smoke-agent-permissions-harness.ts`** — three pre-satisfied waits plus a bare
   row-text diff with no model wait, while the sibling pane-ux smoke already shows the right form.
   Small file, cheap to rewrite.
4. **`scripts/harness/smoke-agent-engine-switch-harness.ts`** — `submitTurn` (:130-140) is the file's
   only turn primitive and is pre-satisfied from turn two onward, so most downstream assertions read
   the previous turn's frames. Fix the primitive, not the call sites.
5. **Shell scripts that already have a TypeScript twin** — porting buys real waits and `GraphClient`
   access for less effort than repairing 20+ sleeps each: `smoke-scrollbars.sh` (412 lines, 11
   sleeps, 2 class-1 needles), `smoke-editor.sh` (307 lines, 21 sleeps, class-1 quit check),
   `smoke-selection.sh`, `smoke-agent-search.sh`, `smoke-search-mouse.sh`, `smoke-openproject.sh`,
   `smoke-workspace-tabs.sh`. `smoke-gutter-diff.sh:216` already records this drift in its own
   comment: the harness twin was swept and the shell copy was not, because it only runs under
   `INVAR_FULL_TMUX=1`.

Patch in place instead: `smoke-git-log.sh` (swap three pane greps for `gitLogTipSha`),
`smoke-git-watch.sh` (already field-driven), `smoke-tree-scroll.sh` (add the `activeBuffer` anchor),
`smoke-paste.sh` (offset the raw-log grep), `smoke-activitybar.sh` (fix the stale needle).

6. **`scripts/harness/smoke-terminal-harness.ts`, `smoke-terminal-backpressure-harness.ts`,
   `smoke-terminal-stage-harness.ts`** share one repeatable bug — waiting on a literal **the shell
   echoes back from the typed command**. Six sites. Worth writing into
   `scripts/harness/harness.invariants.md` as a named shape ("never wait on text your own input
   paints") before patching them.

---

# Batch 2 — previously deferred files

Same rules: read-only, no source file changed. Path roots and verbs as in batch 1, with one
correction learned since: **`renderQuiescent` is set true at `src/modules/system/StatusChannel.ts:97`
and is never reset to `false` anywhere in `src/`** (verified by grep: line 33 initial literal and
line 97 are its only two writes). Every wait keyed on `renderQuiescent === true` is therefore
class 1, permanently pre-satisfied after the first frame. That is now a known-defective idiom, not
a judgement call.

## B0. Correction to batch 1 — `renderQuiescent` sites I missed

A mechanical grep for the idiom found call sites inside files batch 1 had already reported on.
These are additions to the batch-1 counts, not new files.

- **`scripts/harness/smoke-inline-rewrite-harness.ts:204`, `:236`, `:322` — class 1, severe.**
  Bare `(status) => status.renderQuiescent === true`, with no other conjunct. Combined with the
  helper at `:115-129` (`idleOwnershipFailure` returns `null` when
  `status.renderQuiescent === true && …`), **the file's headline property — "the inline-rewrite
  plugin owns no render loop" — is unfalsifiable.** Only the request-count arm can ever fail. Line
  `:427` pairs the dead flag with a real `inlineRewriteRequestInFlight === true`, so that one
  degrades rather than dies. Highest-value single correction in this section.
- **`scripts/harness/smoke-scrollbars-harness.ts:550`, `:673` — class 1 (degraded, not dead).**
  `renderQuiescent === true && Number(candidate.frame) > Number(previous.frame)`. The
  `renderQuiescent` conjunct is inert; what remains is a **frame-ordinal wait**, which
  `harness.invariants.md:546-548` explicitly lists under *Rejected alternatives* ("Wait for frame N
  — repaint coalescing changes frame ordinals under load"). One dead idiom is hiding another.
- **`scripts/harness/Drive.ts:703` — class 1, shared machinery.** The drive settle predicate is
  `ready === true && renderQuiescent === true && Boolean(activeWorkspace) &&
  pendingSettledStatusNames(...).length === 0`. Post-boot the only live terms are the debounced-work
  registry and `activeWorkspace`, so **`Drive`'s settle has no paint gate at all** — it returns when
  the registry is empty, whatever the screen is doing. Every `Drive`-based smoke inherits this.
- `scripts/perf-baselines.sh:100` greps `'"renderQuiescent": true'` — same dead flag, measurement
  context rather than a gate.

## B1. Panel and layout set

### `scripts/harness/smoke-layout-harness.ts` — REWORK

- `:472, :486, :657, :673, :709, :753, :987, :1143, :1168, :1238` — **class 2, ten bare
  `awaitScreenChange()`**. Each waits for any changed frame, not the transition under test. Worse,
  when no frame is marked expected it degenerates to `flushObservedOutput()` and synchronizes
  nothing (`scripts/harness/PtyTestDriver.ts:381-386`) — which is exactly `:673`, the first
  statement of `assertSplitterStates`. Paths: `:472`/`:486` → `settingsPanel.open`
  (`src/modules/settings/SettingsPanel.ts:366`); `:657, :987, :1143, :1168, :1238` →
  `layoutSlotSizes` or `panelHost.visible`; `:709`/`:753` → the splitter geometry the surrounding
  code already reads from `status.splitterRegions`.
- `:1170-1185` and `:1240-1255` — **class 1, highest value in the file.**
  `awaitStatus('the Layout section publishes every driven descriptor before navigation',
  settingsSections.includes('Layout') && settingsLabels.includes(...))` issued right after
  `sendKeys('Control+,')`. The predicate never mentions `settingsOpen`, and the projection keeps the
  **last-published** `settingsLabels`/`settingsSections`, so a *previous* Settings session satisfies
  it and `revealSettingThroughSettings` then navigates with an index resolved against a stale
  descriptor list. Fix: `awaitValue(statusPath, 'settingsPanel.open', true)` first
  (`SettingsPanel.ts:366`).
- `:988-991` — class 1, the #464 idiom verbatim.
  `awaitGridCondition('layouts control remains at the right edge after a tree open',
  commandBarLayoutSwitcherPosition(snapshot) !== null)` — the control is painted both before and
  after the panel relayout, so the wait returns the stale frame. Wait on the changed `layoutSlotSizes`
  bottom-panel rectangle after `Control+j`.
- `:396-405`, `:423-430`, `:495-503`, `:534-541`, `:626-630`, `:955-960`, `:1155-1165` — class 1.
  Type/existence and domain checks the pre-action state already satisfies
  (`typeof settingsSelected === 'number'`; `alignmentCycle.includes(panelAlignment)` on a value that
  is always one of two members; `layoutSlot(status,'sidebar').width > 0` on a visible sidebar). Paths:
  `settingsPanel.selectedIndex` / `settingsPanel.descriptors.length` (`SettingsPanel.ts:369-373`).
- `:609`, `:613` — class 2. `awaitSnapshot(findText(commandTitle))` is satisfied by the **echo of the
  typed query** in the palette input, so `Enter` at `:616` can fire against an unfiltered list.
  `commands.open` / `commands.query` / `commands.filtered.length`
  (`src/modules/commands/CommandRegistry.ts:30-100`).
- Cross-checked clean: `:1386` (`rightDockWidth > 28` is false at issue; the default is 28,
  `src/modules/settings/Settings.ts:538`).

### `scripts/harness/smoke-activitybar-harness.ts` — PATCH

- `:254-262` — **class 1, `renderQuiescent` confirmed.**
  `ready === true && renderQuiescent === true && gitChangedCount === 0`. After the first frame the
  whole conjunct reduces to `ready === true`, since `gitChangedCount === 0` is also the pre-action
  state of a freshly committed fixture.
- `:867-872` — **class 1, fix first: this one makes a WRONG CLICK pass.**
  `awaitGridCondition('the right dock paints focusTarget for the structure-row drive',
  findText('focusTarget') !== null)`. `focus-sample.ts` was opened in the **editor** at `:803` and
  its text contains `focusTarget`, and `findText` returns the first match top-down
  (`scripts/harness/HarnessSnapshot.ts:61-67`), so the click at `:877` can land in the editor. The
  follow-up assertion (`focus === 'editor'`, `cursor.col === 16`) then passes for the wrong reason,
  because `focusTarget` begins at column 16 of that line. Fix: `findTextInRectangle` bounded by the
  right-dock slot.
- `:1024-1030` — class 1, also a wrong-click risk. `glyphRow('F') >= 0 && glyphRow('G') >= 0 &&
  glyphRow('X') >= 0` — all three glyphs are painted before and after the `Alt+Down` reorder at
  `:1015`, so `dragSourceRow`/`dragTargetRow` may be pre-reorder rows and the drag starts on the
  wrong item. Wait on the painted **order** instead, as `:1121-1126` already does correctly.
- `:804-810` — class 1. `structureStatus === 'ready' && Number(structureRows) > 0` is satisfied by
  the **previous** document's outline (`src/modules/structure/StructurePlugin.ts:381`). No model
  path: `structure` is not a `statusProjectionPorts` root — needs a structure port or a
  document-identity field beside `structureStatus`.
- `:88-97`, `:486-491`, `:580-587`, `:651-658`, `:1071-1074` — class 1. Existence gates and
  default-value gates (`settingsSelectedValue === 'off'` / `'right'` are the unmodified defaults;
  `accentCount(candidate) === 1` is always true while the bar is visible).
- `:116-119` — class 2, row-text proxy for the settings viewport window; no model path (needs a
  published first/last visible descriptor index).
- `:504-511` and `:613-614` — **ordering hazards, no wait at all.** Two chords sent back to back
  (`Control+Shift+s` then `Control+Shift+a`), and `Control+,` immediately followed by `Left` with no
  wait for `settingsOpen === true`, so the `Left` can be delivered to the previous owner.

### `scripts/harness/smoke-panel-split-harness.ts` — PATCH

- `:98`, `:286`, `:455` — class 1. Status-bar glyphs (`' ❯ '`, the terminal/agent icons) and the
  screen-wide `'╭ '`/`'╰ '` connector needle are painted from boot; each wait exists only to source
  click geometry. `:455` is byte-identical to the assertion at `:460-464`, so the proof is the
  wait's own pre-satisfaction.
- `:152`, `:190`, `:207` — class 2. `snapshot = tierDriver.snapshot()` immediately after a
  status-only `awaitStatus`, so `:212-232` can assert on the pre-transition frame. Add a settle
  boundary: `awaitValue(statusPath, 'panelHost.resolvedCells.length', 1)`
  (`src/modules/ui/PanelHost.ts:788`).
- `:484` — class 2. `awaitSnapshot(findText('AGENTKEY'))` as a stand-in for composer state.
- Cross-checked clean: `:138`, `:173` (the container close really raises `quitConfirmation`,
  `Bootstrap.ts:320-338`), `:182` (needle matches `Bootstrap.ts:332` exactly).

### `scripts/smoke-panel-split.sh` and `scripts/smoke-activitybar.sh` — RETIRE OR REWORK

- `smoke-panel-split.sh:49, 55, 59, 81, 95, 98, 118, 129` — class 1, eight instances of the dead
  `"$H" settle` (A1). Every `chk`/`f` read after each is a stale-frame read. This is the file's
  entire synchronization strategy.
- `smoke-panel-split.sh:55`, `:98` — class 3. `sleep 0.6; "$H" settle` — with `settle` dead these
  two sleeps are the only real delay in the script.
- `smoke-panel-split.sh:73` — class 4 (non-discriminating, not stale). `grep -qF "❯"` claimed as
  proof the left cell shows the agent composer, but the same glyph is the status-bar terminal button.
- `smoke-panel-split.sh:91-93` — latent arithmetic bug.
  `panel_row=$(( panel_list_top + panel_list_height / 2 ))` reads `panelListGeometry.height`, which
  is `0` whenever the list is hidden (`src/modules/ui/RootView.ts:2665-2667`), collapsing the click
  row onto the list top.
- `smoke-activitybar.sh:35` — class 1 + class 3 in one line, ten call sites.
  `settle() { sleep 0.35; "$harness" settle … ; }` — the `settle` half is dead, so a **fixed 0.35 s
  sleep** is the script's only synchronization. `:47` `send_kitty()` adds a fixed `sleep 0.3` after
  every chord.
- `smoke-activitybar.sh:155`, `:177` — **class 4 confirmed** (this is the needle I verified in
  batch 1). `:143` — class 4 non-discriminating: the three-letter needle `'Git'` is satisfied by the
  Extensions list row `[x] Git`.

## B2. Overlay, markdown and tasks set

### `scripts/harness/smoke-overlay-dialog-harness.ts` — REWORK FOUR HELPERS, PATCH THE REST

Its ~20 class-1 waits are not 20 independent mistakes; they collapse into five sites.

- `:83-86` (`clickStatusMarker`) — class 1. `rowText(rows-1).includes(marker)` where the status row
  paints `?`, `❯`, `✦` continuously. The two hottest call sites are **`:1185` immediately after
  `driver.resize(120,40)`** and **`:1212` after `driver.resize(54,12)`** — the marker column has
  moved and the click lands on the old column. Gate on the published resize first:
  `awaitStatus(width === 120 && height === 40)` (`Bootstrap.ts:3294`), then re-measure.
- `:113-154` (`focusPanelBeforeOpeningDialog`) — class 1. `panelFocused === true &&
  panelActiveContentKind === kind`; the terminal caller already proved `terminalFocused === true` at
  `:1380`, which **implies** `panelHost.focused` (`AppStatusProjection.ts:268-271`), so the click at
  `:143` is unobserved. `panelHost.focused` (`:267`) via `awaitTransition` — this is a "became
  focused" question.
- `:244-303` (`requireEverySettingsNavigationStepRevealed`) — class 1. No gesture precedes it and
  Settings is open with selection 0 at both call sites; at `:1103` it is issued after
  `resize(54,12)` and can return the pre-resize status, so the viewport extents at `:286-295` are
  measured against the old geometry.
- `:335-438` (`requireWheelScrollsOverlay`) — class 1 + class 2. The entry predicate
  (`dialogBounds !== null && contentRows > viewportRows && scrollPosition === 0`) is true at every
  call site, and the wheel is then synchronized by a row-text diff (`:392-436`).
- Seven "X remains visible/available" re-anchors — `:815-818`, `:859-867`, `:1707-1710`,
  `:1741-1745`, `:1762-1765`, `:1801-1804`, `:1814-1818` — class 1, the landed-fix shape: each names
  a marker painted both before and after the relayout, hands back the stale frame, and the next
  click lands on the old row. Use a measured model count first, exactly as
  `smoke-panel-chrome-harness.ts:1053-1061` now does. Paths: `boundedListPopup.open`
  (`AppStatusProjection.ts:203`), `panelHost.orderedContents.length` (`PanelHost.ts:780`),
  `primaryDockHost.visible` / `rightDockHost.visible` (`AppStatusProjection.ts:330-332`).
- `:421-425` — class 1, degenerate: `awaitStatusPublication(..., () => true)`.
- `:1382-1389` — class 1. `cursorVisibilityFromOutput` scans the **whole** recorded output for the
  last show/hide sequence, and the editor-focused pre-state already ends in `\x1b[?25h`. (The later
  hidden→shown probes at `:1409`, `:1445` are genuinely false-before and are fine.)
- `:1652-1656`, `:1679-1688`, `:580-589`, `:365-368`, `:1104-1109`, `:1339-1344` — class 1, same
  family (unscoped close glyph; already-open buffers; already-painted anchors).
- `:1309` — class 2. `awaitScreenChange()` after `resize(100,32)`; use the published size, the
  pattern `smoke-markdown-harness.ts:923-935` already uses.

**Structural blocker, worth recording:** overlay bounds, extents and scroll positions all reach the
harness through `view.*()` **methods** (`AppStatusProjection.ts:105`), which the graph serializes as
`<function>`. Until the view port exposes Ref-shaped overlay geometry, this file cannot move onto
`awaitValue` for the conditions that matter most.

### `scripts/harness/smoke-markdown-harness.ts` — PATCH

- `:711-717` — class 1. `Number(status.treeRows) > 1` after `Enter` on the `notes` folder, but the
  fixture root already holds `notes/` **and** `upward-target.ts` (`:668-672`), so the tree has 2 rows
  before the expand and the following `Down` + `Enter` can act on an unexpanded tree. No model path
  (contributed field) — compare against a measured baseline.
- `:1474-1481`, `:1513-1520`, `:2660-2667`, `:2694-2701` — class 1.
  `workspaceScrollMomentumAtRest === true && contributedSurfaceAnimationAtRest === true`: "at rest"
  is the **idle** value, true before the wheel impulses, so a status file written between two
  impulses satisfies it and the "settled" totals at `:1482-1488` can be mid-gesture. Correct shape:
  observe not-at-rest first (`awaitTransition`), then at-rest.
- `:457-464`, `:2590-2595`, `:1837-1842`, `:2362-2367`, `:2507-2514` — class 1 existence checks
  (`typeof settingsSelectedLabel === 'string'` is permanently true — the projection returns `?? ''`,
  `AppStatusProjection.ts:245-250`).
- `:936-942`, `:1539-1545` — class 1. The `candidate.columns === 120 && candidate.rows === 40`
  clauses are inert because the emulator resizes client-side on `driver.resize`; what remains was
  true before.
- `:972-975`, `:953-963`, `:1178-1191`, `:2259-2263` — class 1 measurement gates.
- `:2103-2115` — class 1. The hover anchor `markdownHoveredReference endsWith '/target.ts'` was
  already asserted at `:2060` and nothing provably clears it. This is a genuine "became" question,
  but the field is a plugin contribution — no model path; capture `null` first.
- `:2163-2167` — class 2, a duplicate screen echo of a model fact already asserted at `:2150-2157`.
- Six unsynchronized measurement reads (`driver.snapshot()` / `readStatus` with no wait):
  `:1438`, `:1454`, `:1491-1493`, `:2053`, `:2233-2237`, `:2504-2506`, `:2676`.
- **Shared helper, affects three call sites here (`:1039`, `:1535`, `:1709`):**
  `HarnessSmoke.concealAutoRevealedRightDock` (`scripts/harness/HarnessSmoke.ts:172-177`) opens with
  `awaitStatus(rightDockVisible === true)`. When the dock is already visible that wait is
  pre-satisfied and the `Control+Alt+b` fires on a stale observation — **precisely the race its own
  comment claims to prevent.** `rightDockHost.visible` (`AppStatusProjection.ts:332`) with
  `awaitTransition(true)`.

### `scripts/harness/smoke-markdown-view-mode-harness.ts` — PATCH

- `:220-226` and `:187-195` — class 1. `markdownParsing === false` is the **idle** value pushed only
  while a parse runs (`src/modules/markdown/MarkdownDocument.ts:69,133`), so `false` is true before
  the next file's parse starts and nothing binds the condition to that file's revision. Fix by
  binding to `markdownRevision === bufferRevision`, the pattern this repo already uses at
  `smoke-markdown-harness.ts:1714-1719`.
- `:178-185` — class 1. "closing Alpha removes its tab" tests `openBuffers`, which the projection
  defines as the **single active path** (`editor.hasDocument ? [document.path] : []`,
  `AppStatusProjection.ts:97`), so any active-buffer change satisfies it, close or not.
  `workspaceSet.active.buffers.count` (`AppStatusProjection.ts:262`), measured minus one.
- `:240-246` — class 1. `Number(status.bufferRevision) > 1` is a magic constant, not a measured
  baseline; a freshly opened buffer can already exceed it.
- `:148-156` — class 5. Rides a single frame boundary between `sendRawInput('x')` and the toggle; a
  blink by construction that will not survive a change in frame batching.
- Contrast, leave alone: `:312-323` guards the same `parsing === false` with
  `markdownPreviewContentRows > 0`, which **is** false before.

### `scripts/harness/smoke-tasks-dashboard-harness.ts` — PATCH

- `:512-517` — class 1. `Number(status.tasksAnimationPaint) >= 3` where motion has run since the
  pane opened at `:418`, roughly 90 lines of driving earlier. The label says "advances its clock"
  but nothing observes an advance. The same file does it **correctly** at `:1233-1243` with a
  measured baseline + 3.
- `:743-747` — class 1. `awaitFrameDump(tabBackgroundLane(candidate,'ACTIVE') !== null)`: the ACTIVE
  tab label is painted in every lens, so the dark-theme baseline can be captured from a frame in
  which ACTIVE was not selected — which is the very property `:749-754` then asserts. (The
  light-theme counterpart at `:777-787` is written correctly: it requires a lane *different* from
  the dark one.)
- `:910-917` — class 1. `Down` then `tasksSelectedFile endsWith 'task-901-planted-building.md'`;
  #901 is the first live row, so if the default selection is row 0 the keystroke is unobserved.
- `:670-673`, `:630-635`, `:457-463` — class 1, already-painted rows and an already-`null` gate exit
  code.
- Four unsynchronized snapshot reads: `:580-586`, `:641-647`, `:815-817`, **`:846-848`** — the last
  is sharpest: it reads `findText('■')` immediately after `tasksCycling === true`, before the control
  can repaint, and then throws "The cycle stop control disappeared after start".
- `:839-845` — class 5. `tasksLens === 'live'` while the overview auto-cycles on a 2 s interval; the
  file concedes this at `:894`. No graph path (plugin contribution), so `awaitTransition` cannot help.

### `scripts/smoke-markdown.sh` — RETIRE, DO NOT PATCH

Every synchronization point is defective: **6 dead `settle` calls** (`:99, :118, :163, :177, :190,
:252`, helper at `:38`), **21 fixed sleeps** (`:98, :114, :117, :127, :138, :146, :162, :176, :187,
:189, :208, :210, :212, :214, :223, :234, :245, :251` — the 1.2 s at `:212` is load-bearing
autoscroll timing and the 1.0 s at `:234` gates a paste revision read), plus screen probes parsed out
of a frame-dump JSON by inline python. Its contract is already covered, and covered better, by
`smoke-markdown-harness.ts`.

### `scripts/harness/smoke-tasks-harness.ts` and `scripts/smoke-tasks-dashboard.sh` — CLEAN

`smoke-tasks-harness.ts` has **no class-1 findings** and is the model to copy: a fresh driver per
arm with a fresh status path, measured baselines, and screen oracles reserved for child-process
bytes (`VSCODE_LEFT:WORKSPACE_MATCH`, `EXACT_CLAUDE_INNER`, `BUILTIN_FRESH:`) that genuinely have no
model representation. `smoke-tasks-dashboard.sh` is a seven-line `exec bun` launcher with no waits.

## B3. Editor, popup and settings set

### `scripts/harness/smoke-settings-applied-harness.ts` — REWORK

Its defects are one wrong idiom instantiated five times, not scattered mistakes.

- `:219-223`, `:411-414`, `:462-465` — **class 1, the real flake source.**
  `... && status.workspaceScrollMomentumAtRest === true`. "At rest" is TRUE before the gesture, so on
  the first frame where the impulse has landed but the glide has not yet flipped the flag the whole
  predicate passes with `rowsTravelled === 0` — and the caller at `:716-722` then asserts
  `rowsTravelled >= 1`. An "is X" question where "became X" is meant.
- `:210-225`, `:403-416`, `:455-467` — class 2. `awaitSettledPublishedNumber` and friends evaluate a
  **status-file read inside `awaitGridCondition`**, so the model answer is gated on a repaint that
  may never come once the glide stops. Wrong instrument for a model question.
- `:175`, `:251`, `:314`, `:373-376`, `:437-440`, `:784-787` — class 1, six pure existence
  predicates, each a baseline capture wearing a wait's clothes. Replace with
  `GraphClient.Class.query(statusPath, 'workspaceSet.active.editor.viewport.scrollTop', 'settle')` /
  `.scrollLeft` (`AppStatusProjection.ts:177`, `:181`).
- `:161` — class 3. `Bun.sleep(100)` as retry spacing in `openOnlyFile`, standing in for "the tree
  probably advanced".
- `:1108-1112` — weak needle, not stale: `findText('init')` matches any word containing "init".

The rework is a single settle-boundary "gesture reached rest" helper —
`awaitTransition(momentum → false)` then `awaitValue(momentum → true)` — with offsets read through
`workspaceSet.active.editor.viewport.scrollTop`/`.scrollLeft`. The `Bun.sleep(100)` disappears with it.

### `scripts/harness/smoke-editor-harness.ts` — PATCH, but fix `:270` first

- **`:270` — class 1, the strongest finding in the file.** `(status) => Boolean(status.mouse)`.
  `lastMouse` is assigned at `Bootstrap.ts:3192` and **never reset**, and the projection publishes it
  every frame (`AppStatusProjection.ts:68`). The drag at `:225-231` already set it, so the wait after
  the click at `:267` is permanently pre-satisfied and returns a pre-click frame. No boolean path —
  needs a mouse-event sequence number, or await the click's own effect
  (`workspaceSet.active.editor.cursor.line`, `AppStatusProjection.ts:85`).
- `:86`, `:111`, `:185`, `:359`, `:600` — class 1 existence checks. `:185`
  (`typeof undoStatus.dirty === 'boolean'`) is load-bearing: it sits at the top of the `Control+Z`
  retry loop, so a stale frame fires another undo.
- `:79, :81, :90, :92, :107, :189, :297, :351, :445, :447, :505, :649, :669` — class 2, thirteen
  bare `awaitScreenChange()`. Paths where they exist: `cursor.col` / `cursor.line` (`:85`),
  `document.dirty` (`:83`), `viewport.scrollLeft` (`:181`), `cursor.hasSelection` (`:96`),
  `treeSelected` (`src/modules/ui/FileTreeContributor.ts:230`). `:649` and `:669` are simply dead —
  the named waits at `:660` and `:671` already cover both outcomes, and `:649` can absorb the
  confirmation-prompt frame.
- `:390-400` — deliberately pre-satisfied ("an already-satisfied clamp is a no-op wait"), sanctioned
  by `harness.invariants.md:532-533`. Listed for completeness; no change wanted.
- `:682` — `Bun.sleep(3_000)` inside `Promise.race` with `exitCode()` is a deadline on a real event.
  **Not a defect** (revises the batch-1 flag on this line).

### `scripts/harness/smoke-tree-scroll-harness.ts` — PATCH

- `:95`, `:151`, `:375` — **class 1, `renderQuiescent` confirmed defective** at all three sites.
  Each wait degenerates to its `treeRows` conjunct, which is the real condition
  (`FileTreeContributor.ts:229`). Drop the dead conjunct.
- **`:288-291` — class 1.** `(candidate) => candidate.findText('x') !== null`. `'x'` is a substring
  of `.txt`, so **every** tree row `file-NN.txt` already satisfies it before the click at `:252`. A
  fully pre-satisfied whole-grid needle.
- `:415-421` — class 1. The reveal glyph is painted continuously (already asserted at `:378`), so
  the wait observes nothing about Quick Open closing. `quickOpen.open`
  (`AppStatusProjection.ts:466`).
- `:267-269` — class 1 (weak). `typeof activeBuffer === 'string' && length > 0` names no buffer, so
  any pre-opened buffer satisfies it.
- `:228-231` — class 2. The 80-event wheel train ends on `findText('file-60.txt')`, a row-text proxy
  for scroll offset; `treeScrollTop` (`FileTreeContributor.ts:231`) is already used at `:234`.

### `scripts/harness/smoke-workspace-tabs-harness.ts` — PATCH

- **Stale-geometry cluster, class 2, seven sites:** `snapshot = driver.snapshot()` immediately
  followed by `clickMarker` at `:593`, `:627`, `:734`, `:748`, `:784`, `:823`, `:856`. Every click
  uses coordinates from an unwaited, possibly pre-relayout frame — the #464 shape.
- `:173`, `:206`, `:825`, `:874`, `:910` — class 2, five bare `awaitScreenChange()`. Paths:
  `tooltip.visible` (`AppStatusProjection.ts:512`), `settings.workspaceTabPosition` (`:441`).
- `:826-841` — class 5. `gitWatcherActivationCompleted === false` is true before the tab click and
  true again once the walk ends; the `false` window is the activation interval only, and the
  `awaitScreenChange()` at `:825` makes the sampling point arbitrary.
- `:552-557` — class 1. A **negative** assertion on an instantaneous unsynchronized snapshot; passes
  vacuously on any early frame.
- `:875` — class 1. Escape closes Settings with no close wait before the next `Control+,` at `:904`.
- `:930-934` — class 1 existence check.

### `scripts/harness/smoke-code-folding-harness.ts` — PATCH (otherwise exemplary)

- **`:264` — class 1 / missing wait, highest value here.** `sendKeys('Escape')` closes Settings with
  no wait, and `:276` presses `Control+,` again. If the Escape has not landed, `Control+,` toggles
  Settings **shut** and the wait at `:277` (`settingsSelectedLabel === 'Code folding'`) is satisfied
  by the stale open-panel frame. Same shape at `:291` → `:381`. `settingsPanel.open`
  (`AppStatusProjection.ts:483`).
- `:265-271` — class 1. The grid condition after that Escape was already true at `:257-263`.
- `:351-354` — class 2. `findText('Find') !== null` is a whole-grid literal for a modal with a model
  fact: `findBar.open` (`AppStatusProjection.ts:462`).
- No sleeps, no `awaitScreenChange`; every other gesture pairs a status condition with a grid
  condition.

### `scripts/harness/smoke-pixel-preview-harness.ts` — PATCH

- **`:669-672` — class 1.** `'Settings remains painted after resize'` — Settings was already painted
  before `driver.resize(96, 30)` at `:668`, so the wait returns the pre-resize frame and the 100 ms
  "no placement" observation at `:673` can run entirely before the app has processed the resize.
- `:673-679` (helper at `:168-188`) — **class 3.** `requireOutputSequenceCountRemainsUnchangedFor(…,
  100, …)`: a fixed 100 ms wall-clock window used to prove a **negative**, so under load the app can
  simply be slower than the window and the assertion passes for the wrong reason. Bound it to
  observed frames instead.
- `:610-615` — class 1, a pure duplicate of the `awaitImageStatus` at `:609`.
- `:106-108`, `:777-780` — class 1 baseline reads; `:777` supplies click coordinates.
- `:145`, `:163` — 10 ms poll intervals inside deadline loops. **Acceptable — not defects**
  (revises the batch-1 flag on `:145`/`:163`; `:182` is the same shape).

### `scripts/harness/smoke-bounded-list-popup-harness.ts` — PATCH (best-instrumented of the ten)

- `:395-399` — class 1. `findText(themedSearchGlyph) !== null && findText('file-001.txt') !== null`:
  `file-001.txt` is a tree row already required painted at `:309-314`, so half the predicate is
  pre-satisfied and the wait does not prove the popup list rendered.
- `:585-588`, `:631-634` — class 1. The buffer badge is painted continuously, so both return the
  current frame without observing the preceding `Enter`/click — and geometry is measured from it.
  Precede with `boundedListPopup.open === false` (`src/modules/ui/BoundedListPopup.ts:91-140`).
- `:321-327` — class 1 existence gate.
- `:523-529` — class 2, popup-viewport text diff where `boundedListPopup.geometry` exists.

### `scripts/harness/smoke-completion-harness.ts` — PATCH (no sleeps, no `awaitScreenChange`)

- `:446-448`, `:467`, `:622-624`, `:634-636` — class 1. Four raw
  `HarnessSmoke.Class.readStatus(statusPath)` baselines. A direct file read has **no settle
  guarantee**, so the baseline can predate the last completed gesture and the following `> baseline`
  waits are satisfiable by the earlier edit. Use
  `GraphClient.Class.query(..., 'workspaceSet.active.editor.document.revision', 'settle')`
  (`AppStatusProjection.ts:82`).
- `:440-445`, `:638-644` — class 1 (mild), guarded by a revision or request-count assertion behind
  them.

### `scripts/harness/smoke-field-caret-harness.ts` — PATCH

- **`:555-565` — class 1.** `sendKeys('Down')` then
  `Number(candidate.boundedListPopupSelected) >= 0`. `selectedIndex` is already `0` before the key
  (`AppStatusProjection.ts:205`), so the wait is pre-satisfied and the `requireCondition` at `:562`
  re-asserts the same trivially-true thing — **the claim "Down moves the selection instead of the
  caret" is not tested at all.** Capture `boundedListPopup.selectedIndex` before the key and
  `awaitValue` the increment, plus `boundedListPopup.queryCaret` unchanged.
- `:502-513`, `:464-469`, `:222-228` — class 1, milder (identical-geometry re-check, baseline read,
  intentional static claim).
- Verified clean against expectation: `:254-259` `lastCopyChars === 0` is **not** pre-satisfied —
  the field is absent from the initial status state (`StatusChannel.ts:29-51`) and is written only by
  `publishCopyResult` (`Bootstrap.ts:2126-2139`), so `undefined === 0` is false until a real copy
  publishes zero.

### `scripts/harness/smoke-navigation-history-harness.ts` — PATCH

- `:181` — class 2, dead pause: the cursor fact was already awaited at `:174-179`.
- `:72` — class 4 risk, not stale today. `const projectMarker = \` ⌕ ${basename(fixtureRoot)}\``
  hardcodes the unicode search glyph, but `ThemeIcons` also defines `\u{f002}` (nerd) and `/` (ascii)
  at `src/modules/theme/ThemeIcons.ts:706-722` and this driver sets no `LANG`. Resolve it through
  `ThemeIcons.Class.findIconsFor('unicode').search`, as the bounded-popup smoke already does.

## B4. Remaining smaller harnesses

### `smoke-clipboard-frame-boundary-harness.ts` and `smoke-paste-harness.ts` — REWORK BOTH

Between them they hold 13 of this batch's proxy waits and 10 of its pre-satisfied ones, and the
defects are structural: **both drive a real shell and then synchronize on the SCREEN, which the
shell echoes back.**

- Clipboard `:295`, `:404`, `:424`, `:426`, `:434`, `:469`, `:471` — class 2, seven
  `awaitScreenChange()`. `:404` and `:434` are also class 1 in substance (the shell echoes the typed
  bytes, so the next frame satisfies them regardless of readline state). `:295` has a path:
  `agentPaneContent.agentSession.transcript.length` (`AppStatusProjection.ts:386-389`).
- Clipboard `:196`, `:254`, `:399` — class 1 existence checks.
- Paste `:197`, `:209`, `:287`, `:430`, `:481` — class 2, every one
  `sendKeys('Control+c'); await driver.awaitScreenChange();` as a stand-in for "readline is back at a
  fresh prompt". `:229` is the same inside the 1 KiB / 64 KiB chunk loop; the only real proof there
  is the `wc -c` marker awaited at `:232`.
- **Paste `:436` / `:440` — class 1, the sharpest in the pair.**
  `typeof status.layoutSlots === 'object' && … && typeof status.height === 'number'` with **no
  transition clause at all** — the wait cannot fail and cannot wait, and it returns whatever geometry
  the current frame holds. Exactly the stale-geometry failure the panel-chrome fix cured.
- Paste `:118`, `:140`, `:510`, `:315`, `:389` — class 1 existence/type predicates.
- Paste `:72` — class 3, `Bun.sleep(1)` between 997-byte chunks, a timing assumption about PTY write
  coalescing.

**The missing instrument is the same in both:** there is no projected terminal readline state
(prompt-ready, line-buffer content, selection-active) in `AppStatusProjection.ts`;
`TerminalPaneContent.hasSelection()` is a **method** (`src/modules/terminal/TerminalPaneContent.ts:401`),
not a projected property. One terminal-readline projection through `terminalPaneContent` would
retire roughly a dozen findings at once. Without it, most of these waits have no honest replacement.

### Other files in this group

- **`smoke-mode-coherence-harness.ts:70-73` — class 3, the one wait in the whole census whose flake
  produces a WRONG FAILURE rather than a stale read.**
  `await Promise.race([driver.exitCode().then(() => 'exited'), Bun.sleep(3_000).then(() => 'timeout')])`
  then asserts `exitResult === 'exited'`. A fixed 3 s is the pass/fail boundary for process
  teardown, so under gate contention a healthy quit taking 3.1 s reports a false reserved-chord
  regression. Raise to 15-20 s to match the other harnesses; the assertion's meaning does not change,
  only its tolerance. `:187` is a separate class-1 baseline read.
- `smoke-tabs-harness.ts:216` — class 2 (`awaitScreenChange` in the rewind loop while the loop's own
  exit test reads `activeBufferIndex`, `AppStatusProjection.ts:264`); `:84-85`, `:152`, `:212`,
  `:221` — class 1 existence checks. The real waits at `:157`/`:164` are correct.
- `smoke-openproject-harness.ts:79-81` and `smoke-text-input-harness.ts:292-295` — class 1,
  byte-identical defect: `sendText('Open Folder')` then
  `awaitSnapshot(s => s.findText('Open Folder') !== null)`. **The palette echoes the typed query into
  its own input**, so the text is on screen from the keystroke, before any filtering, and `Enter`
  can fire against an unfiltered list. `commands.query` / `commands.filtered.length`
  (`AppStatusProjection.ts:139-141`).
- `smoke-breadcrumb-harness.ts:328` — class 2, same echo problem in Quick Open;
  `quickOpen.query` (`AppStatusProjection.ts:121`). `:356-359` — class 1 dead conjunct.
- `smoke-comment-styling-harness.ts:78` — class 2, redundant `awaitScreenChange` ahead of a correct
  model wait at `:79`; delete it. `:288` — class 2, `Down` loop advanced by any repaint.
- `smoke-selection-harness.ts:209`, `:284` — class 2. A chord moves **focus**; a repaint is not
  focus, and if the following `Down` lands early it goes to the editor and the assertion fails
  opaquely. `workspaceSet.active.focus` / `primaryDockHost.activeId` (`AppStatusProjection.ts:165-169`).
- Single-site class 2: `smoke-hover-harness.ts:136` (can consume the move's own repaint and start
  the dwell clock late), `smoke-move-line-harness.ts:93`, `smoke-wrap-harness.ts:367`.
- Single-site class 1 baseline reads: `smoke-diff-overview-harness.ts:389`,
  `smoke-search-mouse-harness.ts:261`, `smoke-word-delete-harness.ts:63`,
  `smoke-voice-picker-harness.ts:161`, `smoke-quickopen-harness.ts:223` (tautological assertion, not
  a wait — reports coverage it does not have).
- **Clean, no flake-prone wait found (20 files):** `smoke-media`, `smoke-shortcut-help`,
  `smoke-goto-definition`, `smoke-database`, `smoke-horizontal-extent`, `smoke-git-blame`,
  `smoke-diagnostics`, `smoke-git-log`, `smoke-find`, `smoke-audio-narration`, `smoke-image-preview`,
  `smoke-bracket-match`, `smoke-sdk-extraction`, `smoke-go-to-line`, `smoke-reserved-chord`,
  `smoke-indent-guides`, `smoke-quit-confirmation`, `smoke-workspace-layout-isolation`,
  `smoke-gutter-diff` (its `Bun.sleep(10)` at `:194` is a documented disk-poll interval — a prior fix,
  correct), `smoke-dirty-marker` (`Bun.sleep(10)` at `:67` is a disk poll interval).

---

## Batch 2 counts per class

| Class | Batch 2 | Where |
|---|---|---|
| 1 — pre-satisfied | **159** | overlay/markdown/tasks 59 · editor/popup/settings 38 · panel/layout 31 · remaining-24 group 24 · batch-1 `renderQuiescent` corrections 7 |
| 2 — proxy | **68** | editor/popup/settings 28 · remaining-24 group 22 · panel/layout 15 · overlay/markdown/tasks 3 |
| 3 — sleep as sync | **31** | overlay/markdown/tasks 22 (21 in `smoke-markdown.sh` + 1 inherited per keystroke) · panel/layout 4 · remaining-24 group 3 · editor/popup/settings 2 |
| 4 — stale needle | **4** | `smoke-activitybar.sh:155`, `:177` (confirmed stale); `:143` and `smoke-panel-split.sh:73` (non-discriminating). Two further weak needles flagged, not counted |
| 5 — transient/blink | **3** | `smoke-workspace-tabs:826` · `smoke-tasks-dashboard:839` · `smoke-markdown-view-mode:148` |
| Other | **2** | ordering hazards with no wait at all (`smoke-activitybar-harness.ts:504-511`, `:613-614`) |

Two batch-1 flags are **revised to non-defects** by this pass: `smoke-editor-harness.ts:682` and
`smoke-pixel-preview-harness.ts:145`/`:163` are deadlines and poll intervals, not synchronization.

## Combined totals — batch 1 + batch 2

| Class | Batch 1 | Batch 2 | Total |
|---|---|---|---|
| 1 — pre-satisfied | 53 | 159 | **212** |
| 2 — proxy | 22 | 68 | **90** |
| 3 — sleep as sync | ~258 | 31 | **~289** |
| 4 — stale needle | 2 | 4 | **6** |
| 5 — transient/blink | 13 | 3 | **16** |
| Other | 6 | 2 | **8** |

## Revised top 5 across the whole census

1. **`scripts/tui-harness.sh:101-113`** — `settle` is a permanent no-op; 236 dead call sites and
   ~238 fixed sleeps standing in for it. Unchanged from batch 1, still the highest leverage.
2. **`scripts/harness/PtyTestDriver.ts:412-439`** — add the pre-satisfaction guard that already
   exists at `:277-282`. **212 class-1 findings are the same mistake made 212 times**; this is the
   only fix that stops the 213th.
3. **`scripts/harness/smoke-inline-rewrite-harness.ts:115-129, 204, 236, 322`** *(new)* — the file's
   headline property, "the plugin owns no render loop", is unfalsifiable because its only render
   evidence is the permanently-true `renderQuiescent`. A whole smoke asserting nothing.
4. **`scripts/harness/HarnessSmoke.ts:313-316` and `:172-177`** — two shared helpers, both
   pre-satisfied: the surviving half of #464 (contention tier) and
   `concealAutoRevealedRightDock`, which races the very policy its comment says it prevents.
5. **`scripts/harness/Drive.ts:703`** *(new)* — `Drive`'s settle has **no paint gate**: post-boot it
   returns when the debounced-work registry empties, whatever the screen is doing. Every
   `Drive`-based smoke inherits it, and it is invisible because the dead conjunct reads like one.

Runner-up worth naming because its failure mode is inverted:
**`smoke-mode-coherence-harness.ts:70-73`** is the only finding in the census that produces a
**false RED** rather than a false green — a 3 s fixed race against process teardown, on a gate that
runs under contention.

## FINAL COVERAGE

**Audited: 75 of 77 files.**

- Batch 1 — 43 files: shared machinery (`PtyTestDriver.ts`, `HarnessSmoke.ts`, `Drive.ts`,
  `tui-harness.sh`, `StatusChannel.ts`), the contention scrollbars and git-watch harnesses, the 13
  agent/terminal harnesses, 36 `scripts/smoke-*.sh`, and the named block of
  `smoke-panel-chrome-harness.ts`.
- Batch 2 — 32 further files: the panel/layout set (3 harnesses + 2 shell), the overlay/markdown/
  tasks set (5 harnesses + 2 shell), the editor/popup/settings set (10 harnesses), and the 37
  remaining smaller harnesses (20 of which are clean).

**Still deferred: 2 files — `scripts/harness/smoke-plugin-manifest-harness.ts` and
`scripts/smoke-plugin-manifest.sh`.** This is the **CONTENTION TIER** entry
(`contention_smoke "contention: plugin-manifest lifecycle"`, `scripts/merge-gate.sh:1255`) and the
single largest unaudited risk in the suite: 49 `awaitGridCondition`, 119 `awaitStatus`, 4 bare
`awaitScreenChange()`, 3 existence predicates, and three bare `Bun.sleep(500)` at lines 646, 750 and
900. Its audit was dispatched twice and did not return in time; nothing in this report should be
read as a statement about it.

Also unaudited by deliberate scope: `scripts/harness/*.test.ts` (unit tests, not gate smokes) and
the `measure-*` / `stress-*` instruments.

---

## Batch 2 — plugin-manifest (contention tier)

Audited in full and read directly: `scripts/harness/smoke-plugin-manifest-harness.ts` (2070 lines)
and `scripts/smoke-plugin-manifest.sh` (7 lines).

`scripts/smoke-plugin-manifest.sh` — **zero findings**. It is `set -uo pipefail`, a path resolve,
and `exec bun scripts/harness/smoke-plugin-manifest-harness.ts`. No wait, no sleep, no needle. It
does NOT source `scripts/tui-harness.sh`, so census finding A1 (the `settle` helper) does not
reach this tier through it.

Enabling fact for every class-1 entry below: `PtyTestDriver.awaitGridCondition`
(`scripts/harness/PtyTestDriver.ts:412-425`) evaluates the predicate against the CURRENT snapshot
before any wait and returns it if true. It has no pre-satisfaction guard, unlike its sibling
`sendKeysAndAwaitGridConditionByteArrival` (`:277-282`), which refuses an already-true predicate.

Model paths cited below, with evidence:
`settingsPanel.open` (`src/modules/settings/SettingsPanel.ts:366`),
`settingsPanel.selectedIndex` (`:369`),
`primaryDockHost.activeId` (`src/modules/ui/PanelHost.ts:60`; `primaryDockHost` is a
`PanelHost.Class`, `src/modules/app/Bootstrap.ts:397`, and is a graph root, `Bootstrap.ts:1419`),
`primaryDockHost.focused` (`PanelHost.ts:52`),
`panelHost.orderedContents` (`PanelHost.ts:780`), `panelHost.visible` (`PanelHost.ts:48`),
`panelHost.activeId` (`PanelHost.ts:60`).
The Extensions pane id is `'extensions'` (`src/modules/plugins/ExtensionsPaneContent.ts:32`).

### Class 1 — pre-satisfied wait (14)

**B2-1. `smoke-plugin-manifest-harness.ts:548-551` — the highest-value finding in this batch.**
```ts
driver.sendKeys('Control+Shift+x');
await driver.awaitGridCondition(
  'the later Extensions action proves the inert gestures and hover left the app live',
  (snapshot) => snapshot.findText('› [ ] Language Intelligence') !== null,
);
```
Language Intelligence was uninstalled at `:507` and its row has been the selected row ever since;
`:519` moved FOCUS to the editor but left the Extensions pane painted, so `› [ ] Language
Intelligence` is already on screen when this wait is issued. The wait returns the pre-input frame.
This is the file's stated POSITIVE CONTROL for the inert-gesture arm — it is the only thing
sequencing the completion, go-to-definition and hover gestures at `:536-546` before the assertion
at `:552-561` reads the status file synchronously. The control cannot fail, so the whole
"gestures stay inert" claim is unfalsifiable, and under contention the assertion samples status
from before the app even processed the gestures.
Proposal: `await GraphClient.Class.awaitValue(statusPath, 'primaryDockHost.activeId',
'extensions')` re-establishes the pane, and the inert-gesture arm needs a real positive control:
send one gesture that MUST move a graph value and await it, then assert the inert ones.

**B2-2. `:273-278`** — `awaitGridCondition('the File Tree heading is painted above its contributed
setting', findText('File Tree') && findText('Show hidden files'))`. `selectSetting` at `:272`
already awaited `› Show hidden files` on the grid (`:85-88`), and `File Tree` is a section heading
painted before and after. Both terms are true at issue.
Proposal: no wait belongs here. The stated property is ADJACENCY, which no `findText` pair tests —
assert `snapshot.findText('File Tree').row < snapshot.findText('Show hidden files').row` on the
snapshot `selectSetting` already returns.

**B2-3. `:298-303`** — same shape for `Git` / `Changes/log split` after `selectSetting` at `:297`.
**B2-4. `:307-312`** — same shape for `Markdown` / `Source/preview split` after `:306`.

**B2-5. `:656-659`** — `'the disabled Inline Rewrite row remains selected for reinstall'`,
`findText('› [ ] Inline Rewrite')`. The word "remains" states the defect: the row was unchecked at
`:628` and focus only left the pane at `:638`, so the text is already painted.
Proposal: `awaitValue(statusPath, 'primaryDockHost.activeId', 'extensions')` for the pane, then
assert the row text on the returned snapshot rather than waiting for it.

**B2-6. `:763-766`** — identical, `› [ ] Terminal` (unchecked at `:718`, focus left at `:739`).
**B2-7. `:914-917`** — identical, `› [ ] Source Text Editor` (unchecked at `:870`, focus left at
`:899`). Same proposal for both.

**B2-8. `:844-847`** — `awaitGridCondition('the installed editor paints the fixture text',
findText('manifest-line'))`. `manifest.ts` was opened at `:821` and awaited, and `Control+s` at
`:830` does not change the painted body, so the text is already there.
Proposal: drop the wait; the preceding `awaitStatus` at `:831-839` already states
`editorColumnContent === 'source-text-editor'`.

**B2-9/10/11. `:624-627`, `:714-717`, `:866-869`** — each immediately follows a `for` loop whose
exit condition is the SAME `findText('› [x] …')` (`:615-623`, `:706-713`, `:857-865`). The
predicate is true by construction of the loop that just exited. Harmless but zero-value; they
inflate the wait count and read as protection that is not there. Proposal: delete, or convert to a
`requireCondition` so a loop that exhausted its 12 steps fails with a clear message instead of a
timeout.

**B2-12. `:1006`** (and the anchor at `:991-996`) — the same post-loop shape inside
`selectExtensionsRow`; `:991` can also be pre-satisfied whenever the selection already sits on the
File Tree row, in which case the 12 `Up` presses at `:988-990` are never observed at all.

**B2-13. `:1203-1224`** — `'the focused structure filter has one leading cell in the shared active
tone'`. No gesture precedes it; the previous statement is a completed `awaitStatus` at `:1180`. It
is an assertion written as a wait, so it samples whatever frame is current.
Proposal: keep the check, but make it an assertion on the snapshot returned by the preceding
`awaitStatus`-then-`awaitGridCondition` pair, so a wrong tone fails as a comparison, not as a
30-second timeout.

**B2-14. `:85-88`** (inside `selectSetting`, reached by 8 call sites) — the grid wait runs only
after `awaitStatus` has confirmed `settingsSelectedLabel === label`. When the loop body never ran
(the label was already selected), both the status wait and this grid wait are pre-satisfied.
Proposal: the model already answers this — `awaitValue(statusPath, 'settingsPanel.selectedIndex',
…)` is index-keyed and therefore not usable for a NAMED row; keep the existing
`settingsSelectedLabel` status wait as the authority and demote `:85-88` to a snapshot assertion.

### Class 2 — proxy wait (8)

**B2-15..18. `:622`, `:712`, `:864`, `:1004`** — `await driver.awaitScreenChange()` after
`sendKeys('Down')` inside each Extensions walk loop. A generic repaint diff standing in for
"the selection moved". Any unrelated repaint (a status-bar clock, a diagnostic line) satisfies it,
and the loop then presses `Down` again against a selection that has not moved.
Proposal: no usable model path for a NAMED Extensions row —
`ExtensionsPaneContent.selectedIndex` (`src/modules/plugins/ExtensionsPaneContent.ts:21`) is an
ORDINAL, and the whole point of these loops (documented at `:605-606`, `:964`) is that ordinals
drift as plugins are contributed. Needs an identifier-keyed selection projection on
`ExtensionsPaneContent` (e.g. `selectedPluginIdentifier`) before a graph wait can replace this.

**B2-19. `:727-734`** — an `awaitGridCondition` whose predicate ignores its `snapshot` argument
entirely and calls `HarnessSmoke.Class.readStatus(statusPath)` instead:
```ts
await driver.awaitGridCondition(
  'the uninstalled runtime leaves no pane in the panel',
  () => HarnessSmoke.Class.panelCellsOfKind(HarnessSmoke.Class.readStatus(statusPath), 'terminal').length === 0,
);
```
A model question routed through the grid-wait verb, so the wait's name, its timeout diagnostics and
its snapshot dump all describe a screen it never looked at.
Proposal: `await GraphClient.Class.awaitValue(statusPath, 'panelHost.orderedContents.length', 0)`
(`src/modules/ui/PanelHost.ts:780`) — the surrounding arm has already uninstalled the only pane
kind in the panel, so the count is the direct statement. If a non-terminal pane may survive at this
point, there is no kind-filtered length path: needs one on `PanelHost`.

**B2-20. `:1068-1071`** — `awaitGridCondition('the structure scrollbar publishes its settled
dock-height geometry', () => (latestRightDockScrollbarDiagnostic(driver)?.height ?? 0) > 1)`.
Same misuse: the predicate reads the DiagnosticLog, not the snapshot.
Proposal: no model path — scrollbar geometry is published only to the debug bar log
(`TUI_DEBUG_BARS=1`, `:214`). Needs a `rightDockHost` scrollbar-geometry projection before this can
become a graph wait; until then it should at least use a log-polling helper that names itself
honestly rather than the grid verb.

**B2-21. `:351-354`** (low) — `findText('manifest.ts ●')` after `awaitStatus` already established
`status.dirty === true` at `:341-350`. Defensible as a paint check of the marker glyph; noted for
completeness.

**B2-22. `:528-531`** (low) — `findText('Language features unavailable')` after `awaitStatus`
already established `lspProvider === null` at `:508-518`. The string is a derived getter
(`src/modules/workspace/Workspace.ts:274-280`), not a transient. No model path: `languageProvider`
is `protected` (`Workspace.ts:239`), so the notice is not addressable — needs a public
`languageProviderNotice` projection if this is to become a graph wait.

### Class 3 — sleep as synchronization (3)

**B2-23. `:645-653`**, **B2-24. `:749-757`**, **B2-25. `:899-908`** — all one shape:
```ts
driver.sendKeysWithoutFrameExpectation('Control+Shift+r');
await Bun.sleep(500);
HarnessSmoke.Class.requireCondition(Number(readStatus(...).inlineRewriteMockRequestCount ?? 0) === 0, …);
```
These are NEGATIVE arms, so a hold window is the right instrument in principle — but 500ms is the
ONLY synchronization present. Nothing proves the app read the input at all, so on the contention
tier a slow input turn makes the arm pass for the wrong reason, and the assertion is a bare
synchronous `readStatus`. Note the file already knows this and tries to fix it once, at `:547-551`
— which is B2-1, and is itself broken.
Proposal: keep a bounded hold, but bracket it with a positive control: after the inert gesture,
send one gesture that MUST move a graph value and `awaitValue` on it (e.g.
`primaryDockHost.activeId` → `'extensions'`, `PanelHost.ts:60`), then assert the inert value. The
sleep then bounds a window that is provably after the input turn.

### Class 4 — stale needle (0)

I checked every screen literal this file waits on against the painting source. All nine still
exist: `No editor content is installed.` (`src/modules/ui/RootView.ts:307`),
`No structure available.` and `No matching symbols.`
(`src/modules/structure/StructurePaneRenderer.ts:190`, `:189`),
`No structure source is installed.` (`src/modules/structure/StructureOutline.ts:206`),
`No database is connected.` (`src/modules/database/DatabasePaneContent.ts:157`),
`No database provider is installed.` (`:140`),
`Language features unavailable — no provider installed` (`src/modules/workspace/Workspace.ts:279`).

### Class 5 — transient/blink (0)

No wait in this file targets a self-dismissing state. The nearest candidates —
`Language features unavailable` and the structure `structureNotice` strings — are derived getters
that persist while the condition holds, so frame sampling can see them. Nothing here needs
`awaitTransition`.

### Adjacent defect — unsynchronized read (6, not one of the five classes)

Reads of the screen or the status file with NO wait between the input and the read. Each is a
model-to-paint skew race, which is exactly what the contention tier widens.
- `:973-975` — `driver.snapshot().findText('Extensions')` immediately after `awaitStatus(sidebarView === 'extensions')`, then a mouse click on the found position. The model can say "extensions" a frame before the heading is painted; the throw is `The Extensions heading is not visible`. **This is a plausible cause of an intermittent contention red in `selectExtensionsRow`, which has 8 call sites.**
- `:537-540` — `driver.snapshot().findText('languageProbe;')` immediately after `sendKeys('Control+Space', 'Control+]')`.
- `:1115-1126` (`clickVisibleText`), called at `:1128`, `:1172`, `:1179` — snapshots and clicks right after an `awaitStatus` on `contextMenuOpen`.
- `:1340-1343` — `readStatus(...).settingsSelectedValue` read synchronously after `selectSetting`, whose last wait is keyed on the LABEL, not the value.
- `:1477-1481` — `rowsBeforeFold` read synchronously after two `sendKeys('Down')` with no wait.
- `:552` and `:901` — the inert-gesture assertions discussed above.

### PER-CLASS COUNTS — `smoke-plugin-manifest-harness.ts` + `smoke-plugin-manifest.sh`

| Class | Count |
| --- | --- |
| 1 — pre-satisfied wait | 14 |
| 2 — proxy wait | 8 |
| 3 — sleep as synchronization | 3 |
| 4 — stale needle | 0 |
| 5 — transient/blink | 0 |
| **Total (five classes)** | **25** |
| Adjacent — unsynchronized read | 6 |

`scripts/smoke-plugin-manifest.sh` contributes 0 to every class.
Denominator for the harness file: 49 `awaitGridCondition`, 119 `awaitStatus`, 4
`awaitScreenChange`, 3 `Bun.sleep`.

---

## Batch 3 — panel, layout, activitybar, tree-scroll

Files opened in full for this batch: `scripts/harness/smoke-panel-split-harness.ts`
(602 lines), `scripts/harness/smoke-layout-harness.ts` (1742 lines, both pages),
`scripts/harness/smoke-activitybar-harness.ts` (1139 lines),
`scripts/harness/smoke-tree-scroll-harness.ts` (463 lines). Support read for
proposals: `scripts/harness/GraphClient.ts`, `src/modules/app/Bootstrap.ts:1402-1446`,
`src/modules/app/AppStatusProjection.ts`, `src/modules/system/StatusChannel.ts`.

Graph root evidence used below: `GraphChannel.Class.arm({ roots: statusProjectionPorts })`
at `src/modules/app/Bootstrap.ts:1442-1443`, so every key of `AppStatusProjectionPorts`
(`Bootstrap.ts:1403-1436`) is a path root: `settings`, `quickOpen`, `settingsPanel`,
`boundedListPopup`, `tooltip`, `panelHost`, `primaryDockHost`, `rightDockHost`,
`workspaceSet`, `view`, `mouse`.

### smoke-tree-scroll-harness.ts

**`smoke-tree-scroll-harness.ts:288-295` — class 1 (PRE-SATISFIED POSITIVE CONTROL, highest value in this batch).**
```ts
const clickedFileSnapshot = await driver.awaitGridCondition(
  'the clicked file content is visible in the emulator grid',
  (candidate) => candidate.findText('x') !== null,
);
HarnessSmoke.Class.requireCondition(
  clickedFileSnapshot.findText('x') !== null,
  'the clicked file content is visible in the emulator grid',
);
```
The needle is the single letter `x`; every file-tree row already painted before the
click reads `file-NN.txt`, which contains `x`, so the wait is true on the boot frame
and the `requireCondition` re-tests the identical predicate on the identical snapshot —
the check cannot fail whether or not the click ever opened a buffer.
Proposal: assert the buffer text through the model, not the grid —
`await GraphClient.Class.awaitValue(statusPath, 'workspaceSet.active.editor.document.text', 'x\n')`
is NOT proposed because the exact member chain is unverified; use instead the already
awaited `status.activeBuffer` path plus a needle unique to the fixture body. There is no
one-cell-unique needle available (`x\n` is every fixture's body), so the durable fix is
to write a distinct body per fixture file and wait on that literal.

**`smoke-tree-scroll-harness.ts:95`, `:151`, `:375` — class 1 (KNOWN DEFECTIVE IDIOM).**
`status.renderQuiescent === true` inside `awaitStatusWithoutFrame`. Initialized false at
`src/modules/system/StatusChannel.ts:33`, set true at `:97`, never reset — permanently
true after the first frame, so the clause adds nothing to `ready === true && treeRows === N`.
Proposal: delete the clause. The load-bearing clause is the row count; there is
no graph path for it — the file tree lives on a per-contributor controller
(`FileTreeContributor.controllerFor`, `src/modules/filetree/FileTreeContributor.ts:138`),
not on `workspaceSet.active`. No model path — needs the file-tree controller exposed
as a projection port before `awaitValue` can address `treeRows`.

**`smoke-tree-scroll-harness.ts:325-332` and `:435-447` — class 1 (tautological control).**
`awaitGridCondition(... findText('target.ts') ...)` immediately followed by
`requireCondition(sameSnapshot.findText('target.ts') !== null, ...)`. The second check
re-tests the predicate the wait already guaranteed on the same frame; it can only pass.
Proposal: drop the duplicate `requireCondition`, or make it assert something the wait
did not (the row's column band, as `:442-447` already does for the second case).

**`smoke-tree-scroll-harness.ts:415-421` — class 1 (pre-satisfied wait).**
```ts
await settingOffDriver.awaitGridCondition(
  'the reveal button is visible after Quick Open closes',
  (candidate) => candidate.findText(revealGlyph) !== null,
);
```
The reveal button is permanent chrome — it was already painted at `:378` before Quick
Open opened, so the wait is true while the Quick Open overlay is still up and the named
condition ("after Quick Open closes") is never observed; the following `clickText` can
fire into the overlay.
Proposal: `await GraphClient.Class.awaitValue(statusPath, 'quickOpen.open', false)`
(root `quickOpen` at `Bootstrap.ts:1408`; member `quickOpen.open.value` at
`src/modules/app/AppStatusProjection.ts:118`) before locating the button.

**`smoke-tree-scroll-harness.ts:99-102` — class 1 (minor, precondition form).**
Same permanent reveal glyph, used only to resolve a column. Harmless as a locator,
but the name claims a settle it does not prove. Same proposal as above where a settle
is meant.

### smoke-activitybar-harness.ts

**`smoke-activitybar-harness.ts:254-262` — class 1 (pre-satisfied wait, high value).**
```ts
await HarnessSmoke.Class.awaitStatusWithoutFrame(countDriver, countStatusPath,
  'the clean count fixture settles with no changed files',
  (status) => status.ready === true && status.renderQuiescent === true &&
    status.gitChangedCount === 0);
```
Two of three clauses are permanently true once booted: `renderQuiescent` (see above) and
`gitChangedCount === 0`, which is also the value published before the Git watcher has
scanned anything (`src/modules/git/GitPlugin.ts:460` returns 0 when `repository` is
absent). The wait therefore proves "the scan has not happened yet" as readily as "the
scan found nothing", and the whole count ladder that follows starts from an unsettled
baseline.
Proposal: no model path — the Git repository is contributed by `GitPlugin`, not a
projection port in `Bootstrap.ts:1403-1436`, so `gitChangedCount` is not graph-addressable.
Fix in the fixture instead: dirty one file, await `gitChangedCount === 1`, revert it,
await `0`. That makes the zero a transition rather than an initial value.

**`smoke-activitybar-harness.ts:1071-1074` — class 1 (pre-satisfied wait).**
```ts
driver.sendKeys('Control+Shift+e');
await driver.awaitGridCondition(
  'the Explorer chord restores one visible activity accent',
  (candidate) => accentCount(candidate) === 1);
```
Exactly one item is accented at all times while the bar is visible; the previous view
(Extensions) already satisfied `accentCount === 1`, so the wait returns the pre-chord
frame and the following `Control+Shift+b` can race the view switch.
Proposal: `await GraphClient.Class.awaitValue(statusPath, 'primaryDockHost.activeId', 'files')`
(root `primaryDockHost` at `Bootstrap.ts:1419`; `ports.primaryDockHost.activeId.value`
projected as `sidebarView` at `src/modules/app/AppStatusProjection.ts:169`).

**`smoke-activitybar-harness.ts:1024-1032` — class 1 + class 6 (pre-satisfied wait feeding a geometry read).**
```ts
snapshot = await driver.awaitGridCondition(
  'all activity glyphs render before the pointer reorder',
  (candidate) => glyphRow(candidate,'F') >= 0 && glyphRow(candidate,'G') >= 0 &&
                 glyphRow(candidate,'X') >= 0);
const dragSourceRow = glyphRow(snapshot, 'G');
```
All three glyphs are painted before AND after the `Alt+Down` restore awaited at `:1016`,
so the snapshot may be the pre-restore frame; the drag rows are then computed from the
old ordering and the drag lands on the wrong item.
Proposal: the model condition is the order itself, already awaited at `:1016`; add a
paint-side condition that is false before the restore, e.g. wait for `glyphRow('G')` to
equal the index of `'git'` in `initialActivityOrder`, or read the rows only after
`await GraphClient.Class.awaitValue(statusPath, 'view.activityBarItemIdentifiers', …)`
— root `view` at `Bootstrap.ts:1424`, member used at `AppStatusProjection.ts:173`
(note it is a method there, so verify the arity before using it as a path).

**`smoke-activitybar-harness.ts:717` — class 6 (unsynchronized read, minor).**
`HarnessSmoke.Class.readStatus(statusPath).settingsLabels.length` is read inline to build
the expected error string. Not preceded by input, so the label list is stable; flagged
only because the assertion's expected value comes from the same unsynchronized source as
the actual, which weakens it toward a tautology.
Proposal: capture `settingsLabels.length` from the `awaitStatus` result at `:88-97`
and compare against that constant.

**Positive note, not a defect — `smoke-activitybar-harness.ts:706-719`.** The absent-label
walk is a genuine positive control: it drives a label that cannot exist and requires the
bounded walk to throw with its exact message. This is the shape the pre-satisfied controls
above should be reshaped toward.

### smoke-panel-split-harness.ts

**`smoke-panel-split-harness.ts:455-464` — class 1 (tautological control on a generic needle).**
```ts
const splitListSnapshot = await driver.awaitGridCondition(
  'split instance list closes both ends of its connector family',
  (snapshot) => snapshot.findText('╭ ') !== null && snapshot.findText('╰ ') !== null);
HarnessSmoke.Class.requireCondition(
  splitListSnapshot.findText('╭ ') !== null && splitListSnapshot.findText('╰ ') !== null,
  'split instance list paints first and last connector closure');
```
The `requireCondition` re-tests the wait's exact predicate on the wait's own snapshot, so
it can only pass; and the needles are rounded box corners painted by unrelated chrome,
so the wait itself may be satisfied by a border that is not the instance list.
Proposal: assert the connector cells at the published list geometry
(`status.panelListGeometry`, already read at `:363-367`) instead of a free-text search,
and delete the duplicate `requireCondition`.

**`smoke-panel-split-harness.ts:509-523` — class 1 (tautological control).**
The `awaitGridCondition` requires `findText('AGENTKEY') !== null`; `:520` then re-requires
the same on the same snapshot as "blurred agent kept its composer text". The claim about
key leakage is not independently checked.
Proposal: keep the wait; replace the duplicate with a check that the terminal cell did
NOT receive the text (assert `AGENTKEY` appears exactly once, in the agent cell's column
band derived from `initialLeftColumns`).

**`smoke-panel-split-harness.ts:207-232` — class 6 (unsynchronized read).**
`const sharedGlyphSnapshot = tierDriver.snapshot();` is taken immediately after the
status wait at `:196-206` and is then used for three paint assertions including an exact
cell at `:230`. The status file publishes at settle, but this bare `snapshot()` can still
observe the frame before the split repaint lands.
Proposal: convert to `awaitGridCondition` keyed on the new subwindow close glyph at
`panelTabRow + 1`, i.e. the very cell `:230` asserts — that condition is false before the
split.

**`smoke-panel-split-harness.ts:152-157`, `:190-195`, `:322-325` — class 6 (unsynchronized read).**
`driver.snapshot()` / `tierDriver.snapshot()` used to locate a status-bar button
immediately after a status-only wait; the button row can still be the pre-change frame,
so `statusButtonColumn` can resolve a stale column and the click lands off-target.
Proposal: reuse the `awaitGridCondition` form already used at `:98-103` for the same
buttons.

**`smoke-panel-split-harness.ts:368-378` — class 6 (unsynchronized read).**
`driver.snapshot().rowText(panelListGeometry.top + 2)` right after the
`panelListVisible === true` status wait, then asserts the row hides its close control.
The list may not be painted yet on that frame, in which case the row is empty and the
"hides its close control" assertion passes vacuously — a second can't-fail control.
Proposal: `awaitGridCondition` that the instance row at
`panelListGeometry.top + 2` is non-empty within the list's column band FIRST, then assert
the absence of `×`.

**`smoke-panel-split-harness.ts:147-151` — class 1 (partly tautological).**
`requireCondition(closedTerminalStatus.quitConfirmationOpen === false && …)` re-tests a
clause the `awaitStatus` at `:138-146` already required; the only new clause is a bare
`tierDriver.snapshot()` (class 6) for `'Close Terminal?'`.
Proposal: drop the duplicated model clause; keep the dialog-absence check but take it
from a synchronized frame.

### smoke-layout-harness.ts

**`smoke-layout-harness.ts:144-157` and `:244-252` — class 6 (unsynchronized read, highest-frequency defect in this file).**
`const snapshot = driver.snapshot();` inside `assertBottomPanelGeometry` and
`assertDockVerticalSpanGeometry`. Both helpers are called right after a settings edit
or preset selection whose only wait is on the status projection; the emulator frame for
the new geometry may not have arrived, so the corner-cell assertions read the previous
layout. These two helpers are called 14 times across the file.
Proposal: give both helpers an `awaitGridCondition` keyed on the cell they are about to
assert (the corner character at the computed row/column), so the frame is the post-change
one by construction.

**`smoke-layout-harness.ts:472`, `:486`, `:657`, `:673`, `:709`, `:753`, `:987`, `:1143`, `:1168`, `:1238` — class 2 (proxy wait).**
`await driver.awaitScreenChange();` — waits for ANY repaint, not for the change under
test. A queued unrelated frame (clock tick in the status bar, cursor blink, git watcher
paint) satisfies it immediately.
Proposal, per site: after settings close/open use
`await GraphClient.Class.awaitValue(statusPath, 'settingsPanel.open', false)` / `true`
(root `settingsPanel` at `Bootstrap.ts:1411`; `ports.settingsPanel.open.value` at
`src/modules/app/AppStatusProjection.ts:244`). After a preset selection at `:657` use the
preset's own axis, e.g.
`await GraphClient.Class.awaitValue(statusPath, 'settings.panelAlignment', 'center')`
(root `settings` at `Bootstrap.ts:1405`; `ports.settings.panelAlignment.value` at
`AppStatusProjection.ts:256`). At `:673`/`:709` inside `assertSplitterStates` the intent
is "the frame is stable before I sample the resting appearance" — there is no model path
for frame stability; do not substitute `renderQuiescent`. Sample the resting appearance
from the snapshot returned by an `awaitGridCondition` that the splitter cell holds a
non-empty character instead.

**`smoke-layout-harness.ts:710-713` — class 6 (unsynchronized read feeding every later comparison).**
`restingAppearance = splitterAppearanceAt(driver.snapshot(), initialPoint)` is read from a
bare snapshot after the proxy wait above. Every subsequent hover/rest assertion in the
function compares against this value, so a mis-sampled baseline silently inverts the
hover test (and the hover wait at `:720` would then pass on the resting frame).
Proposal: capture the baseline from an `awaitGridCondition`-returned snapshot, as above.

**`smoke-layout-harness.ts:609-615` — class 1 (pre-satisfied wait).**
```ts
driver.sendText(commandTitle);
await driver.awaitSnapshot((snapshot) => snapshot.findText(commandTitle) !== null);
```
After typing, the palette's own query line echoes `commandTitle`, so the wait is satisfied
by the echo and never proves the command list filtered down to a selectable match; the
following `Enter` can run whatever was selected first.
Proposal: no direct model path was verified for the command palette's selected item
(`commands` is a root at `Bootstrap.ts:1406`, but no `selectedIndex` projection was found
in `AppStatusProjection.ts`) — needs a command-palette selection field in the projection.
Until then, wait on the highlighted row marker rather than the bare title.

**`smoke-layout-harness.ts:636-644` — class 1 (pre-satisfied clause inside a live wait).**
The clause `snapshot.findText('Sidebar left · panel') === null` is already true before the
popup opens, so it contributes nothing; only the four preset-name clauses do work.
Proposal: keep the positive clauses; move the negative clause into a `requireCondition`
on the returned snapshot, where its polarity is meaningful.

**`smoke-layout-harness.ts:1326-1342` — class 1 (pre-satisfied wait).**
```ts
const statusBarSnapshot = await driver.awaitGridCondition(
  'the status controls end with the clock and right-dock affordance',
  (candidate) => / \d{2}:\d{2}  R $/.test(candidate.rowText(candidate.rows - 1)));
```
The clock and the ` R ` affordance are permanent status-bar chrome painted identically
before and after the `Control+Alt+b` that precedes it, so the wait cannot observe the dock
hiding; it only re-reads chrome.
Proposal: `await GraphClient.Class.awaitValue(statusPath, 'rightDockHost.visible', false)`
(root `rightDockHost` at `Bootstrap.ts:1420`; `ports.rightDockHost.visible.value` at
`AppStatusProjection.ts:332`) before sampling the status row.

**`smoke-layout-harness.ts:1344-1357` — class 6 (unsynchronized negative assertion).**
The click on the clock is followed by a wait on the published mouse position only, then
`requireCondition(status.rightDockVisible === false, 'clock is hit-tested without changing
right-dock visibility')`. The mouse projection can publish on the frame before a toggle
would land, so the "no change" claim is asserted too early to be falsifiable.
Proposal: keep the mouse-position wait as the click receipt, then re-read the dock state
after a second settle, e.g.
`await GraphClient.Class.awaitValue(statusPath, 'rightDockHost.visible', false)` with a
short timeout, which fails loudly if the click did toggle it.

**`smoke-layout-harness.ts:431-434` — class 1 (conditionally pre-satisfied, minor).**
`awaitGridCondition(findText('› ' + targetSettingLabel))` runs even when
`navigationDistance === 0`, in which case the row was already selected and painted.
Acceptable as a locator; noted so it is not mistaken for evidence that navigation moved.

### PER-CLASS COUNTS — batch 3 (four harness files)

| Class | Count |
| --- | --- |
| 1 — pre-satisfied wait (incl. 4 pre-satisfied positive controls and 3 `renderQuiescent` sites) | 15 |
| 2 — proxy wait (`awaitScreenChange`, 10 call sites in one file) | 10 |
| 3 — sleep as synchronization | 0 |
| 4 — stale needle | 0 |
| 5 — transient/blink | 0 |
| 6 — unsynchronized read | 9 |
| **Total** | **34** |

Class 4: every screen literal checked against its painting source
(`ThemeIcons.Class.interfaceGlyphVocabularyFor` / `glyphFor` for all glyph needles,
`AppStatusProjection.ts` for status-derived text, `layoutSettingLabel` for the settings
rows) — all still painted. No stale needles in this set.
Class 5: no blink-shaped state is driven in these four files; no `awaitTransition`
proposal is warranted.
Class 3: no `Bun.sleep`, `setTimeout`, or bare delay appears in any of the four files.

### COVERAGE STATEMENT — batch 3

Read end to end, every line: `scripts/harness/smoke-panel-split-harness.ts` (1-602),
`scripts/harness/smoke-layout-harness.ts` (1-1742, in two reads: 1-1380 and 1381-1742),
`scripts/harness/smoke-activitybar-harness.ts` (1-1139),
`scripts/harness/smoke-tree-scroll-harness.ts` (1-463). Nothing in the assigned set was
skipped or sampled. Denominators: 63 `awaitStatus`/`awaitStatusWithoutFrame` calls,
38 `awaitGridCondition`/`awaitSnapshot` calls, 10 `awaitScreenChange` calls,
11 bare `snapshot()`/`readStatus()` reads across the four files.
Not opened (out of scope, referenced only for evidence):
`HarnessSmoke.ts`, `PtyTestDriver.ts`, `HarnessSnapshot.ts`, `HarnessSmokeSupport.ts`.

## Batch 6 — smaller harnesses A-J

### Class 1 — pre-satisfied waits

- scripts/harness/smoke-bracket-match-harness.ts:60-62 — class 1. Wait: `driver.awaitSnapshot((snapshot) => snapshot.findText('sample.ts') !== null)` after typing `sample` into Quick Open. `sample.ts` is already painted by the file tree (the boot wait at line 51 proved it), so the wait is TRUE when issued and does not prove the filter applied. Proposal: `await GraphClient.Class.awaitValue(statusPath, 'quickOpen...', ...)` — the `quickOpen` port exists (src/modules/app/Bootstrap.ts:1408); the status fields `quickOpenQuery`/`quickOpenMatches` are proven live at scripts/harness/smoke-comment-styling-harness.ts:221-227.
- scripts/harness/smoke-git-blame-harness.ts:91-93 — class 1. Wait: `findText('tracked.txt') !== null` after typing `tracked` into Quick Open. `tracked.txt` is already in the file tree (waited at line 82). Same proposal as above (quickOpen port, Bootstrap.ts:1408).
- scripts/harness/smoke-git-blame-harness.ts:129-131 — class 1. Wait: `findText('untracked.txt') !== null` after typing `untracked`. `untracked.txt` is already in the tree; note also that `findText('tracked.txt')` elsewhere matches inside `untracked.txt`. Same proposal.
- scripts/harness/smoke-git-blame-harness.ts:102-108 — class 1, pre-satisfied POSITIVE CONTROL candidate. Wait: `status.currentLineBlameAuthor === 'Blame Tester'` after `Down`. Line 0 (`first line`) is committed by the same author, so the condition can already be TRUE before the Down — the wait cannot prove the cursor moved or the blame refreshed. Proposal: add the cursor to the predicate — `status.cursorLineIndex === 1 && status.currentLineBlameAuthor === 'Blame Tester'` (`cursorLineIndex` is a proven field, scripts/harness/smoke-go-to-line-harness.ts:31).
- scripts/harness/smoke-image-preview-harness.ts:79-81 (helper `openThroughQuickOpen`; call sites 245, 272, 289, 326) — class 1. Wait: any row `includes(query)` after typing the query. Every query (`picture`, `sample`, `photo`, `data`) is a substring of a file-tree row painted before Quick Open filters, so all four waits are TRUE when issued. Proposal: quickOpen model wait (port at Bootstrap.ts:1408; fields proven at smoke-horizontal-extent-harness.ts:58-64).
- scripts/harness/smoke-git-log-harness.ts:252-258 and 273-279 — class 1, the MOST SEVERE form: pre-satisfied POSITIVE CONTROLS. Wait after `Down`: `status.focus === 'git' && status.showingDiff === true` — both were already TRUE and asserted before the keypress (lines 244-249), so these two waits can never fail and prove nothing about the selection advancing. Proposal: no model path — contributor state (the git-log selected row is not published); key the wait on the preview grid text that the Down changes (as lines 241 and 262 already do), and drop these two status waits or turn them into one-shot assertions.
- scripts/harness/smoke-hover-harness.ts:164-167 — class 1 (with a class-5 shadow). Wait: `hoverCardTextSpan(candidate) !== null` after Ctrl+C — the card was visible BEFORE the copy, so the wait is pre-satisfied; a blink-dismiss-and-reopen would also be missed. Proposal: the copy is already synchronized by the `lastCopyChars` wait at line 158; take one snapshot after it and `requireCondition` the card span (assertion, not a wait).
- scripts/harness/smoke-horizontal-extent-harness.ts:177-181 — class 1 (mild). Wait: `status.editorScrollLeft === openingViewportClamp` after vertical scrolling — the equality was TRUE before the scroll (published at lines 139-143); a persistence claim written as a wait returns instantly on stale state. Proposal: read status once after the frame-collection wait at 153-168 and `requireCondition` the equality.

### Class 2 — proxy waits

- scripts/harness/smoke-breadcrumb-harness.ts:328-329 — class 2. `driver.sendText('huge.ts'); await driver.awaitScreenChange();` then Enter. Any repaint (the first echoed character) satisfies it while the filter result is still pending; Enter can accept a stale list. Proposal: quickOpen model wait (port at Bootstrap.ts:1408; fields proven at smoke-horizontal-extent-harness.ts:58-64).
- scripts/harness/smoke-clipboard-frame-boundary-harness.ts:295 — class 2. `driver.sendKeys('Enter'); await driver.awaitScreenChange();` per transcript-fill turn — any repaint stands in for "the turn was submitted". Proposal: no graph path — agent transcript contributor state; use `awaitStatus` on the `agentBusy` transition (true after Enter, then false), or `awaitTransition`.
- scripts/harness/smoke-clipboard-frame-boundary-harness.ts:404 and 434 — class 2. `sendText(...)` then `awaitScreenChange()` before Enter — the first echoed character's repaint satisfies the wait while the rest of the command is in flight. Line 434's comment acknowledges it as staging. Proposal for 404: `awaitGridCondition(findText('printf IDLE-TERMINAL'))` (single-row text); no model path — terminal contributor state.
- scripts/harness/smoke-clipboard-frame-boundary-harness.ts:424, 426, 469, 471 — class 2; 469/471 are the SEVERE form: during the active loop the shell repaints every 20 ms, so `awaitScreenChange()` after the deselect click (469) and after Ctrl+C (471) is satisfied by loop output — a positive control that cannot fail. Proposal: for the click, the `mouse` port exists (Bootstrap.ts:1425, "proves the mouse path is live"); for the Ctrl+C effect, no model path — terminal contributor state (wait on the loop output row STOPPING, e.g. a grid condition that the numbered row no longer advances is still frame sampling — the honest wait is on selection-cleared state if published).
- scripts/harness/smoke-git-log-harness.ts:226-231 — class 2. Wait: row-cells JSON diff (`JSON.stringify(candidate.rowCells(...)) !== before`) as a proxy for "the clicked file becomes the selected log row". No model path — contributor state (git log selection is not in status).
- scripts/harness/smoke-comment-styling-harness.ts:77-78 — class 2. `driver.sendKeys('Right'); await driver.awaitScreenChange();` — any repaint proxies the cursor move. Proposal: `awaitStatusPublication` on `status.cursor` col === 1 (`cursor` is a proven field, scripts/harness/smoke-dirty-marker-harness.ts:160-162).
- scripts/harness/smoke-comment-styling-harness.ts:282-289 — class 2 (plus a bare `driver.snapshot()` in the loop guard). `Down` + `awaitScreenChange()` per step proxies "the Extensions selection advanced". No model path — extensions-list selection is contributor state; the closing grid wait at 290-293 is the real condition, so replace the per-step proxy with the `› [x] Vue` grid condition and drop the screen-change steps.
- scripts/harness/smoke-hover-harness.ts:136 — class 2. `await driver.awaitScreenChange()` after the mouse move — any repaint proxies "the move registered", and the REAL condition (the hover card span) is the very next wait at 137-140. Proposal: delete line 136; the card wait is the condition. (If a model wait is wanted, the `tooltip` port exists, Bootstrap.ts:1417.)

### Class 6 — unsynchronized reads / actions

- scripts/harness/smoke-diagnostics-harness.ts:266-267 — class 6. `driver.sendText('far.ts'); driver.sendKeys('Enter');` with no wait between — Quick Open filtering is asynchronous, so Enter can accept a stale list even though PTY bytes are ordered. Sibling harnesses deliberately await the filter first (smoke-horizontal-extent-harness.ts:58-64, smoke-comment-styling-harness.ts:221-227). Proposal: `awaitValue` on the quickOpen port (Bootstrap.ts:1408) for query === 'far.ts' with matches > 0 before Enter.
- scripts/harness/smoke-git-log-harness.ts:298 — class 6. `snapshot = driver.snapshot()` right after Ctrl+g with only a STATUS wait (focus === 'git') between — the grid can lag the status flip, and the following `findText('root-subject-A')` then throws on a stale frame. Proposal: `await driver.awaitGridCondition(... findText('root-subject-A') !== null)`.

### Clean files (no findings)

smoke-audio-narration-harness.ts, smoke-database-harness.ts, smoke-dirty-marker-harness.ts (exemplary: revision-carried waits), smoke-find-harness.ts, smoke-go-to-line-harness.ts, smoke-goto-definition-harness.ts, smoke-gutter-diff-harness.ts (its comment at lines 178-182 records a past fix of exactly this defect class).

No wait in this batch is keyed on `renderQuiescent`. All bare `Bun.sleep` calls found (audio poll 5 ms, dirty-marker 10 ms, gutter-diff 10 ms, clipboard 5/50 ms) are poll intervals inside deadline-bounded condition loops — not class 3. No stale needles found: every literal checked is either defined by the fixture the harness writes or was proven painted in the same run.

### Batch 6 counts

- Class 1 (pre-satisfied): 8 findings (10 wait sites; 3 are pre-satisfied positive controls: git-blame:102, git-log:252, git-log:273 — plus clipboard:469/471 counted under class 2)
- Class 2 (proxy): 8 findings (12 wait sites)
- Class 3 (sleep as sync): 0
- Class 4 (stale needle): 0
- Class 5 (transient/blink): 0 standalone (one shadow noted at hover:164)
- Class 6 (unsynchronized): 2

Coverage: all 18 assigned files opened and read in full (smoke-audio-narration, smoke-bracket-match, smoke-breadcrumb, smoke-clipboard-frame-boundary, smoke-comment-styling, smoke-database, smoke-diagnostics, smoke-diff-overview, smoke-dirty-marker, smoke-find, smoke-git-blame, smoke-git-log, smoke-go-to-line, smoke-goto-definition, smoke-gutter-diff, smoke-horizontal-extent, smoke-hover, smoke-image-preview). 0 files not opened.

## Batch 5 — editor, popup, settings

Files (9): smoke-bounded-list-popup-harness.ts, smoke-code-folding-harness.ts,
smoke-pixel-preview-harness.ts, smoke-settings-applied-harness.ts,
smoke-navigation-history-harness.ts, smoke-workspace-tabs-harness.ts,
smoke-editor-harness.ts, smoke-completion-harness.ts, smoke-field-caret-harness.ts.
No wait in this set keys on `renderQuiescent`.

### Findings

1. scripts/harness/smoke-field-caret-harness.ts:254-259 — CLASS 1 (PRE-SATISFIED
   POSITIVE CONTROL, most severe form). Wait as written:
   `awaitStatus(... 'copy without a popup query selection publishes zero characters',
   (candidate) => candidate.lastCopyChars === 0)` right after `sendKeys('Control+c')`.
   `lastCopyChars` is 0 in the never-copied initial state, so the wait is TRUE before
   Ctrl+C is sent — it cannot fail and cannot prove the copy path ran at all.
   Proposal: no model path distinguishes "copy ran and copied 0" from "copy never
   dispatched" (only lastCopyChars/lastCopyHash exist in AppStatusProjection); needs a
   copy-attempt counter in the projection, then awaitValue on its increment.

2. scripts/harness/smoke-pixel-preview-harness.ts:669-672 — CLASS 1 (PRE-SATISFIED
   POSITIVE CONTROL). After `driver.resize(96, 30)`:
   `awaitGridCondition('Settings remains painted after resize',
   (candidate) => candidate.findText('Settings') !== null)`. 'Settings' was painted
   before the resize (waited at :654); the wait is TRUE at issue and cannot prove the
   resize was processed. It is the only anchor for the negative window below it.
   Proposal: wait on a resize-reflecting condition — the snapshot's column count
   becoming 96, or a layout leaf under the `layoutSlotSizes` root
   (`layoutSlotSizes: layoutSlots`, src/modules/app/Bootstrap.ts:1424) via
   `GraphClient.Class.awaitValue` (scripts/harness/GraphClient.ts:83).

3. scripts/harness/smoke-pixel-preview-harness.ts:673-679 — CLASS 3. The 100 ms
   `requireOutputSequenceCountRemainsUnchangedFor` window (helper :168-188) asserts
   "no kitty placement during resize" but its start is anchored only by the
   pre-satisfied wait in finding 2 — the window can open and close before the resize
   lands, passing vacuously. Fix: anchor the window start to the real
   resize-processed condition from finding 2; the bounded window itself is then fine.

4. scripts/harness/smoke-pixel-preview-harness.ts:777-779 — CLASS 1 (minor).
   `awaitGridCondition('the shortcut-help status control is visible ...',
   (candidate) => candidate.rowText(candidate.rows - 1).includes('?'))` — the '?'
   status-bar control is painted continuously; TRUE at issue. Locator only; harmless
   coordinates, but a stale frame satisfies it. Proposal: take the position from the
   current snapshot after the preceding real wait; no new wait needed.

5. scripts/harness/smoke-bounded-list-popup-harness.ts:585-588 — CLASS 1.
   `awaitGridCondition('the buffer badge remains available',
   (candidate) => badgePosition(candidate, totalFixtureBufferCount) !== null)` after
   the Enter-closes-popup status wait (:573). The badge chrome is painted before,
   during, and after the popup, so the wait is TRUE on a stale frame that may still
   show the popup. Proposal: the model close is already proven at :573
   (`boundedListPopupOpen === false`; graph path `boundedListPopup.open`,
   src/modules/app/Bootstrap.ts:1412 + src/modules/app/AppStatusProjection.ts:203);
   make the grid wait key on popup ABSENCE plus badge presence (e.g. themed search
   glyph gone) so the frame is provably post-close.

6. scripts/harness/smoke-bounded-list-popup-harness.ts:631-634 — CLASS 1. Same badge
   idiom ('remains available for outside-dismiss coverage') after :622 close wait.
   Same proposal as finding 5.

7. scripts/harness/smoke-code-folding-harness.ts:425-428 — CLASS 1.
   `awaitGridCondition('deep.ts remains visible in the file tree',
   (candidate) => candidate.findText('deep.ts') !== null)` — 'deep.ts' has been
   painted since the boot wait (:199); TRUE at issue, returns any stale frame.
   Locator only. Proposal: drop the wait and locate on the snapshot returned by the
   previous real wait (:414-417 collapsedGrid).

8. scripts/harness/smoke-navigation-history-harness.ts:396-398 — CLASS 1.
   `awaitGridCondition('the breadcrumb row renders both fat history controls',
   (candidate) => candidate.findText(' ❮  ❯ ') !== null)` — the history control has
   been painted since :86; TRUE at issue. Locator only; needle verified live
   (src/modules/ui/TabBarRenderer). Proposal: locate on the snapshot from the
   preceding real wait (:315-318 beta content).

9. scripts/harness/smoke-navigation-history-harness.ts:181 — CLASS 2.
   `await driver.awaitScreenChange();` after the cursor status wait, guarding
   nothing named. Either the cursor repaint already happened (wait consumes an
   unrelated later blink) or it stalls to timeout. Proposal: delete it — the model
   condition (:174-179 cursor === 3,0) is already the fact the section needs.

10. scripts/harness/smoke-editor-harness.ts:79,81,90,92,107,189,297,351,445,447,505,
    649,669 — CLASS 2 (13 sites, one idiom). `sendKeys(...)` then
    `await driver.awaitScreenChange()` as the only synchronization for tree
    navigation, caret movement, undo, Escape/Home, click-to-move-caret, and the
    Ctrl+W/y confirmation. A repaint is a proxy: any unrelated frame (cursor blink,
    status-bar clock) satisfies it while the model may not have moved. Proposal:
    replace each with the model condition the next step depends on via
    awaitStatusPublication (already imported) or
    `GraphClient.Class.awaitValue(statusPath, '<workspaceSet leaf>', v)`
    (root `workspaceSet`, src/modules/app/Bootstrap.ts:1404): treeSelected for
    :79/:81/:90/:92, cursor column for :107/:297/:351/:445/:447/:505, dirty/revision
    for :189, pendingCloseTab/bufferTabCount for :649/:669.

11. scripts/harness/smoke-editor-harness.ts:83-87 — CLASS 1. Loop-pacing wait
    `(status) => Object.hasOwn(status, 'activeBuffer')` is permanently TRUE once the
    field is first published; each loop turn reads a possibly stale activeBuffer and
    can send extra Enter/Down keys. Proposal: wait on the state the key should
    produce (activeBuffer non-empty, or treeSelected advanced) per attempt.

12. scripts/harness/smoke-editor-harness.ts:182-186 — CLASS 1. Undo loop paced by
    `(status) => typeof status.dirty === 'boolean'` — permanently TRUE; a stale
    dirty=true sends surplus Ctrl+Z. Proposal: per-iteration wait on
    `bufferRevision` decreasing or `dirty === false`, timeout-guarded.

13. scripts/harness/smoke-editor-harness.ts:564-566 — CLASS 1 (minor).
    `awaitSnapshot((candidate) => candidate.findText('⚙') !== null)` — the gear is
    permanent status-bar chrome; TRUE at issue (palette may still be painted on the
    stale frame). Locator only, fixed chrome, low risk. Proposal: locate on the
    snapshot following the overlay-null status wait (:556-560) — needs that wait to
    return/anchor a frame, or key the grid wait on 'Command Palette' ABSENCE plus
    the gear.

14. scripts/harness/smoke-settings-applied-harness.ts:198-234 (helper
    `awaitSettledPublishedNumber`, used at :283, :342, :818) plus the same inline
    idiom at :403-416 and :455-467 — CLASS 2. A STATUS condition
    (editorScrollTop settle + workspaceScrollMomentumAtRest) is polled inside
    `awaitGridCondition`, so the wait wakes on FRAMES: if the final glide value is
    published without one more repaint the wait hangs to timeout; conversely it
    burns a frame subscription to watch a file. Proposal:
    `HarnessSmoke.Class.awaitStatus` on the same predicate, or
    `GraphClient.Class.awaitValue(statusPath, '<workspaceSet scroll leaf>', v)`
    (root `workspaceSet`, src/modules/app/Bootstrap.ts:1404).

15. scripts/harness/smoke-settings-applied-harness.ts:161 — CLASS 3 (borderline).
    `await Bun.sleep(100)` paces the openOnlyFile retry loop between condition
    waits. Bounded by 4 attempts and each attempt is a real condition, so it is
    pacing rather than synchronization; noted for completeness.

16. scripts/harness/smoke-workspace-tabs-harness.ts:173 and :206 — CLASS 2. In
    `openLanguageFixture`: hover move then `await driver.awaitScreenChange()`
    (:173) before the real hover-content wait, and Escape then awaitScreenChange
    (:206) with nothing checking the hover actually dismissed. Proposal: delete
    :173 (the :174 awaitSnapshot is the real condition); for :206 wait on the hover
    content DISAPPEARING from the grid (both polarities).

17. scripts/harness/smoke-workspace-tabs-harness.ts:553-557 — CLASS 6 (negative arm
    unanchored). `driver.snapshot()` read directly, asserting the FIRST workspace
    terminal marker is ABSENT after switching to the second workspace; no grid wait
    ties that frame to the switched state at this point. A late frame would pass a
    stale positive through. Proposal: fold into one awaitGridCondition:
    `findText('SECOND_TREE_ONLY.txt') !== null && findText(firstTerminalMarker) === null`.

18. scripts/harness/smoke-workspace-tabs-harness.ts:825-833 — CLASS 5 (transient)
    plus a CLASS 2 lead-in. :825 `awaitScreenChange` is a frame proxy; :826-833
    waits for `gitWatcherActivationCompleted === false` after the tab click — a
    state that EXISTS ONLY until the wide walk finishes. If activation completes
    between status samples the false state is never observed and the wait times
    out. Proposal: `GraphClient.Class.awaitTransition`
    (scripts/harness/GraphClient.ts:120) through false→true; note the watcher
    activation fields are contributor-published — if no graph path exists for them,
    record "no model path — contributor state" and subscribe the transition inside
    the app.

19. scripts/harness/smoke-workspace-tabs-harness.ts:874 and :910 — CLASS 2.
    `sendKeys('Right'/'Left')` on the Workspace tabs setting then
    `awaitScreenChange` as the only proof the setting applied before Escape.
    Proposal: `GraphClient.Class.awaitValue(statusPath,
    'settings.workspaceTabPosition', <value>)` — root `settings` exists
    (src/modules/app/Bootstrap.ts:1405) and the field is a Settings schema default
    (Settings.$Class.DEFAULTS includes workspaceTabPosition).

20. scripts/harness/smoke-field-caret-harness.ts:464-469 — CLASS 1 (minor).
    `awaitStatus('the focused popup publishes its box geometry',
    (candidate) => popupGeometry(candidate) !== null)` — geometry has been non-null
    since the popup opened; TRUE at issue, returns a stale status. Fetch only.
    Proposal: read the last condition-waited status (from :452-458) instead of
    issuing a new pre-satisfied wait.

Clean file: scripts/harness/smoke-completion-harness.ts — every wait is a model
condition false at issue; the bare `readStatus` calls (:446, :467, :622, :634) are
pre-input baselines, not post-input reads. No findings.

### Class 4 verification (stale needles) — none rotted

Checked against painting sources: 'history: main'
(src/modules/git/GitPaneRenderer.ts:285), '(binary file not shown)'
(src/modules/text/TextDocument.ts:91), ' ❮  ❯ ' (src/modules/ui/TabBarRenderer),
'Go to File' / 'Settings' / 'Command Palette' / 'Keyboard Shortcuts'
(src/modules/ui/OverlayLayer.ts, CommandBar.ts, ShortcutHelp.ts), '⚙'
(src/modules/theme/ThemeIcons). All still painted. Class 4 count: 0.

### Batch 5 counts per class

- Class 1 (pre-satisfied): 11 — of which 2 are pre-satisfied POSITIVE CONTROLS
  (field-caret :254 copy-zero; pixel-preview :669 resize anchor) and 2 are
  loop-pacing waits that send surplus keys (editor :83, :182).
- Class 2 (proxy wait): 24 sites — editor 13 (finding 10), navigation-history 1
  (finding 9), settings-applied 5 (finding 14: helper at :283/:342/:818 plus inline
  :403 and :455), workspace-tabs 5 (findings 16, 18 lead-in, 19: :173, :206, :825,
  :874, :910).
- Class 3 (sleep as synchronization): 2 (pixel-preview :673 window; settings-applied
  :161 borderline pacing).
- Class 4 (stale needle): 0.
- Class 5 (transient/blink): 1 (workspace-tabs :826-833).
- Class 6 (unsynchronized read): 1 (workspace-tabs :553).

### COVERAGE STATEMENT — batch 5

Read end to end, every line, by this agent, no delegation:
smoke-bounded-list-popup-harness.ts (1-1314), smoke-code-folding-harness.ts (1-560),
smoke-pixel-preview-harness.ts (1-1027), smoke-settings-applied-harness.ts (1-1197),
smoke-navigation-history-harness.ts (1-472), smoke-workspace-tabs-harness.ts (1-961),
smoke-editor-harness.ts (1-693), smoke-completion-harness.ts (1-726),
smoke-field-caret-harness.ts (1-666). All 9 of 9 assigned files opened in full;
none skipped. Opened for evidence only (not audited): src/modules/app/Bootstrap.ts
(:1395-1435), scripts/harness/GraphClient.ts (grep), src/modules/app/AppStatusProjection.ts
(grep), painting sources listed under Class 4.

## Batch 6 — smaller harnesses A-J

### Class 1 — pre-satisfied waits

- scripts/harness/smoke-bracket-match-harness.ts:60-62 — class 1. Wait: `driver.awaitSnapshot((snapshot) => snapshot.findText('sample.ts') !== null)` after typing `sample` into Quick Open. `sample.ts` is already painted by the file tree (the boot wait at line 51 proved it), so the wait is TRUE when issued and does not prove the filter applied. Proposal: `await GraphClient.Class.awaitValue(statusPath, 'quickOpen...', ...)` — the `quickOpen` port exists (src/modules/app/Bootstrap.ts:1408); the status fields `quickOpenQuery`/`quickOpenMatches` are proven live at scripts/harness/smoke-comment-styling-harness.ts:221-227.
- scripts/harness/smoke-git-blame-harness.ts:91-93 — class 1. Wait: `findText('tracked.txt') !== null` after typing `tracked` into Quick Open. `tracked.txt` is already in the file tree (waited at line 82). Same proposal as above (quickOpen port, Bootstrap.ts:1408).
- scripts/harness/smoke-git-blame-harness.ts:129-131 — class 1. Wait: `findText('untracked.txt') !== null` after typing `untracked`. `untracked.txt` is already in the tree; note also that `findText('tracked.txt')` elsewhere matches inside `untracked.txt`. Same proposal.
- scripts/harness/smoke-git-blame-harness.ts:102-108 — class 1, pre-satisfied POSITIVE CONTROL candidate. Wait: `status.currentLineBlameAuthor === 'Blame Tester'` after `Down`. Line 0 (`first line`) is committed by the same author, so the condition can already be TRUE before the Down — the wait cannot prove the cursor moved or the blame refreshed. Proposal: add the cursor to the predicate — `status.cursorLineIndex === 1 && status.currentLineBlameAuthor === 'Blame Tester'` (`cursorLineIndex` is a proven field, scripts/harness/smoke-go-to-line-harness.ts:31).
- scripts/harness/smoke-image-preview-harness.ts:79-81 (helper `openThroughQuickOpen`; call sites 245, 272, 289, 326) — class 1. Wait: any row `includes(query)` after typing the query. Every query (`picture`, `sample`, `photo`, `data`) is a substring of a file-tree row painted before Quick Open filters, so all four waits are TRUE when issued. Proposal: quickOpen model wait (port at Bootstrap.ts:1408; fields proven at smoke-horizontal-extent-harness.ts:58-64).
- scripts/harness/smoke-git-log-harness.ts:252-258 and 273-279 — class 1, the MOST SEVERE form: pre-satisfied POSITIVE CONTROLS. Wait after `Down`: `status.focus === 'git' && status.showingDiff === true` — both were already TRUE and asserted before the keypress (lines 244-249), so these two waits can never fail and prove nothing about the selection advancing. Proposal: no model path — contributor state (the git-log selected row is not published); key the wait on the preview grid text that the Down changes (as lines 241 and 262 already do), and drop these two status waits or turn them into one-shot assertions.
- scripts/harness/smoke-hover-harness.ts:164-167 — class 1 (with a class-5 shadow). Wait: `hoverCardTextSpan(candidate) !== null` after Ctrl+C — the card was visible BEFORE the copy, so the wait is pre-satisfied; a blink-dismiss-and-reopen would also be missed. Proposal: the copy is already synchronized by the `lastCopyChars` wait at line 158; take one snapshot after it and `requireCondition` the card span (assertion, not a wait).
- scripts/harness/smoke-horizontal-extent-harness.ts:177-181 — class 1 (mild). Wait: `status.editorScrollLeft === openingViewportClamp` after vertical scrolling — the equality was TRUE before the scroll (published at lines 139-143); a persistence claim written as a wait returns instantly on stale state. Proposal: read status once after the frame-collection wait at 153-168 and `requireCondition` the equality.

### Class 2 — proxy waits

- scripts/harness/smoke-breadcrumb-harness.ts:328-329 — class 2. `driver.sendText('huge.ts'); await driver.awaitScreenChange();` then Enter. Any repaint (the first echoed character) satisfies it while the filter result is still pending; Enter can accept a stale list. Proposal: quickOpen model wait (port at Bootstrap.ts:1408; fields proven at smoke-horizontal-extent-harness.ts:58-64).
- scripts/harness/smoke-clipboard-frame-boundary-harness.ts:295 — class 2. `driver.sendKeys('Enter'); await driver.awaitScreenChange();` per transcript-fill turn — any repaint stands in for "the turn was submitted". Proposal: no graph path — agent transcript contributor state; use `awaitStatus` on the `agentBusy` transition (true after Enter, then false), or `awaitTransition`.
- scripts/harness/smoke-clipboard-frame-boundary-harness.ts:404 and 434 — class 2. `sendText(...)` then `awaitScreenChange()` before Enter — the first echoed character's repaint satisfies the wait while the rest of the command is in flight. Line 434's comment acknowledges it as staging. Proposal for 404: `awaitGridCondition(findText('printf IDLE-TERMINAL'))` (single-row text); no model path — terminal contributor state.
- scripts/harness/smoke-clipboard-frame-boundary-harness.ts:424, 426, 469, 471 — class 2; 469/471 are the SEVERE form: during the active loop the shell repaints every 20 ms, so `awaitScreenChange()` after the deselect click (469) and after Ctrl+C (471) is satisfied by loop output — a positive control that cannot fail. Proposal: for the click, the `mouse` port exists (Bootstrap.ts:1425, "proves the mouse path is live"); for the Ctrl+C effect, no model path — terminal contributor state (wait on the loop output row STOPPING, e.g. a grid condition that the numbered row no longer advances is still frame sampling — the honest wait is on selection-cleared state if published).
- scripts/harness/smoke-git-log-harness.ts:226-231 — class 2. Wait: row-cells JSON diff (`JSON.stringify(candidate.rowCells(...)) !== before`) as a proxy for "the clicked file becomes the selected log row". No model path — contributor state (git log selection is not in status).
- scripts/harness/smoke-comment-styling-harness.ts:77-78 — class 2. `driver.sendKeys('Right'); await driver.awaitScreenChange();` — any repaint proxies the cursor move. Proposal: `awaitStatusPublication` on `status.cursor` col === 1 (`cursor` is a proven field, scripts/harness/smoke-dirty-marker-harness.ts:160-162).
- scripts/harness/smoke-comment-styling-harness.ts:282-289 — class 2 (plus a bare `driver.snapshot()` in the loop guard). `Down` + `awaitScreenChange()` per step proxies "the Extensions selection advanced". No model path — extensions-list selection is contributor state; the closing grid wait at 290-293 is the real condition, so replace the per-step proxy with the `› [x] Vue` grid condition and drop the screen-change steps.
- scripts/harness/smoke-hover-harness.ts:136 — class 2. `await driver.awaitScreenChange()` after the mouse move — any repaint proxies "the move registered", and the REAL condition (the hover card span) is the very next wait at 137-140. Proposal: delete line 136; the card wait is the condition. (If a model wait is wanted, the `tooltip` port exists, Bootstrap.ts:1417.)

### Class 6 — unsynchronized reads / actions

- scripts/harness/smoke-diagnostics-harness.ts:266-267 — class 6. `driver.sendText('far.ts'); driver.sendKeys('Enter');` with no wait between — Quick Open filtering is asynchronous, so Enter can accept a stale list even though PTY bytes are ordered. Sibling harnesses deliberately await the filter first (smoke-horizontal-extent-harness.ts:58-64, smoke-comment-styling-harness.ts:221-227). Proposal: `awaitValue` on the quickOpen port (Bootstrap.ts:1408) for query === 'far.ts' with matches > 0 before Enter.
- scripts/harness/smoke-git-log-harness.ts:298 — class 6. `snapshot = driver.snapshot()` right after Ctrl+g with only a STATUS wait (focus === 'git') between — the grid can lag the status flip, and the following `findText('root-subject-A')` then throws on a stale frame. Proposal: `await driver.awaitGridCondition(... findText('root-subject-A') !== null)`.

### Clean files (no findings)

smoke-audio-narration-harness.ts, smoke-database-harness.ts, smoke-dirty-marker-harness.ts (exemplary: revision-carried waits), smoke-find-harness.ts, smoke-go-to-line-harness.ts, smoke-goto-definition-harness.ts, smoke-gutter-diff-harness.ts (its comment at lines 178-182 records a past fix of exactly this defect class).

No wait in this batch is keyed on `renderQuiescent`. All bare `Bun.sleep` calls found (audio poll 5 ms, dirty-marker 10 ms, gutter-diff 10 ms, clipboard 5/50 ms) are poll intervals inside deadline-bounded condition loops — not class 3. No stale needles found: every literal checked is either defined by the fixture the harness writes or was proven painted in the same run.

### Batch 6 counts

- Class 1 (pre-satisfied): 8 findings (10 wait sites; 3 are pre-satisfied positive controls: git-blame:102, git-log:252, git-log:273 — plus clipboard:469/471 counted under class 2)
- Class 2 (proxy): 8 findings (12 wait sites)
- Class 3 (sleep as sync): 0
- Class 4 (stale needle): 0
- Class 5 (transient/blink): 0 standalone (one shadow noted at hover:164)
- Class 6 (unsynchronized): 2

Coverage: all 18 assigned files opened and read in full (smoke-audio-narration, smoke-bracket-match, smoke-breadcrumb, smoke-clipboard-frame-boundary, smoke-comment-styling, smoke-database, smoke-diagnostics, smoke-diff-overview, smoke-dirty-marker, smoke-find, smoke-git-blame, smoke-git-log, smoke-go-to-line, smoke-goto-definition, smoke-gutter-diff, smoke-horizontal-extent, smoke-hover, smoke-image-preview). 0 files not opened.

## Batch 7 — smaller harnesses K-Z

All paths under scripts/harness/. Graph-path evidence: status roots at src/modules/app/Bootstrap.ts:1403-1425; `commands.query`/`commands.open`/`commands.filtered` at src/modules/app/AppStatusProjection.ts:138-142; `workspaceSet.active.focus` at src/modules/app/AppStatusProjection.ts:165-168.

### Findings

1. smoke-tabs-harness.ts:245-249 — CLASS 1, PRE-SATISFIED POSITIVE CONTROL (most severe form). `awaitStatusPublication('the strip pan preserves the active buffer index', (status) => status.activeBufferIndex === activeIndexBeforeArrow)` after clicking the pan arrow. The index is unchanged before AND after a pan, so the wait is TRUE when issued and can never fail — nothing anywhere in the smoke proves the pan happened; the "right arrow pans the strip" pass is unfalsifiable. No model path — the tab-strip pan offset is not published (grep of AppStatusProjection.ts and src/modules/ui/TabBar.ts found no panOffset/stripOffset/firstVisibleTab). Proposal: publish the pan offset and `await GraphClient.Class.awaitValue(statusPath, '<new path>', ...)`, or wait for a grid change in the tab-strip row (leftmost visible filename changes), THEN assert the index is preserved.
2. smoke-selection-harness.ts:197-199 — CLASS 1 (pre-satisfied, positive-control shaped). After a wheel event: `awaitSnapshot((c) => markerHasBackground(c, 'directory-15', focusedSelectionColor))`. The marker already had that background before the wheel; a stale pre-wheel frame passes "wheel moves the viewport while the highlight travels" with no scroll having happened. No model path — contributor state (file-tree rows). Proposal: also require evidence the viewport moved (top tree row text changed) in the same predicate.
3. smoke-selection-harness.ts:315-317 — CLASS 1. Same wheel pattern on 'commit-14' (commit-log list). Pre-satisfied; cannot see a no-op scroll. No model path — contributor state. Same proposal as (2).
4. smoke-selection-harness.ts:185-188 — CLASS 1. After a hover move: wait 'directory-15' still has focusedSelectionColor — true before the hover, and no fence proves the hover was processed, so "hover leaves the item selection anchored" can pass before the hover arrives. No model path — contributor state. Proposal: first wait for the hover decoration to paint on 'directory-05', then assert the selection background.
5. smoke-selection-harness.ts:266-268 — CLASS 1. After `clickMarker(driver, snapshot, 'file-10.txt')`: wait `markerHasBackground('file-10.txt', unfocusedSelectionColor)` — the identical condition was already awaited at lines 233-237 before the click, so it is true when issued; the click's effect (the file opening) is never observed. This harness has no TUI_STATUS_PATH; adding one enables `awaitValue(statusPath, 'workspaceSet.active...', ...)` waits on the opened buffer.
6. smoke-selection-harness.ts:209 and 284 — CLASS 2 (proxy). `driver.sendKeys('Control+Shift+j'); await driver.awaitScreenChange();` (and the same after 'Control+g') — any repaint satisfies the fence for a focus change. Proposal: `await GraphClient.Class.awaitValue(statusPath, 'workspaceSet.active.focus', <target>)` (path evidence AppStatusProjection.ts:165-168); needs the status env added to this harness.
7. smoke-move-line-harness.ts:46-48 — CLASS 1. In `runCommand`: after `sendText(commandTitle)`, `awaitSnapshot((s) => s.findText(commandTitle) !== null)` — the palette INPUT ECHO paints the same title, so the wait passes before the command list filters; the following Enter can activate whatever row is still selected. Proposal: `await GraphClient.Class.awaitValue(statusPath, 'commands.query', commandTitle)` (evidence AppStatusProjection.ts:139) — harness needs TUI_STATUS_PATH.
8. smoke-move-line-harness.ts:92-93 — CLASS 2. `driver.sendKeys('Tab'); await driver.awaitScreenChange();` — repaint proxy for a focus move. Proposal: `awaitValue(statusPath, 'workspaceSet.active.focus', 'editor')` (AppStatusProjection.ts:165-168).
9. smoke-media-harness.ts:227-230 — CLASS 1. `openCommand` waits `snapshot.text().toLowerCase().includes(query)` after typing the query — satisfied by the input echo before the list filters; Enter races the filter. Proposal: `awaitValue(statusPath, 'commands.query', query)` (AppStatusProjection.ts:139); statusPath already exists in this harness's arms.
10. smoke-search-mouse-harness.ts:302-305 — CLASS 1. `sendText('Open Folder')` then wait `findText('Open Folder')` — input echo pre-satisfies (and the resting list may show 'Workspace: Open Folder', src/modules/commands/CommandDefaults.ts:21). Proposal: `awaitValue(statusPath, 'commands.query', 'Open Folder')`.
11. smoke-text-input-harness.ts:292-295 — CLASS 1. Same 'Open Folder' echo pattern. Same proposal.
12. smoke-openproject-harness.ts:74-81 — CLASS 1. Same 'Open Folder' echo pattern (sendText then findText('Open Folder')). Same proposal.
13. smoke-text-input-harness.ts:83-89 — CLASS 1 (pre-satisfied positive control on its first use). `exerciseSharedInput` sends an inert Ctrl+C then waits `status.lastCopyChars === 0` — on the first surface lastCopyChars is already 0 (nothing ever copied), so the wait is true when issued and cannot prove the copy attempt was processed; "unselected copy is inert" is unfalsifiable there. (Later surfaces get a real 2→0 transition only if the app publishes 0 on inert copies.) Proposal: publish a copy-ATTEMPT counter beside lastCopyChars (set at src/modules/app/Bootstrap.ts:2134) and wait on its increment.
14. smoke-search-mouse-harness.ts:154-159 — CLASS 1 (low). Wait `status.quickOpenSelected === 0` to prove hover left the selection unchanged — true before the hover; cannot fail. Saved in practice by the grid wait at 150-153 that fences hover processing; keep that fence mandatory or fold both into one predicate.
15. smoke-mode-coherence-harness.ts:34-36 (call site 233-238) — CLASS 1. `assertOnlyOverlay(..., 'boundedListPopup', 'document.txt')` waits `findText('document.txt')` — that text is painted in the file tree and the buffer tab BOTH before and after the popup opens; the grid arm is pre-satisfied (the status arm in the same helper does the real work). Proposal: key the grid wait on popup-only text, or drop it — `status.inputOverlay === 'boundedListPopup'` already covers it.
16. smoke-word-delete-harness.ts:51-53 — CLASS 1. After Enter on the tree row: `awaitSnapshot((s) => s.text().includes('word-delete.txt'))` — the exact needle the PREVIOUS wait (lines 46-48) used for the tree row; pre-satisfied, returns a stale frame. Proposal: wait `String(status.activeBuffer).endsWith('/word-delete.txt')` (the file is empty, so no content needle exists).
17. smoke-word-delete-harness.ts:60-64 — CLASS 1 (weak polarity). 'the opened word-delete buffer is published' waits `typeof status.activeBuffer === 'string'` — pre-satisfiable by any prior string value; existence checked, identity not. Proposal: `endsWith('/word-delete.txt')`.
18. smoke-quickopen-harness.ts:173-175 — CLASS 1 (candidate). After typing 'widget': wait `findText('src/widget.txt')` — with the empty query Quick Open lists all files, so the needle can be painted before the filter applies (small fixture, 60x15 dialog); Enter races the filter. Proposal: wait `status.quickOpenQuery === 'widget'` plus the selected identifier, as the later arms of this same smoke already do (lines 205-213).
19. smoke-quickopen-harness.ts:214-219 — CLASS 1 (candidate). Grid wait for 'TASK.md' and 'project.tasks.md' — both basenames are also file-tree rows painted before and after; the wait can pass on tree text even if the dialog never painted them (occlusion at 60x15 uncertain). The preceding status wait carries the arm; scope the grid read to the dialog bounds (`status.overlayDialogBounds.quickOpen`, used elsewhere in this file at lines 99-136).
20. smoke-tabs-harness.ts:200-203 — CLASS 1 (vacuous negative). Escape-close wait keys on `findText('Open Buffers') === null`, but no wait ever proved 'Open Buffers' painted while open (open was proven via status only). The needle is real (src/modules/ui/TabBar.ts:217), but if the title regressed this wait passes instantly — a check that can only fail toward pass. Proposal: wait `status.boundedListPopupOpen === false` (field exists; awaited true at lines 193-197).
21. smoke-tabs-harness.ts:216 — CLASS 2. Ctrl+PageUp cycle loop fenced by `awaitScreenChange()` — the model states the condition. Proposal: wait `status.activeBufferIndex === expectedIndex` each step (field already used at lines 149-167).
22. smoke-paste-harness.ts:197, 209, 287, 430, 481 — CLASS 2. `awaitScreenChange()` after Ctrl+C as a stand-in for "the shell prompt reset" — any repaint (e.g. an unrelated blink) satisfies it. No model path — contributor state (child-PTY shell output). Proposal: grid condition on the fresh prompt (e.g. prompt-glyph count increases in the terminal pane window).
23. smoke-paste-harness.ts:229 — CLASS 2 (documented tradeoff). `awaitScreenChange()` after a chunked paste; the comment claims quiescence but first-change is not quiescence. Low priority: byte-exactness is separately proven by the gated `wc -c` wait at 231-236.
24. smoke-paste-harness.ts:468-471 — CLASS 5 (transient). Waits for the MID-animation state (`findText('printf ANI') !== null && findText('ANIMATING_x…full') === null`) — a state that appears and disappears; if the staged typing completes between sampled frames the condition is never observed and the wait times out. Proposal: `awaitTransition` on the pane text (partial-then-full).
25. smoke-search-mouse-harness.ts:201 and 264 — CLASS 6. Bare `driver.snapshot()` for Find-bar button geometry right after status-only waits; the counter repaint may not have landed and the geometry read can be stale. Proposal: take the snapshot from an `awaitGridCondition` that names the widget and counter text.
26. smoke-voice-picker-harness.ts:52 (clickWidget, used at 207/234/264) and 216/246 — CLASS 6. Bare `driver.snapshot()` for widget/row geometry, at 216/246 directly after `awaitStatusWithoutFrame` (model can lead the grid). Proposal: derive geometry from an `awaitGridCondition` naming the row label AND the widget glyph.
27. smoke-workspace-layout-isolation-harness.ts:381-385 — CLASS 6. Bare `driver.snapshot()` to locate the '+' workspace button on row 0 after status-only waits (right after hiding the primary dock, whose repaint may not have landed). Proposal: `awaitGridCondition` for '+' present in row 0, use that snapshot.
28. smoke-workspace-layout-isolation-harness.ts:104-131 — CLASS 6 (adjacent). Activity-bar clicks use HARD-CODED rows "on a settled 120x40 boot grid" with no wait proving those rows paint those items; a layout change silently clicks the wrong item (the following status waits would then time out — loud, so low severity).
29. smoke-sdk-extraction-harness.ts:77-80 — CLASS 6 (adjacent). One-shot `!existsSync(staleExtractionDirectory)` right after the ready wait; if reaping is asynchronous relative to ready publication this races. Proposal: bounded poll on non-existence (condition, not one sample).
30. smoke-wrap-harness.ts:367 — CLASS 2. `awaitScreenChange()` after the continuation-row click, before typing 'X' — repaint proxy for caret placement. Proposal: grid condition `snapshot.cursorRow === continuationRow` (the native cursor is already the oracle two lines later).
31. smoke-reserved-chord-harness.ts:170-172 — CLASS 1 (locate-only, low). `awaitSnapshot(findText('RESERVED-CHORD-TASK'))` — painted since boot (awaited at 87-91), pre-satisfied; used only for click coordinates, and can hand back a frame from before the Settings overlay finished closing. Proposal: gate on `status.settingsOpen === false` AND the text visible in one predicate (the status wait exists at 159-162; fold them).

Notes, not counted: smoke-paste-harness.ts:66-74 `Bun.sleep(1)` between paste chunks is pacing to force chunk boundaries, not a wait for a condition — left alone. Stale-needle checks done: 'Open Buffers' (src/modules/ui/TabBar.ts:217), 'Open Project Folder' (src/modules/ui/OverlayLayer.ts:1298), 'Workspace: Open Folder' (src/modules/commands/CommandDefaults.ts:21) — all still painted; no rot found. No `renderQuiescent` waits exist in this set (grep clean).

### Batch 7 counts per class

- Class 1 (pre-satisfied): 18 — of which 4 are pre-satisfied positive controls (tabs:245, selection:197, selection:315, text-input:83; search-mouse:154 is a fifth, fenced in practice)
- Class 2 (proxy/repaint): 7 findings (selection x2 lines, move-line, tabs, paste x5 lines counted as one + the documented one, wrap)
- Class 3 (sleep as sync): 0
- Class 4 (stale needle): 0 (three literals verified live)
- Class 5 (transient/blink): 1 (paste:468)
- Class 6 (unsynchronized read): 5 (+2 adjacent noted)

### Coverage

All 19 assigned files opened and read in full: smoke-indent-guides, smoke-media, smoke-mode-coherence, smoke-move-line, smoke-openproject, smoke-paste, smoke-quickopen, smoke-quit-confirmation, smoke-reserved-chord, smoke-sdk-extraction, smoke-search-mouse, smoke-selection, smoke-shortcut-help, smoke-tabs, smoke-text-input, smoke-voice-picker, smoke-word-delete, smoke-workspace-layout-isolation, smoke-wrap. 0 files not opened. Clean (no findings): smoke-indent-guides, smoke-quit-confirmation, smoke-shortcut-help.
## Batch 4 — overlay, markdown, tasks, remaining shell

### scripts/harness/smoke-overlay-dialog-harness.ts

- smoke-overlay-dialog-harness.ts:1184-1185 (same shape at 1207+1212) — class 1 (PRE-SATISFIED WAIT). As written: `driver.resize(120, 40); await clickStatusMarker(driver, '?')` — clickStatusMarker's `awaitGridCondition('status control ? is visible', ...)` (lines 83-86) keys on status-bar chrome painted BOTH before and after the resize, so it can return the pre-resize frame and compute a stale click column/row. Why: the condition is already TRUE when issued; the awaited change is the resize, which the condition never observes. Proposal: gate on the published size first — the file's own idiom at lines 1089-1099 (`awaitStatusPublication(... status.width === 120 && status.height === 40)`) — or add `candidate.columns === expectedColumns` to the grid condition. No graph path for terminal size: the `view` port exposes only panelViewportColumns/Rows (src/modules/app/AppStatusProjection.ts:556-560).
- smoke-overlay-dialog-harness.ts:1308-1309 — class 2 (PROXY WAIT). As written: `driver.resize(100, 32); await driver.awaitScreenChange();` — waits for any repaint when the model states the actual thing. Proposal: `awaitStatusPublication(statusPath, ..., (s) => s.width === 100 && s.height === 32)` exactly as this file already does after its other resizes (e.g. lines 1089-1099).
- smoke-overlay-dialog-harness.ts:1339-1344 — class 1 (PRE-SATISFIED WAIT). As written: `awaitGridCondition('the changed status action settles before its restoring press', rowText includes ' ❯ ' or ' ✦ ')` — both glyphs are standing status-bar content icons (src/modules/terminal/TerminalPaneContent.ts:63 `readonly icon = '❯'`, src/modules/agent/AgentPaneContent.ts:82 `readonly icon = '✦'`) painted before AND after the visibility change awaited at 1332; the wait can hand a stale frame to discoveredOutsideActionPosition. Why: the condition cannot distinguish the settled post-change frame from the frame before the click. Proposal: key the settle wait on what the visibility change actually moves (panel region border present/absent in the frame), the model half being already covered by the preceding awaitStatusPublication; no additional graph path needed.
- smoke-overlay-dialog-harness.ts:1652-1655 — class 1 (PRE-SATISFIED WAIT). As written: `awaitGridCondition('the confirmation paints its single-token close anchor', sharedCloseGlyphs.some((glyph) => candidate.findText(glyph) !== null))` — the shared panelClose glyphs paint on standing chrome (tab/panel close controls) before the confirmation opens, so the whole-screen findText is TRUE on a stale frame; discoveredClosePosition('Confirm') then throws on a frame without the dialog. Proposal: scope the scan to the published confirmation bounds exactly as dismissOutsideAndRequireConsumed does at lines 580-589, or wait on `candidate.findText('Confirm') !== null`.

### scripts/harness/smoke-markdown-harness.ts

- smoke-markdown-harness.ts:1744-1747 — class 6 (UNSYNCHRONIZED READ). As written: `requireCondition(readStatus(statusPath).markdownPaneFocus === 'source', 'auto-open keeps the keyboard on the source pane')` — a bare readStatus assert on a field no prior wait covered (the open wait at 1693-1701 checks activeBuffer/previewOpen/side only). Why: if the paneFocus publication lags the grid wait, the assert reads a stale value and fails red. Proposal: `awaitStatus(... status.markdownPaneFocus === 'source')` — the same field is awaited elsewhere in this file (e.g. line 2239-2244).
- Note (not a defect): the wheel-settle waits on `workspaceScrollMomentumAtRest`/`contributedSurfaceAnimationAtRest` (1474-1481, 1513-1520, 2660-2667, 2694-2701) are sound — both flags derive live from activity (`!...IsActive`, src/modules/app/Bootstrap.ts:1660,1670), unlike renderQuiescent.

### scripts/harness/smoke-markdown-view-mode-harness.ts

- No findings. Every wait is a model-condition awaitStatus or a grid condition FALSE before its action.

### scripts/harness/smoke-tasks-dashboard-harness.ts

- smoke-tasks-dashboard-harness.ts:846-848 — class 6 (UNSYNCHRONIZED READ). As written: `const cycleStopPosition = driver.snapshot().findText('■')` immediately after `awaitStatus(... status.tasksLens === 'live')` — the stop glyph replaces '▷' only when cycling starts, and no grid wait orders the paint before the read; a lagging frame throws 'The cycle stop control disappeared after start'. Proposal: `await driver.awaitGridCondition(..., (s) => s.findText('■') !== null)` and take the position from that snapshot (the tooltip wait at 855-858 arrives too late to protect the position read). The glyph is live vocabulary (Stop/Start strings and controls in src/modules/tasks-dashboard/TasksDashboardPaneRenderer.ts).

### scripts/harness/smoke-tasks-harness.ts

- No findings. All waits are model conditions or first-appearance grid needles; the post-close readStatus at line 296 is ordered by closePanelContentsListRow's own terminal awaitStatus (scripts/harness/HarnessSmoke.ts:291-300).

### scripts/smoke-markdown.sh

- smoke-markdown.sh:38 (used at 99, 118, 163, 177, 190, 252) — class 1 (PRE-SATISFIED POSITIVE CONTROL, the known defective idiom). As written: `settle() { "$HARNESS" settle "$SESSION_NAME" 8 ...; }` — tui-harness.sh's settle verb waits on `renderQuiescent=true` (scripts/tui-harness.sh:107), a flag set true at src/modules/system/StatusChannel.ts:97 and never reset; after the first frame every settle returns instantly and cannot fail. The instrument proves nothing.
- smoke-markdown.sh:98,114,117,127,138,146,162,176,187,189,208,209,212,214,223,234,245,251 — class 3 (SLEEP as synchronization), 18 sites. As written: `sleep 0.4..1.2` between an input and a `field ...` read, for conditions the status file states exactly (markdownPreviewOpen, markdownHoveredReference, activeBuffer, markdownSplitRatio, markdownPreviewSelectionChars, lastCopyChars, bufferRevision, markdownPaneFocus, sourceFindQuery/markdownPreviewFindQuery/findMatchCount). Why: each field read after a fixed sleep is a race; under gate load these are the flake class. Proposal: replace each sleep+read with a bounded poll of the same status field until the expected value (or port the script onto the TS harness's awaitStatus, which its sibling smoke-markdown-harness.ts already does for every one of these conditions).

### scripts/smoke-tasks-dashboard.sh

- No findings. Three-line exec wrapper around the TS harness; no waits of its own.

### scripts/smoke-panel-split.sh

- smoke-panel-split.sh:49,59,81,95,118,129 — class 1 (PRE-SATISFIED POSITIVE CONTROL, known defective idiom) collapsing into class 6. As written: `"$H" settle "$S"` is the renderQuiescent no-op (scripts/tui-harness.sh:107; flag set once at src/modules/system/StatusChannel.ts:97), and it is the ONLY ordering between each chord/click/drag and the `chk`/`f` field reads that follow (panelCellIds at 51/60/130, panelFocusedIndex at 52/61/96/131, panelCellColumns at 53/62/119/132) — so every one of those reads is effectively unsynchronized. Proposal: `await GraphClient.Class.awaitValue(statusPath, 'panelHost.orderedContents.length', <n>)` and sibling panelHost paths — path evidence: scripts/harness/smoke-panel-chrome-harness.ts:288-333 uses 'panelHost.orderedContents.length', 'panelHost.spaces.length', 'panelHost.activeSpace.contentIds.length'; root evidence: panelHost in statusProjectionPorts near src/modules/app/Bootstrap.ts:1402. For a shell script, the minimal fix is a bounded poll of the same status fields.
- smoke-panel-split.sh:55,98 — class 3 (SLEEP as synchronization). As written: `sleep 0.6` to "let the shell print its first prompt" and after `stty size` before grepping the capture. Both stand in for a screen condition (prompt painted; `<rows> <cols>` output painted). Proposal: poll `"$H" capture` for the expected pattern with a deadline.

### scripts/smoke-activitybar.sh

- smoke-activitybar.sh:35 (13 call sites) — class 1 + class 3 combined. As written: `settle() { sleep 0.35; "$harness" settle "$session_name" 12 ...; }` — the settle half is the renderQuiescent no-op (scripts/tui-harness.sh:107; src/modules/system/StatusChannel.ts:97), so the real synchronization is the bare 0.35s sleep; every field/frame assertion in the script rides it. Proposal: poll the status field named by each following assertion (sidebarView, showActivityBar) and, for frame claims, re-dump and poll the frame for the expected glyph/accent.
- smoke-activitybar.sh:47 — class 3 (SLEEP as synchronization). `send_kitty` embeds `sleep 0.3` after each chord (6 uses) in place of the sidebarView condition the very next line reads. Same proposal.
- smoke-activitybar.sh:155,177 — class 4 (STALE NEEDLE), CONFIRMED. As written: `expect_frame_contains 'Space/Enter installs or' ...` — the app paints '   Space/Enter changes state · Enter again restarts to apply' (src/modules/plugins/ExtensionsPaneContent.ts:76). Both sites fail on every run (they increment failure_count, so this smoke cannot ALL-PASS until the needle is updated). Proposal: change the needle to 'Space/Enter changes state'.
- Needle audit for the rest of the batch found no other rot — verified live: 'Preview' pane title (src/modules/markdown/MarkdownSplitView.ts:100), 'External link — not opened here' and 'Link target not found' (src/modules/markdown/MarkdownPreviewContent.ts), 'Keyboard Shortcuts' (src/modules/ui/OverlayLayer.ts), 'history:' (src/modules/git/GitPaneRenderer.ts), tasks-dashboard strings 'No task system', 'Start/Stop automatic lens cycling', 'Open the latest report', 'Builder tmux session is missing' (src/modules/tasks-dashboard/TasksDashboardPaneRenderer.ts), 'Ask Claude' (src/modules/agent/AgentTranscriptProjection.ts:28).

### Batch 4 per-class counts

- Class 1 (pre-satisfied): 6 findings — 3 in smoke-overlay-dialog-harness.ts, plus the renderQuiescent settle idiom in all 3 wait-bearing shell scripts (smoke-markdown.sh, smoke-panel-split.sh, smoke-activitybar.sh); the shell settle verb is a pre-satisfied POSITIVE CONTROL that cannot fail.
- Class 2 (proxy wait): 1 (smoke-overlay-dialog-harness.ts:1309 awaitScreenChange after resize)
- Class 3 (sleep as synchronization): 4 findings covering 27 sleep sites (smoke-markdown.sh x18, smoke-panel-split.sh x2, smoke-activitybar.sh settle-sleep x13 uses + send_kitty x6 uses)
- Class 4 (stale needle): 1 (smoke-activitybar.sh:155,177 — the known finding, confirmed; no others found)
- Class 5 (transient/blink): 0
- Class 6 (unsynchronized read): 2 standalone (smoke-markdown-harness.ts:1745, smoke-tasks-dashboard-harness.ts:846) + the smoke-panel-split.sh field reads folded into its settle finding

Coverage: all 9 assigned files opened and read in full (smoke-overlay-dialog-harness.ts, smoke-markdown-harness.ts, smoke-markdown-view-mode-harness.ts, smoke-tasks-dashboard-harness.ts, smoke-tasks-harness.ts, smoke-markdown.sh, smoke-tasks-dashboard.sh, smoke-panel-split.sh, smoke-activitybar.sh). Supporting sources consulted for verification only: tui-harness.sh, HarnessSmoke.ts, GraphClient.ts, smoke-panel-chrome-harness.ts, StatusChannel.ts, Bootstrap.ts, AppStatusProjection.ts, and the painting sources named above. 0 files not opened.
