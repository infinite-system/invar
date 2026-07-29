# READY — #219 (retrofit the source-text view onto the PaneContent seam)

Branch `fleet/219-source-text-view-onto-pane-content-seam`, one commit:

- `bb7ce7bb` — Retrofit the source-text editor onto the PaneContent seam (#219)

Worktree clean. `scripts/merge-gate.sh` was not run. Nothing pushed, merged, tagged, or deleted.

## The hypothesis held

The brief's starting hypothesis was right and I did not refute it. `SourceTextView` stays the
source-text SPECIALISATION. The native render path was not rewritten into `StyledText`. What the
seam grew is one capability that says **who paints**.

`PaneContent.render` is now OPTIONAL, paired with `native-surface`
(`PaneNativeSurfacePort`: `paint`, `caretAnchor`, `surfaceRegion`). A content projects through
exactly one surface: cells the host paints, or renderables it owns and paints itself. Never both,
never neither.

The reason `render` had to become optional is AGENTS.md rule 2's own tell. Keeping it required
would have forced the editor to return an empty `StyledText` it never uses — a consumer
suppressing the seam's core to be allowed through it. That is the signal that the boundary is in
the wrong place, so I moved the boundary instead of the editor.

## The host lost its branches, not gained them

`PaneProjection` is the ONE resolver. Four host paint sites call it now: the primary dock body, the
right dock body, each visible bottom-panel cell body, and the editor column. Each is the same line:
assign what comes back, assign nothing when it is null.

`RootView`'s editor block went from 68 lines of gutter/code/image/selection wiring to one call.

```sh
grep -n "EditorPane\|EditorPaneRenderer\|editorContributions" src/modules/ui/RootView.ts
```

Before: 6 hits (the import, the controller construction, `renderEditor`, `applySelection`, two
`visualPosition` calls, the contributed-title read). After: no output, exit 1. Conventions-gate rule
1.54 keeps it that way.

## What moved, and the boundary it draws

The host owns the SLOT. The content owns its SURFACES.

`SourceTextPaneContent` (`src/modules/editor/`) builds the gutter `TextRenderable` and the
`SelectableText` code body, mounts them into the host's bordered editor area, and owns the
`EditorPane` controller — wrap window, coordinate mapping, native selection sync, drag,
go-to-definition, wheel. It publishes `text-selection` beside `native-surface`, so the clipboard
path resolves the same identifier a terminal answers.

Three splits I had to name to get this right:

1. **Where versus whether.** The content answers where its caret is, in SCREEN cells, because it
   owns the renderable the caret sits in. The host answers whether this pane owns the keyboard —
   the same ladder that already ranks a modal overlay over the right dock over the bottom panel.
   `RootView.editorCaretAnchor()` is now one delegation, and the duplicate caret computation that
   lived beside it is gone.
2. **A raster document is a projection, not a branch.** The image path stays in `RootView` with the
   image module it belongs to, injected as `rasterProjection`: it answers what the code cells must
   show, places out-of-band graphics itself, and returns null for ordinary source text. Not one
   line of tier-ladder logic moved into the editor.
3. **Pointer events follow ownership.** A native content's renderables carry their own OpenTUI
   handlers, so the seam's optional `onPointerDown` / `onWheel` stay absent for it rather than
   routing the same gesture twice.

`ScrollbarSync`'s `codeBody` dependency became `codeSurface`, fed from the content's reported
`surfaceRegion()`. The host no longer holds the renderable it was reading.

## The rules the removed branches were carrying — written FIRST

Per the #114 lesson, both layers. Two records went into `src/modules/ui/ui.invariants.md` before
any branch came out, and one component into `workspace.invariants.md`.

**A pane content projects through exactly one surface.** Its components record what only comments
enforced: the resolver asks the capability first; neither surface is a defect and gets named, not a
blank pane; and *paint then selection, one pass* — which is the rule the comment
`applySelection(); // after content is set, so selection maps onto the current buffer` was carrying
alone at `RootView:1530`. It is now inside `paint`, in one call, and a test asserts the order.

**The source text editor is a pane content citizen.** One render call, where-versus-whether, one
copy surface, the raster projection, and release expressibility.

**One releaser** (component on *One provider creates every workspace buffer view*).
`Workspace.releaseSourceTextViews` disposes every view in `viewsByLiveBuffer` plus the empty view,
drops the provider, and leaves the documents and tabs alone. `SourceTextPaneContent.dispose` calls
it across every workspace and unmounts the surfaces it mounted. That is what `releasePane` is for a
runtime — #220 wires it to an uninstall; the seam expresses it today and a test proves it.

## The fingerprint — the contract

Driven with #218's on-ramp (directory workspaces outside the repo, opened through the file tree)
and #218's gesture: open `huge.ts`, three wheel-downs, `Control+End`, then the two-step fold
`Control+k` `[`.

Fingerprint = `editorFrameAttribution.latestFrame`.

| scale | before | after |
| --- | --- | --- |
| 10 | `documentLineReads 23  foldProjectionLookups 12  wrapProjectionLookups 2  layoutComputations 1` | identical |
| 100,000 | `31 / 16 / 2 / 1` | identical |
| 500,000 | `31 / 16 / 2 / 1` | identical |

The fold frame reads `24 / 12 / 2 / 1` at scale 10 and `32 / 16 / 2 / 1` at scale, before and after.
`editorScrollTop` lands at 99,986 and 499,986 respectively, before and after. The per-frame numbers
do not move with file size, and they did not move with this change.

One honest note on reading these transcripts: the INTERMEDIATE scroll offsets sampled between the
wheel notches vary run to run (`0,0,0,1,1` before; `0,0,0,0,1` and `0,0,0,1,2` in two runs after),
because the wheel glide is time-based. I re-ran the same tree twice to confirm the variance is
inherent and not the change. The landing offset and every per-frame count are stable.

## Native selection, copy, and the caret — driven at both ends of the scale

Constraint 3 asked for driven, not asserted. Mouse DRAG selection, `Ctrl+C`, and click caret
placement, in a 100,000-line and a 500,000-line file, at maximum scroll depth (`Control+End`
first), through a scratch PTY instrument. The same instrument was run against an unmodified
worktree cut at `f8080013`.

| scale | before (HEAD) | after |
| --- | --- | --- |
| 100,000 | `selection={"start":{"line":99969,"col":0},"end":{"line":99969,"col":11}}  lastCopyChars=11  cursorAfterClick={"line":99969,"col":4}  nativeCaret=51,6` | identical |
| 500,000 | `selection={... line 499969 col 0→11}  lastCopyChars=11  cursorAfterClick={"line":499969,"col":4}  nativeCaret=51,6` | identical |

The instrument is NOT committed (it is a scratch drive, not a ratchet). See "What I did not do".

## Positive controls — five, each made to fail on purpose

| control | planted defect | result |
| --- | --- | --- |
| conventions-gate rule 1.54 | imported `EditorPane` into `RootView` and referenced it | `CONVENTIONS FAIL: RootView names the source-text view's own render path:` naming line 43 and line 1910; gate exit 1 |
| `PaneProjection.test.ts` neither-surface guard | disabled the throw and made `paint` return null for a content with no surface | `Expected pattern: /pane content "cells" projects through neither/ — Received function did not throw`, 1 fail |
| `SourceTextPaneContent.test.ts` paint order | applied the selection BEFORE setting the content | 2 fails on the recorded call order |
| `Workspace.test.ts` one releaser | released only `viewsByLiveBuffer`, forgetting the empty view | `Expected: 3  Received: 2`, 1 fail |
| `smoke-editor-harness` (driven) | made `SourceTextPaneContent.caretAnchor()` return null | exit 1, `Timed out waiting for grid condition: the harness snapshot satisfies …` — the native caret really does flow through the seam |

Each returned to green when the plant was removed.

## Verification — exact exit codes

```text
bunx tsc --noEmit                                            exit 0
bun test                                                     exit 0
  1767 pass, 0 fail, 67908 expect() calls across 266 files
bash scripts/conventions-gate.sh                             exit 0
  conventions-gate: PASS
bunx prettier --check .                                      exit 0
  All matched files use Prettier code style!
node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs   exit 0
  972 annotations, 67 lattice links, 0 problems
bun scripts/check-coverage-ratchet.ts                        exit 0
  322 files inspected, no undeclared decrease against 831e5cf
```

972/67/0 is above the 957/67/0 floor the brief set. No test file moved, so nothing needed a
coverage-delta declaration; the ratchet reports `Workspace.test.ts` 35 → 55 assertions as an
increase.

Smokes driven green AFTER the change, all exit 0 and ALL-PASS: `smoke-editor-harness`,
`smoke-selection-harness`, `smoke-code-folding-harness`, `smoke-hover-harness`,
`smoke-goto-definition-harness`, `smoke-completion-harness`, `smoke-diagnostics-harness`,
`smoke-tabs-harness`, `smoke-workspace-tabs-harness`, `smoke-layout-harness`,
`smoke-clipboard-frame-boundary-harness`, `smoke-plugin-manifest-harness`,
`smoke-panel-split-harness`, `smoke-bracket-match-harness`, `smoke-find-harness`,
`smoke-image-preview-harness`, `smoke-scrollbars-harness`, `smoke-field-caret-harness`.

All EIGHTEEN were driven green BEFORE the first edit, so their silence is a comparison and not a
claim. The first fifteen were driven on the untouched worktree before any file was opened for
writing; the last three were driven on a scratch worktree cut at `f8080013` when I added them to
the set.

## What I did not do, and where the boundary is now

Not started, as instructed: #220's manifest and registration. Beyond that, three things a reader of
this diff will look for and not find. They are boundaries, not oversights.

1. **Keystrokes still do not flow through `handleKey`.** The source pane declares no keybinding
   context and returns false. Source-text keys are owned by the command layer, and moving them is a
   change to keyboard ROUTING, not to the render seam — exactly the shape of the #114 Wave B
   regression, where generalising a dispatch branch silently dropped a scope filter. It deserves
   its own task with the keyboard-invariant sweep as its instrument.
2. **The editor's scrollbars are still driven by `ScrollbarSync` reading `workspaceSet.active
   .editor`,** not through the seam's optional scroll projection (`scrollTop`, `scrollContentRows`
   …). Implementing those getters today would add code no one reads. Wire them when the consumer
   moves, not before.
3. **The at-scale mouse-selection drive is not ratcheted into a gated smoke.** Existing selection
   smokes run at fixture scale. A scale-parity selection smoke is worth having and is new tooling
   with its own on-ramp problem (see Bycatch); I recorded the drive rather than inventing a harness
   inside this task.

## Bycatch

- **`bun run drive --size N` still cannot open the file it creates.** Re-verified on this tree
  after the change: `bun run drive --size 100000 --key Control+End` ends in `(no matching files)`
  and `drive: Timed out waiting for grid condition: Quick Open to rank the requested file:
  …/tmp/drive/fixture-100000/scale-100000.txt`, exit 1. Unchanged from #218 and #122: ripgrep is
  absent here, Quick Open falls back to `git ls-files`, and `.gitignore` hides `tmp/`. NOT fixed —
  another builder's harness, and the fix is a design choice. Worked around exactly as #218 did.
- **`enumerateProjectFiles` still reports `state: 'complete'` with zero files** when that scan
  fails. An invisible failure presented as an empty result. Unchanged; still the deeper half of the
  item above.
- **The invariant record *The editor owns no view state* still has no citing annotation.** The
  checker reports it as a coverage gap. Pre-existing, already filed as #221.
- **`editor.invariants.md` still emits `one category is empty — fine while bootstrapping`.**
  Pre-existing, flagged by #122, unchanged.
- **`Enter` on a freshly opened directory workspace does not open the selected tree row**, because
  focus starts on the editor, not the tree. A click on the row does. Reproduced twice. This is
  probably correct behaviour rather than a defect, but it costs every new drive script one wrong
  turn, and `drive.md` does not say it.
- No mispainted cell, focus jump, stall, or wrong glyph was seen in any drive, at any of the three
  scales, before or after.

## What this task says

#122 found that a rule living only in a folder name is lost. #218 found that a rule living only in
a comment beside a cast is lost. This one found the third form: **a rule living only in the ORDER
of two statements.**

`applySelection()` had to run after the content was set. That was true, load-bearing, and recorded
only as a trailing comment on one line of a 2,279-line host. Nothing in the type system, the tests,
or the contract layer would have noticed if a later edit had moved it three lines up. It is now a
component of an invariant, enforced by being inside one method, and a planted swap makes two tests
red.

The other finding is about seam shape. The editor did not fit `PaneContent` because `PaneContent`
assumed the HOST paints. That assumption was invisible while every citizen happened to be a cells
citizen. The honest fix was to make the seam say what varies — who paints — and let the host stop
choosing. The measurement agreed: the frame fingerprint did not move by a single count at any of
the three scales, because nothing about the paint changed except who asked for it.
