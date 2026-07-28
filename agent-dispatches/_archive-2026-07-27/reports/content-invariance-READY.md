# Content invariance — READY

Branch: `refactor-content-invariance`  
Commit: `5615bee` (`Refactor frame silence into content invariance`)  
Dispatch base: `df27d46` (the then-current `origin/main`)

The worktree is clean. `git ls-files | grep '^TASK'` returns no matches.

## API

`PtyTestDriver.assertContentInvariantAcrossAction(options)` is the single new
public assertion:

```ts
interface ContentInvarianceOptions {
  invariantRegion: HarnessGridRegion;
  changedRegion: HarnessGridRegion;
  actionDescription: string;
  performAction: () => void | Promise<void>;
}
```

It:

1. validates and captures both required grid regions;
2. performs the action;
3. uses the existing named `awaitGridCondition` until the changed region's
   exact character content differs;
4. fails unless the invariant region's exact character content is unchanged;
5. returns the completed snapshot.

There is no timeout, duration, frame-count, or ordinal option on this API.
Character content is compared rather than focus/color attributes, so a
legitimate focus repaint does not falsify a content-stability claim.

`awaitGridCondition` now rechecks named conditions between frames. This lets an
exact status endpoint such as momentum-at-rest terminate an action even when
the final state publication emits no terminal bytes. The frame tick publishes
`workspaceScrollMomentumAtRest` and `panelScrollMomentumAtRest` for those
endpoints.

The retired APIs have zero TypeScript AST matches:

- `assertNoCompleteFrameEmittedFor`
- `awaitFrameSilence`
- `assertAtMostOneCompleteFrameEmittedFor`

## Per-site migration

| Site | What the old window was protecting | Load-independent expression |
| --- | --- | --- |
| `smoke-agent-engine-switch-harness.ts` | Per-feature idle frame budget after switching engines. | Removed as a duplicate. The single `idle-quiescence` behavioral contract remains authoritative; engine title/provider state assertions remain. |
| `smoke-agent-harness.ts` | Per-feature idle frame budget after the agent turn. | Removed as a duplicate of `idle-quiescence`; completed-turn content and status assertions remain. |
| `smoke-agent-pane-ux-harness.ts` | Composer chrome should not move while transcript wheel input scrolls; plus a duplicate idle budget. | Required invariant region = complete composer row; required changed region = transcript body. Scroll-top/tail-anchor conditions prove the endpoint. Duplicate idle budget removed. |
| `smoke-agent-permissions-harness.ts` | Per-feature idle frame budget after the permissions flow. | Removed as a duplicate of `idle-quiescence`; permission lifecycle/status assertions remain. |
| `smoke-agent-search-harness.ts` | Per-feature idle frame budget after transcript search. | Removed as a duplicate of `idle-quiescence`; search query/match/render assertions remain. |
| `smoke-audio-narration-harness.ts` | Ordinary typing should change only the composer and must not count as barge-in; plus a duplicate idle budget. | Required invariant region = upper transcript; required changed region = lower composer. The typed glyph and unchanged barge-in count are asserted. Duplicate idle budget removed. |
| `smoke-clipboard-frame-boundary-harness.ts` | Clipboard emission had to occur at a real active/idle boundary; transcript anchors had to settle. | Panel activity uses exact at-rest/active status, terminal activity uses changing grid content, and transcript top/bottom use semantic anchor conditions. The raw OSC 52 audit still proves every emission begins outside synchronized frames and other control sequences. |
| `smoke-editor-harness.ts` | An untouched selection was expected to survive a window; an optional short settle followed tree open; a duplicate idle budget remained. | Selection survival is proven by the published selection and successful copy, not elapsed time. Tree-open progress is proven by tab-count/focus conditions. Duplicate idle budget removed. |
| `smoke-find-harness.ts` | A swallowed post-action silence tried to make a terminal-dependent replace-all chord settle. | The unsound replace attempt was removed. Ctrl+H visibly opens replace mode and Escape visibly closes it. Replace-all mutation remains driven through the real mouse control in `smoke-search-mouse-harness.ts`. |
| `smoke-git-blame-harness.ts` | Earlier precedent: a 600 ms window incorrectly rejected GitWatcher's legitimate reconcile repaint. | Already replaced on the base branch by the semantic blame-state assertion; reclassified into the pool here. |
| `smoke-git-watch-harness.ts` | Attempting to open a confined untracked directory symlink should not crash. The action is intentionally a no-op. | No false changed-region claim was invented. The smoke attempts the open, proves Quick Open remains live, and proves the Git changed count remains published. |
| `smoke-horizontal-extent-harness.ts` | Initial file paint and the 80-event horizontal glide were sampled only after repeated 200 ms silence windows. | Quick Open waits for the exact query/match condition. Required invariant region = `Files` heading; required changed region = editor viewport. The action terminates at a positive workspace-momentum resting clamp. |
| `smoke-hover-harness.ts` | A 200 ms negative window claimed the hover must not appear before dwell completion. | Removed as scheduler-load measurement, not hover behavior. The positive named condition still requires the completed dwell to paint the server answer/type. |
| `smoke-markdown-harness.ts` | Selection release was followed by silence and repeated equal status samples before copy. | Release is followed immediately by copy; one named status condition requires copied characters to equal the completed preview selection and not regress from the pre-release selection. |
| `smoke-overlay-dialog-harness.ts` | Dialog scrollbar paint was sampled after idle silence; wheel result was sampled after another silence. | Scrollbar paint is a named precondition. Required invariant region = content outside/top of the dialog; required changed region = dialog interior. The compared dialog row must move. |
| `smoke-panel-chrome-harness.ts` | F8 panel-open results at 120×40 and 88×24 were sampled after silence. | Required invariant region = rendered `Files` heading; required changed region = lower panel rows. The named terminal-panel status terminates each open. |
| `smoke-settings-applied-harness.ts` | Notch/fling measurements and visual-setting snapshots used fixed sleep plus silence as a proxy for final state. | Editor notch/fling/horizontal routes use stable top chrome, changed editor content, and exact workspace momentum-at-rest. Tree scrollbar drives use stable top chrome and changed tree content. Static snapshots wait for the active filename or fixture tree rows. |
| `smoke-terminal-follow-harness.ts` | Commands expected not to create an assistant response waited through a 250 ms silence window. | Required invariant region = agent/left pane; required changed region = terminal/right pane. The real Bash boundary must advance while assistant entry count remains unchanged. |
| `smoke-terminal-harness.ts` | Momentum reversal was followed by a silence settle; terminal-open idle had another frame budget. | The reversal path directly proves direction reversal and that the terminal remains above the live bottom. The duplicate terminal idle budget was removed in favor of `idle-quiescence`. |
| `smoke-tree-scroll-harness.ts` | Tree wheel momentum was sampled after silence before selection/click assertions. | Required invariant region = editor; required changed region = tree. The wheel train terminates when the final file-tree row is visible; the following click must preserve the exact final scroll offset. |
| `smoke-word-delete-harness.ts` | Repeated word deletion waited 300 ms before inspecting text/cursor. | Required invariant region = file-tree portion of the row; required changed region = editor text. Exact rendered text and cursor-at-line-start assertions remain. |

