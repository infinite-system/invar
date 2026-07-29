# READY — #122 (the editor becomes the final contributor)

Branch `fleet/122-editor-becomes-final-contributor`, one commit:

- `158b3479` — Separate the shared text primitives from the source-text view (#122)

Worktree clean. `scripts/merge-gate.sh` was not run. Nothing pushed, merged, tagged, or deleted.

**Read the headline first: this task did NOT reach 0.** It reached 4 → 3 and 33 → 9. The reason is
a structural finding, not a shortfall of effort, and it is the most useful thing in this report.
The measured evidence is below.

## What the three censuses actually said

The brief warned that the mechanical count under-reports. It does more than that. It reports the
wrong quantity.

| census | before | after |
| --- | ---: | ---: |
| 1. host files naming `modules/editor/` | 4 | 3 |
| 2. relative production imports of `../editor/` in the host | 33 | 9 |
| 3. host files naming a source-text view class (tests included) | 32 | 20 |

Census 1 does not measure coupling at all. All four hits were invariant CITATIONS — comment lines
of the form `// invariant: <name> (src/modules/editor/editor.invariants.md)`. I checked the
terminal's four at `d0dc07c^`, the commit before Wave B: those were also four citations, in
`Bootstrap.ts`, `OverlayLayer.ts`, `PanelHost.ts`, and `RootView.ts`. So the "4 → 0" standard git,
LSP, and the terminal are recorded as meeting is, mechanically, a count of where invariant records
live. Wave B's report is honest about this — it says seven invariants were relocated.

That is worth saying plainly, because #35 is sequenced behind this task on the strength of that
number.

## The finding: `modules/editor/` held two different things

`EditorCoordinates` was imported by **33 production files across 12 modules** — agent, app, diff,
filetree, git, inline-rewrite, lsp, markdown, scripts, search, syntax, ui. `TextInputModel` by 10
across 5. `TextDocument` by 8 across 4.

That is not the host knowing about the editor. That is the host doing grapheme and display-column
arithmetic, and being charged for a dependency on the source-text view to do it.

The contract layer already knew. `TextInputModel` cites *Editable text fields share one input
model*. `WrapBreakOpportunity` cites *Wrapped surfaces share one break generator*. `TextEditing`
cites *Seams are drawn at the shared generator*. All three records live in [project.invariants.md](../../../../project.invariants.md),
not [editor.invariants.md](../../../../src/modules/editor/editor.invariants.md). [AGENTS.md](../../../../AGENTS.md) convention 2 names `TextEditing` word-edits as a shared
generator in the convention text itself. `EditorCoordinates` described itself in its own doc
comment as "the shared horizontal-scroll primitive for every list/text pane".

Only the folder disagreed. Convention 2 says seams are drawn at the shared generator. This one was
not.

## What I did

**Moved the shared text primitives to `src/modules/text/`.** Five files with their tests:
`TextCoordinates`, `TextEditing`, `TextInputModel`, `WrapBreakOpportunity`, `TextDocument`.
`EditorCoordinates` was renamed `TextCoordinates` — a class named for the editor in every host file
IS the false signal census 3 kept reporting, so moving it without renaming would have left the
measurement lying in the other direction.

**Moved four invariant records with them** into a new [src/modules/text/text.invariants.md](../../../../src/modules/text/text.invariants.md): *A
cursor position resolves to three distinct coordinates*, *Every document mutation bumps the
revision exactly once*, *The dirty marker is derived from content, never asserted*, *Word deletion
uses navigation boundaries*. The rules did not change. Their recorded owner did.

**Moved the editor's own view classes INTO the module**, where Wave B put `TerminalPaneContent`:
`EditorPane` and `EditorPaneRenderer` left `modules/ui/` for `modules/editor/`.

**Added conventions-gate rule 1.52** so the new seam has one direction: `src/modules/text/` never
imports `../editor/`. A primitive that reaches back into the view stops being shared and silently
re-fuses the two.

Git recorded 14 renames, 1 add, 0 deletes. No file was retyped.

## Hazard 1 — the rule that dies in the generalisation

I did not delete or generalise any host branch, so the Wave B trap did not arm. But I applied the
discipline to the three census-1 citations that remain, and it is why they remain.

`Workspace.ts` and `SolidThumbScrollBar.ts` cite *Geometry aggregates match their consumers*.
`OverviewRuler.ts` cites *One generator owns document-line-to-visual-row*. I read both records
before touching them. Both are genuinely EDITOR-domain rules — the first scopes itself to "editor
scroll extents and scrollbar proportions" and names `TextDocument.maximumLineWidth` and
`EditorWrap.totalVisualRows` as its components. The three host files cite them because they are
CONSUMERS of editor geometry.

Relocating those records into [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) would zero census 1 and record a false owner. I
left them. Census 1 stays at 3, honestly, rather than reaching 0 dishonestly. Those three go to
zero when the host stops consuming editor geometry — which is the capstone itself, not a record
move.

One genuine refinement I did NOT act on, and flag for triage: *Geometry aggregates match their
consumers* fuses two rules with different generators. Its "Exact hard boundaries" component is
editor geometry. Its "Exact proportional inputs" component is thumb quantization, which is generic
— `SolidThumbScrollBar` serves `ScrollableTextViewport`, `DiffView`, and `RootView`. Splitting it
would move one half to [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) legitimately. That is a contract change and needs its own
task.

## Hazard 2 — uninstall symmetry

Not applicable, and I am recording the decision rather than building a hollow path, as the brief
asked. The editor is not a registered contributor yet: it has no manifest, no
`registerPaneRuntime`, and no install or uninstall. Disabling it is not expressible, so there is
nothing to release. When the editor does become a contributor, uninstall symmetry must cover its
pane the way Wave B's `releasePane` covers the terminal's — that is a requirement on the capstone,
recorded here so it is not rediscovered.

## Hazard 3 — the `modules/agent/` collision

No collision. This work touched no agent site. `modules/agent/` is still imported at its ~25 host
sites in `Bootstrap.ts`, `RootView.ts`, and `AppStatusProjection.ts` while scoring 0 on the string
census. I did not extract the agent pane. The v1 bycatch from #114 stands unchanged.

## Hazard 4 — scale parity

Driven before and after at 10, 100,000, and 500,000 lines. Same fixture content as
`bun run drive --size` generates. Same gesture sequence each time: open, three wheel-downs,
`Control+End`, then the two-step fold `Control+k` `[`.

The fingerprint is `editorFrameAttribution.latestFrame`. It is identical at all three scales AND
unchanged by this work:

```text
documentLineReads 19-20   foldProjectionLookups 10
wrapProjectionLookups 2   layoutComputations 1
```

At 500,000 lines `editorScrollTop` reaches 499,991 and the per-frame numbers do not move. The
flyweight is intact.

`bufferLiveCount` at 3 clean tabs is exactly 2, before and after, matching the #202 exact-count
contract.

## Positive controls

| control | planted defect | result |
| --- | --- | --- |
| conventions-gate rule 1.52 | added `import type { EditorFoldState } from '../editor/Editor'` to `src/modules/text/WrapBreakOpportunity.ts` | `CONVENTIONS FAIL: src/modules/text imports the source-text view`, exit 1 |
| `check_invariants` | not planted — observed live | the move orphaned 3 bare-filename citations; checker went to 3 problems, exit 1, naming each file and line |

Both returned to green when the defect was removed. The second is the stronger evidence, because
the checker caught a real mistake of mine rather than a staged one: three citations used the bare
form `(editor.invariants.md)` instead of the root-relative form, exactly the orphaning Wave A's
brief warns about, and they broke the moment the files moved.

## Verification — exact exit codes

```text
bunx tsc --noEmit                                            exit 0
bun test                                                     exit 0
  1746 pass, 0 fail, 67842 expect() calls across 263 files
bunx prettier --check .                                      exit 0
bash scripts/conventions-gate.sh                             exit 0
node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs   exit 0
  947 annotations, 67 lattice links, 0 problems
bun scripts/check-coverage-ratchet.ts                        exit 0
  322 files inspected, no undeclared decrease against 831e5cf
```

947/67/0 is above the 945/67/0 floor the brief set.

Smokes driven green after the change: `smoke-editor-harness`, `smoke-scrollbars-harness`,
`smoke-horizontal-extent-harness`, `smoke-word-delete-harness`, `smoke-dirty-marker-harness`,
`smoke-bounded-list-popup-harness`, `smoke-find-harness`, `smoke-diff-overview-harness`. All exit
0, all ALL-PASS.

Seven test files moved. The coverage ratchet reads a move as a removal, so each is declared in
[project.coverage-deltas.md](../../../../project.coverage-deltas.md) with its before counts and its new path. No assertion was dropped.

## What is left, and why it is not one task

The residue in census 2 is nine imports, and it is the capstone:

```text
src/modules/workspace/Workspace.ts:3       Editor
src/modules/workspace/Workspace.ts:32      EditorContributions
src/modules/workspace/DocumentHandle.ts:2  EditorFoldState
src/modules/ui/RootView.ts:35              EditorFrameAttribution
src/modules/ui/RootView.ts:42              EditorPane
src/modules/ui/RootView.ts:56              EditorWrap
src/modules/ui/ScrollbarSync.ts:8          EditorWrap
src/modules/app/AppStatusProjection.ts:7   BracketMatch
src/modules/app/Bootstrap.ts:62            BracketMatch
```

Two structural facts make this a separate body of work, and I want them on the record rather than
implied by a missing number.

**The editor is the only pane that is not a `PaneContent`.** `PaneContent.interface.ts` says so in
its own header comment: the seam was "deliberately NOT retrofitted onto the existing
editor/git/tree/markdown panes yet". A `PaneContent` renders itself to `StyledText` for a region.
The editor does not. `RootView` constructs and mounts native OpenTUI renderables for it — a
`BoxRenderable` editor area, a `TextRenderable` gutter, a `SelectableText` code body — and attaches
mouse handlers to them directly. It drives OpenTUI's NATIVE selection through
`codeBody.setSelectionRange`, and places the native terminal caret from `EditorPane.visualPosition`.
Putting the editor on the `PaneContent` seam means rewriting the render, selection, caret, and
pointer path of the product's hottest surface.

**`Workspace` is a container of Editors, not of documents.** `Workspace.createEditor` is the sole
creator of every buffer; `Workspace` then casts `buffers.activeBuffer` to `Editor.Instance` and
reads `editor.document` to serve LSP sync, hover, completion, and go-to-definition. The workspace
cannot stop depending on the editor until a buffer is a document plus a view, rather than an
`Editor`.

Moving `TextDocument` into `src/modules/text/` was the first step of exactly that, and it is why I
moved it: `DocumentHandle` and `LanguageProvider.interface` are workspace seams, and they now hold
documents without naming the editor.

Suggested sequencing, for triage:

1. Split the buffer: `Workspace` holds a document plus a view handle, not an `Editor`.
2. Retrofit the source-text view onto `PaneContent`, with the native caret and native selection
   expressed through the seam.
3. Register the editor as a contributor with a manifest, and give it uninstall symmetry covering
   its pane.
4. Then #35, which is only real evidence once 1 to 3 have landed.

I did not start step 1. Half a buffer split leaves the tree broken, and the brief's method is drive,
extract, drive — which needs each step to end in a working app.

## Bycatch

- **`bun run drive --open <FILE>` and `bun run drive --size N` cannot open the file they create.
  The documented Rule Zero on-ramp is broken on this machine.** Both forms copy the target into
  `<repo>/tmp/drive/...` and then open it through Quick Open. Quick Open enumerates with
  `rg --files`; ripgrep is not installed here, so it falls back to
  `git ls-files --cached --others --exclude-standard`, which returns EMPTY inside `tmp/` because
  `.gitignore` line 33 ignores it. The result is `quickOpenMatches=0`, "(no matching files)", and
  `drive: Timed out waiting for grid condition: Quick Open to rank the requested file`. Reproduced
  every time, on an unmodified tree, before I made any change. NOT fixed — it is a harness owned by
  another builder and the fix is a design choice (put the scratch workspace outside the ignored
  path, or make the empty git fallback report `degraded` rather than `complete`). The second half
  is the deeper defect: `enumerateProjectFiles` returns `state: 'complete'` with zero files, so the
  UI says "no matching files" when the truth is "this scan could not see anything". *File
  enumeration failures stay visible* is the invariant it cites, and an empty complete scan is
  exactly an invisible failure. Worked around by driving directory workspaces outside the repo and
  opening through the file tree.
- **`bun run drive --key <letter>` after `Control+p` closes Quick Open instead of typing into it.**
  Seen once while probing the above (`--key Control+p --key s --key c --key a --key l --key e`
  ended with `quickOpenOpen=false`). Not chased, because the on-ramp defect above was the blocker I
  actually needed to clear. Reported so it is not mistaken for a symptom of this branch.
- **The empty-category note in [editor.invariants.md](../../../../src/modules/editor/editor.invariants.md).** Moving the one reality-based record out
  leaves that section empty, and the checker emits `one category is empty — fine while
  bootstrapping`. It is a note, not a problem, and the file states in place that the record moved
  and where. Flagged so a later reader does not read the empty heading as rot.
- No mispainted cell, focus jump, stall, or wrong glyph was observed in any of the drives at any of
  the three scales.

## What this says about the extraction

Wave B's lesson was that a rule which exists only implicitly dies in the generalisation that
removes it. This task's lesson is one layer earlier: **a rule that exists only in a folder name is
already lost, and the measurement will not tell you.** Census 1 said the editor was four files away
from extracted. The real number was 33, and 25 of those were the app using its own text primitives
through a door labelled "editor". The done-test and the goal had drifted apart, and the done-test
was the more convincing of the two because it produced a number.

The contract layer was right the whole time. Three of the moved files cited [project.invariants.md](../../../../project.invariants.md)
records that describe them as SHARED. Nobody had to discover that. It only had to be read.
