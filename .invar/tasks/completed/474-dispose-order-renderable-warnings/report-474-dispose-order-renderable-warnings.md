# READY — Task 474 dispose-order renderable warnings

## In plain words

Invar removed each screen part from its parent, then asked OpenTUI to remove the same part again.
I left recursive destroy as the single removal action and added a real quit smoke.
The mirror teardown now exits cleanly with zero warnings at 10 and 100,000 lines.

## Result

Status: READY

Commit: `8fb6db5e` (`Stop removing renderables twice during shutdown`)

The worktree is clean.

## Reproduction and cause

I used the shared scale fixture with default settings.
I opened its file through Quick Open, then stopped the app through `PtyTestDriver.dispose()`.
This is the same signal-driven path used when a mirror server stops.

| Fixture | Baseline warnings | Fixed warnings | Exit code |
| --- | ---: | ---: | ---: |
| 10 lines | 12 | 0 | 0 |
| 100,000 lines | 12 | 0 | 0 |

The 12 baseline warnings named these renderables:

- `editor-gutter` and `editor-code`
- `root-column`
- `bounded-list-popup`, its backdrop, and its close button
- `completion-popup`, its backdrop, and its close button
- `agent-skill-popup`, its backdrop, and its close button

OpenTUI's `destroyRecursively()` calls `destroy()`.
That method removes the renderable from its current parent.
The affected Invar disposers first called `parent.remove(child)`, then called `child.destroyRecursively()`.
The second operation produced each warning.

## Changes

- [SourceTextPaneContent.ts](../../../../src/modules/editor/SourceTextPaneContent.ts) now destroys the gutter and code renderables directly.
- [RootView.ts](../../../../src/modules/ui/RootView.ts) now destroys the root column directly.
- [BoundedListPopup.ts](../../../../src/modules/ui/BoundedListPopup.ts) now destroys its popup box directly.
- [ModalOverlayDismissal.ts](../../../../src/modules/ui/ModalOverlayDismissal.ts) now destroys its backdrop directly.
- [OverlayCloseButton.ts](../../../../src/modules/ui/OverlayCloseButton.ts) now destroys its close renderable directly.
- [smoke-renderable-disposal-harness.ts](../../../../scripts/harness/smoke-renderable-disposal-harness.ts) drives both scales and requires zero warnings.
- [merge-gate.sh](../../../../scripts/merge-gate.sh) registers the new smoke in the always-run smoke set.

## Invariant review

The filed [round-one brief](brief-474-1-dispose-order-renderable-warnings.md) named two records.
Path and content scope added the app, source-text, and harness records below.
No verdict needed a downgrade.

| Record | Verdict | Evidence |
| --- | --- | --- |
| [Modal outside presses dismiss and consume](../../../../src/modules/ui/ui.invariants.md#modal-outside-presses-dismiss-and-consume) | strengthened | The popup, backdrop, and close button keep one dismissal owner and one destroy action. |
| [The render loop never wedges](../../../../project.invariants.md#the-render-loop-never-wedges) | upheld | Both disposal drives exited with code 0. |
| [Owned resources release in reverse order](../../../../src/modules/app/app.invariants.md#owned-resources-release-in-reverse-order) | strengthened | Child renderables detach once before renderer destruction. |
| [The source text editor is a pane content citizen](../../../../src/modules/ui/ui.invariants.md#the-source-text-editor-is-a-pane-content-citizen) | strengthened | The pane still releases its views, gutter, and code through its own dispose seam. |
| [Harness input and output use the real PTY](../../../../scripts/harness/harness.invariants.md#harness-input-and-output-use-the-real-pty) | upheld | The smoke boots the real entry and observes the PTY output stream. |
| [Harness output history stays bounded](../../../../scripts/harness/harness.invariants.md#harness-output-history-stays-bounded) | strengthened | The smoke registers its warning counter before output can trim. |
| [Harness waits observe conditions not frame ordinals](../../../../scripts/harness/harness.invariants.md#harness-waits-observe-conditions-not-frame-ordinals) | upheld | The smoke waits for named paint and Quick Open conditions. |

The brief's invariant map missed `Owned resources release in reverse order` and `The source text editor is a pane content citizen`.
It also missed the three harness records required by the new smoke.

## Positive control

I planted one redundant `root.remove(column)` before `column.destroyRecursively()`.
The new smoke exited 1 at the 10-line case with this failure:

```text
FAIL scale 10: disposal emits zero renderable-removal warnings (observed 1)
```

I removed the plant.
The smoke then passed both scales with `observed 0`.

## Verification

- `bun scripts/harness/smoke-renderable-disposal-harness.ts` — ALL-PASS after commit, 0 warnings at both scales.
- Focused tests — 25 passed, 0 failed, 75 expectations across four touched test files.
- `bun test` — 2,353 passed, 0 failed, 72,111 expectations across 353 files.
- `bunx tsc --noEmit` — `TSC=0`.
- `bash scripts/conventions-gate.sh` — PASS. It reported 20 known legacy grammar items in report-only modules.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all` — PASS.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --refs` — 1,367 annotations and 266 lattice links resolved, 0 problems.
- `git diff --check` — PASS.

The first commit attempt started the hook's full merge gate and ended before completion.
I made no claim from that partial run.
The final commit used `SKIP_GATE=1`, as the [task brief](brief-474-1-dispose-order-renderable-warnings.md) requires.

## PTY usability

`PtyTestDriver.outputSequenceCount()` made teardown warnings countable across the bounded output stream.
`PtyTestDriver.dispose()` reproduced the mirror stop path in less than one second at both scales.

The first probe passed a file path as the workspace root.
The app correctly showed its welcome screen with no open files, so that paint condition timed out.
Using the fixture directory plus the shared Quick Open helper removed that probe error.

## Bycatch

- Suspect: [DiffView.ts](../../../../src/modules/diff/DiffView.ts) still removes `rootRenderable` before recursive destroy. I confirmed the same adjacent source pattern but did not drive a diff teardown. I did not change it.
- Suspect: [MarkdownSplitView.ts](../../../../src/modules/markdown/MarkdownSplitView.ts) still removes `rootRenderable` before recursive destroy. I confirmed the same adjacent source pattern but did not drive a Markdown split teardown. I did not change it.
- Contract gap: `--refs` reports no annotation for [Owned resources release in reverse order](../../../../src/modules/app/app.invariants.md#owned-resources-release-in-reverse-order). Its mechanism names `App.dispose` and `Bootstrap.shutdown`. The task brief also omitted this record.
- Contract migration debt: `--all` reported 27 existing notes. These were 11 empty-category notes and 16 punctuation notes. It reported 0 problems.

No other runtime bycatch appeared during the small or large disposal drives.