## Removed claims and coverage deltas

`coverage-deltas.md` records every decrease. The removed claims are:

- duplicate per-feature idle frame budgets in agent, engine switch, agent pane,
  permissions, search, audio, editor, and terminal smokes;
- the old synchronized-output silence unit assertion;
- the editor untouched-selection interval;
- the terminal-dependent find replace-all attempt;
- Git watch's no-op symlink-open silence claim;
- the hover sub-dwell scheduler window;
- silence waits superseded by copy/content conditions in Markdown, word delete,
  audio, and find.

No replacement was invented for a no-op action. Git watch is the explicit
unsound-action case; the coverage delta names the surviving liveness proof.

## Gate classification and measured payoff

Measurements used `SKIP_PERF=1 bash scripts/merge-gate.sh`.

| Measurement | Parallel pool | Quiet jobs / phase | Total | Exit |
| --- | ---: | ---: | ---: | ---: |
| Before (`df27d46`) | 31 jobs, 0m53s | 23 jobs, 3m57s | **5m01s** | 0 |
| After (`5615bee`) | 52 jobs, 0m50s | 2 jobs, 1m20s | **2m21s** | 0 |

The measured wall-clock fell by 2m40s (about 53%, or 2.1× faster). The pool
time stayed effectively flat; moving 21 jobs removed 2m37s from the serial
phase. The two remaining quiet jobs are the single behavioral-contract suite
and the true terminal-stage duration smoke. Input-byte-flush still follows the
tail, as designed.

The before run had one masked retry (`pixel-preview`). The first after run had
one masked retry in the untouched `panel-split` smoke, so it is an exit-0
measurement but not a retry-free claim.

Two additional audit runs were kept rather than hidden:

- 2m21s, exit 1: untouched `gutter-diff` fixture `git commit` exited nonzero
  with empty stderr; `mode-coherence` also used one timeout retry.
- 7m12s, exit 1 after explicit cleanup: the pool stalled for more than five
  minutes in `smoke-paste-harness.ts` immediately after proving the 65,536-byte
  payload size. The child was nearly idle and the pool made no progress. This
  is the task's explicitly out-of-scope PTY-backpressure class; no wait or
  assertion was converted. All other 51 pool jobs passed and the retry tally
  was zero.

## Verification

| Command / drive | Exit / result |
| --- | --- |
| `bunx tsc --noEmit` | 0 |
| `bun test` | 0 — 1,341 pass, 0 fail |
| `bun scripts/check-file-grammar.ts` | 0 — 0 violations |
| invariant checker `--all` | 0 |
| invariant checker `--all --refs` | 0 — 690 annotations resolved, 0 problems |
| `bash scripts/conventions-gate.sh` | 0 |
| `bun scripts/check-coverage-ratchet.ts` | 0 — no undeclared decrease |
| `bash scripts/behavioral-contracts.sh` | 0 — `idle-quiescence` stayed green, frame 2 → 2 over 3 seconds |
| 21 reclassified smokes, loaded pool of six | Three green runs per smoke; horizontal extent additionally passed three concurrent post-fix runs |
| Shared `dragBetweenCells` consumer `smoke-paste-harness.ts` solo/three-process repair drive | 0 before the separately observed loaded 64 KB PTY stall |
| `git diff --check` | 0 |
| retired API AST censuses | 0 matches |

The invariant records now derive content invariance from “waits observe
conditions, not frame ordinals,” include full Scope fields, separate the single
idle-efficiency contract from action stability, and reserve the serial tail for
real duration measurements.
