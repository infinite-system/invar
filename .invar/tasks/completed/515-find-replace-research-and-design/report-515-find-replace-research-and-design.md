## In plain words

Workspace Search now has a complete build design, but no app code changed. The
design keeps workspace results in the left dock and keeps file-local Find in the
editor. Both paths use shared inputs, dialogs, scrolling, copy, and safe undo
rules.

I also found that the current in-file Replace All cannot undo its changes. I
reproduced that failure twice and made its repair the first build milestone.

## Result

READY at commit `4203906ce61efee4bd8bd75c375bcc7faeb37b72`
(`Design workspace and in-file Find/Replace`).

The deliverable is the
[workspace and in-file Find/Replace design](../../../worktrees/515-find-replace-research-and-design/project-find-replace-design.md).
It completes the
[#515 (workspace Find/Replace research and design) brief](brief-515-1-find-replace-research-and-design.md).

The design contains:

- A separate workspace Search pane in the left-dock File Tree slot.
- A Search activity item directly after File Tree.
- A separate extension of the existing in-editor `FindBar`.
- Distinct workspace and in-file states, results, history, and chords.
- One shared query compiler with explicit ripgrep and local matcher parity.
- Four workspace `TextInputModel.Class` fields and two in-file fields.
- File groups, counts, old-to-new previews, and match dismissal.
- Shared scrolling, pointer selection, clipboard copy, and copied-count feedback.
- Reverse-patch transactions with bounded arena storage.
- Exact drift verification before Replace, Undo, and Redo.
- One-copy external undo references for open editor histories.
- Exact consent copy for eight dialog cases.
- An integration census of 18 existing seams.
- Four proposed invariant records and six build milestones.

No runtime implementation or invariant edit rides with this task.

## Main design decisions

- `WorkspaceSearchContributor` owns one search model per workspace.
- `WorkspaceSearchPaneContent` registers through the primary dock host.
- `Ctrl+Shift+F` opens workspace find.
- `Ctrl+Shift+R` opens workspace replace.
- `Ctrl+F` and `Ctrl+H` keep their current in-file meanings.
- Every consent or warning surface uses `Dialog.Class` through `OverlayLayer`.
- All dialog buttons have one-key padding and safe initial focus.
- Every editable field uses `TextInputModel.Class` and the shared binding table.
- Workspace results use `ScrollableTextViewport.Class`.
- Result and dialog text use `TextSelectionModel.Class` and
  `SelectionDragBehavior.Class`.
- Open documents replace ripgrep's disk results for the same path.
- Open documents become dirty and stay unsaved after workspace replacement.
- Closed files use a confined, verified, per-file atomic replacement seam.
- Workspace history stores edit text and bounded context, never file snapshots.

The design cites the
[six-chapter UI doctrine](../../../../.claude/skills/ui-design/SKILL.md)
at each affected surface. Chapter 4 governs inputs. Chapter 2 governs dialogs.
Chapters 5 and 6 govern the result list. Chapter 3 governs replace, undo, and
redo flows. Chapter 1 governs every button and toggle.

## Research evidence

I drove the default app at 220 by 60 cells. The live activity order was
`files`, `git`, `structure`, `tasks`, `monitoring`, `extensions`.

`Ctrl+P` opened Quick Open. `Ctrl+F` opened the current in-file Find bar.
`Ctrl+H` opened its replacement row. The graph showed that the focused field
was a `TextInputModel`.

The code census covered activity contributions, primary dock registration,
per-workspace models, document handles, open buffers, source-text views,
`UndoStore`, `Processes`, `Files`, `Dialog`, `FindBar`, `FindInBuffer`, shared
inputs, shared scrolling, and shared text selection.

The external study used official VS Code documentation and source. It also used
the public JetBrains project-search and Find-window guides. The design separates
documented behavior from architecture inferences.

The user priors were mostly upheld. The design adopts reverse patches, counted
consent, live open-buffer edits, confined disk edits, and ripgrep through
`Processes`. It refines the context-hash prior. Exact bytes decide safety, and
the hash only rejects mismatches quickly.

## Driven Replace All finding

I opened [project.tasks.md](../../../../project.tasks.md) through Quick Open. I
opened in-file Replace with `Ctrl+H`, found 21 `task` matches, and entered
`workitem` as the replacement.

I clicked the visible Replace All button. The graph reached zero matches, and
the editor showed the dirty marker. I closed Find, pressed `Ctrl+Z`, and reopened
Find with `Ctrl+F`.

The screen still showed `task` with `no results`. I reloaded a fresh app and ran
the same full gesture sequence. The second run had the same result.

## Verification

- `python3 .claude/skills/ste-expression/scripts/ste-lint.py` on the design:
  5,300 checked words, 36 findings, 0.68 findings per 100 words, 0 em dashes.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all`: 43
  contracts passed.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --refs`: 1,386
  annotations and 287 lattice links resolved, with 0 problems.
- `git diff --check`: pass before commit and before READY.
- The warm DriveSession stopped cleanly after both observations.
- The report link lint passes with zero findings.

I did not run the merge gate. The
[#515 (workspace Find/Replace research and design) brief](brief-515-1-find-replace-research-and-design.md)
forbids it for this design task.

The design link lint reports only the doctrine links as missing in this branch.
The branch baseline predates doctrine commit `739267f4`. The same links resolve
against current main and will resolve after integration. All other design links
resolve now.

## Invariant review

- **Editable text fields share one input model:** upheld by design. All six
  fields name `TextInputModel.Class` and the shared binding table.
- **Undo records deltas not whole-document snapshots:** violated by the current
  in-file Replace All path. Milestone 1 routes its text edits through the editor
  undo boundary.
- **External tools share one launch policy:** upheld by design. Ripgrep starts
  only through `Processes.Class.spawn`.
- **File access is confined to a single root:** upheld by design. Every result
  path and disk action passes the `Files` boundary.
- **Document identity survives document instance replacement:** upheld by
  design. Later Undo resolves the live document through `DocumentHandle`.
- **Activity bar order is one persisted sequence:** needs refinement. Existing
  profiles must insert Search after File Tree instead of appending it.
- **One dialog component serves confirms and prompts:** upheld by design. Every
  consent and warning names `Dialog.Class` and `OverlayLayer`.

The design proposes records for flyweight reverse patches, acting-step
verification, counted consent in both directions, and one-copy multi-document
undo data. It does not edit the contract layer.

## Bycatch

- **REPRODUCED TWICE, NOT FIXED:** In-file Replace All bypasses editor undo.
  [`FindInBuffer.replaceAll`](../../../../src/modules/search/FindInBuffer.ts)
  calls `TextDocument.replaceAll` directly. That method does not emit the line
  change event that feeds `UndoStore`. The nearby comment says the editor can
  capture one undo step, so it is also comment drift. The exact PTY sequence and
  result appear above. This violates
  [Undo records deltas not whole-document snapshots](../../../../src/modules/editor/editor.invariants.md#undo-records-deltas-not-whole-document-snapshots).
- **CONTRACT PRESSURE, NOT FIXED:** The required fixed Search slot conflicts
  with the current rule that an unseen activity identifier appends after known
  identifiers. The design calls for one settings migration and an approved
  refinement of
  [Activity bar order is one persisted sequence](../../../../src/modules/ui/ui.invariants.md#activity-bar-order-is-one-persisted-sequence).
- **CONTRACT GAP, NOT FIXED:** The search contract has no records for multi-file
  patch ownership, acting-step drift checks, or counted undo consent. The design
  proposes four records. It leaves them provisional and unapplied.

## Instrument feedback

- **EASY:** Warm DriveSession kept one app alive while I moved through Quick
  Open, `FindBar`, Replace All, Undo, and the second fresh run.
- **EASY:** Graph waits on `findBar.mode`, `replaceFocused`, focused input text,
  and match count gave exact conditions for every step.
- **EASY:** `clickText('⇊')` drove the visible Replace All control without an
  app-specific gesture.
- **MISSING:** The fluent surface has no labeled graph-value display that works
  like status `show()`. Add a `showGraph(label, paths)` reader so a report probe
  can print several graph paths without separate calls.

## Worktree state

The tracked tree is clean at commit
`4203906ce61efee4bd8bd75c375bcc7faeb37b72`. I preserved the unrelated,
pre-existing untracked
[builder fundamentals file](../../../worktrees/515-find-replace-research-and-design/BUILDER-FUNDAMENTALS.md).
