# READY — #218 (a Workspace buffer becomes a document plus a view handle)

Branch `fleet/218-workspace-buffer-splits-document-from-view`, one commit:

- `687f265a` — A workspace buffer becomes a document plus a view handle (#218)

Worktree clean. `scripts/merge-gate.sh` was not run. Nothing pushed, merged, tagged, or deleted.

## The done-test

```sh
grep -rn "from ['\"][^'\"]*\.\./editor/" --include='*.ts' src/modules/workspace | grep -v '\.test\.'
```

Before: three hits — `Workspace.ts:3` (`Editor`), `Workspace.ts:32` (`EditorContributions`),
`DocumentHandle.ts:2` (`EditorFoldState`).
After: no output, exit 1.

## What a buffer is now

A buffer is a DOCUMENT plus a VIEW HANDLE.

The document is the `TextDocument` on the buffer's stable `DocumentHandle`. Every language request
reads it: `syncActiveDocumentWithLanguageProviders`, `hoverAt`, `completionAt`, `diagnosticsAt`,
`goToDefinition`, plus the two content routers (`activeFileIsImage`, `resolveFileReference`). They
share one guard, `languageRequestDocument`, which replaces five copies of
`buffers.activeBuffer as Editor.Instance | null` followed by `hasDocument && document.path`. Only
one line in that group still reads a view: the CARET fallback of `goToDefinition`, because a caret
is view state.

The view comes from `WorkspaceOptions.createSourceTextViews`, an injected
`SourceTextViewProvider`. `src/modules/workspace/SourceTextView.interface.ts` states what a view is
— document, cursor, viewport, folding, wrap geometry, movement, editing, lifetime — without naming
the class behind it. `src/modules/editor/EditorSourceTextViews` is the one implementation, and
`Bootstrap` is the one place that names it.

The provider resolves LAZILY. That is what keeps the change small: a workspace built only to carry
contributions — the shape in the source-control, language, file-tree, and terminal tests — needs no
view and needed no edit.

## The rule the removed casts were carrying

Per the #114 lesson, the cast came out only after the rule it enforced was written down.

`buffers.activeBuffer as Editor.Instance` was safe because of a comment: "the set only ever holds
Editors (this seam is the sole creator)". That is a real rule, it was load-bearing at ten sites, and
nothing recorded it. I added it FIRST, as *One provider creates every workspace buffer view* in
[src/modules/workspace/workspace.invariants.md](../../../../src/modules/workspace/workspace.invariants.md), then made it structural: `createBuffer` records
what it made in `viewsByLiveBuffer`, and every later seam reads that map instead of asserting.

The map is not an identity trick with extra steps. It is the seam: a provider that returns the view
itself maps it to itself, a provider that returns a wrapper does not, and neither case asks the host
to claim anything about what a buffer is.

## Where fold state lives, and why

The brief asked for a decision plus its reasoning. Recorded in [project.decisions.md](../../../../project.decisions.md) as *Fold
state is document-adjacent persistence, not a view property*.

Fold state stays on the stable `DocumentHandle`; only its type moved, to
`src/modules/text/DocumentFoldState.interface.ts`. The reasoning is the flyweight. A clean
background tab is dehydrated — its view is disposed and a later activation builds a new one. A
collapsed region is a decision about a FILE, not about the instance currently showing it. Put it on
the view and every eviction discards it silently, which is the class *Document identity survives
document instance replacement* exists to prevent.

The type test agrees with the storage test. A fold is a set of DOCUMENT line numbers: no wrap width,
no scroll offset, no visual row. `FoldRange` became an alias of the same file's `DocumentFoldRange`
for the same reason.

## Scope I widened, deliberately, and why

`SourceTextView` has to say `cursor` and `viewport`. Both classes lived in `src/modules/editor/`, so
the contract could not name them without re-creating the import it exists to remove.

I measured before moving them: `Cursor` and `Viewport` had **zero** importers outside
`src/modules/editor/`. Every consumer reached them only through `editor.cursor` and
`editor.viewport`. That is #122's finding at a smaller size — a shared primitive parked behind the
editor door.

The contract layer agreed again. `Cursor` already cited *A cursor position resolves to three
distinct coordinates*, which lives in [text.invariants.md](../../../../src/modules/text/text.invariants.md). `Viewport` cited two
[project.invariants.md](../../../../project.invariants.md) records. **No invariant record had to move with the files.** That is the
strongest evidence the folder was the only thing that disagreed.

So both moved to `src/modules/text/` as `TextCursor` and `TextViewport`, renamed for the reason
`EditorCoordinates` became `TextCoordinates`. Recorded in [project.decisions.md](../../../../project.decisions.md). What did NOT move:
`ReadOnlyTextBuffer`, `EditorWrap`, `CodeFolding`, `BracketMatch` — those are view behaviour, and
moving them to suit one interface would repeat the mistake in the other direction.

## Scale parity — driven before and after

The `bun run drive --size N` on-ramp is still broken here (see Bycatch), so I drove directory
workspaces outside the repo, built by `scripts/make-scale-workspace.ts` at 10, 100,000, and 500,000
lines, and opened `huge.ts` through the file tree. Same gesture each time: open, three wheel-downs,
`Control+End`, then the two-step fold `Control+k` `[`.

Fingerprint = `editorFrameAttribution.latestFrame`.

| scale | before | after |
| --- | --- | --- |
| 10 | `documentLineReads 23  foldProjectionLookups 12  wrapProjectionLookups 2  layoutComputations 1` | identical |
| 100,000 | `31 / 16 / 2 / 1` | identical |
| 500,000 | `31 / 16 / 2 / 1` | identical |

`editorScrollTop` reaches 99,986 and 499,986 respectively, before and after. The per-frame numbers
do not move with file size. Typing two characters at the end of the 500,000-line file leaves the
fingerprint at `31 / 16 / 2 / 1`.

The #202 warm-set contract holds unchanged: three clean tabs give `bufferLiveCount=2` before and
after. Editing tab one and then opening two more gives `bufferLiveCount=3` — two recent plus the
retained dirty background buffer.

LSP was driven live, not mocked: open `small.ts`, wait for `lspStatus="ready"`, type
`smallRecord.`, wait for `completionOpen=true`. Before and after: `completionOpen=true`,
`lspProvider="typescript"`, same selected label.

## Positive controls

| control | planted defect | result |
| --- | --- | --- |
| conventions-gate rule 1.53 | added `import type { Editor } from '../editor/Editor'` to `src/modules/workspace/DocumentHandle.ts` | `CONVENTIONS FAIL: src/modules/workspace imports the source-text view:` naming the file and line; gate exit 1 |
| `Workspace.test.ts` "one creator, one disposer" | deleted `view.dispose()` from the `disposeBuffer` seam | `expect(received).toBe(expected) — Expected: 2, Received: 0`, 1 fail |

Both returned to green when the plant was removed: gate exit 0, 11 pass / 0 fail.

## Verification — exact exit codes

```text
bunx tsc --noEmit                                            exit 0
bun test                                                     exit 0
  1752 pass, 0 fail, 67862 expect() calls across 264 files
bash scripts/conventions-gate.sh                             exit 0
bunx prettier --check .                                      exit 0
node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs   exit 0
  957 annotations, 67 lattice links, 0 problems
bun scripts/check-coverage-ratchet.ts                        exit 0
  322 files inspected, no undeclared decrease against 831e5cf
```

957/67/0 is above the 947/67/0 floor the brief set.

Smokes driven green after the change, all exit 0 and ALL-PASS: `smoke-hover-harness`,
`smoke-goto-definition-harness`, `smoke-completion-harness`, `smoke-tabs-harness`,
`smoke-editor-harness`, `smoke-code-folding-harness`, `smoke-bounded-list-popup-harness`,
`smoke-diagnostics-harness`, `smoke-dirty-marker-harness`, `smoke-workspace-tabs-harness`. The same
ten were driven green BEFORE any edit, so their silence is a comparison and not a claim.

Two test files moved. The coverage ratchet reads a move as a removal, so both are declared in
[project.coverage-deltas.md](../../../../project.coverage-deltas.md) with their before counts and new paths. No assertion was dropped.
`Workspace.test.ts` went 35 → 48 assertions and `OpenBufferSet.test.ts` 31 → 33 through prettier
re-counting plus the three new tests.

## The boundary I stopped at — #219

I did not start the `PaneContent` retrofit. Here is the boundary, so it is not rediscovered.

`Workspace.editor` now returns the `SourceTextView` seam, and every consumer compiles against that
contract — `RootView`, `ScrollbarSync`, `TabBar`, `CoreStatusBarSegments`, `AppStatusProjection`,
`CommandDefaults`, `Bootstrap`, the Markdown, inline-rewrite and source-control contributions, and
the editor's own `EditorPane` and `EditorPaneRenderer`. Not one of them needed a cast, which was the
test of whether the contract was honest.

That contract is a SECOND view seam beside `PaneContent`, and #219 has to reconcile them. Two facts
matter for that work:

1. **`SourceTextView` and `PaneContent` answer different questions.** `PaneContent` renders itself
   to `StyledText` for a region. `SourceTextView` does not render at all — `RootView` mounts native
   OpenTUI renderables for the editor and drives native selection and the native caret. #219 either
   folds `SourceTextView` into `PaneContent` (which means rewriting the render, selection, caret,
   and pointer path of the hottest surface) or keeps `SourceTextView` as the source-text
   SPECIALISATION a `PaneContent` may also implement. The second reading is cheaper and I think it
   is the true one, but it is #219's call, not mine.
2. **The provider seam is where a manifest attaches.** `EditorSourceTextViews` is per workspace and
   is already the single point that knows a buffer view is an `Editor`. When the editor becomes a
   registered contributor (step 3 of #122's sequencing), that is the object the manifest and the
   uninstall symmetry hang off — the release path has to cover the views it created, which
   `viewsByLiveBuffer` and `dispose` already enumerate.

## Bycatch

- **`bun run drive --size N` and `--open <FILE>` still cannot open the file they create.**
  Reproduced on an unmodified tree before any edit: `bun run drive --size 100000 --key Control+End`
  ends in `(no matching files)` and `drive: Timed out waiting for grid condition: Quick Open to rank
  the requested file`, exit 1. The cause is exactly what #122 reported and is unchanged: ripgrep is
  not installed here, so Quick Open falls back to `git ls-files`, which returns empty inside `tmp/`
  because `.gitignore` ignores it. NOT fixed — it is another builder's harness and the fix is a
  design choice. Worked around by driving generated workspaces outside the repo
  (`/home/parallels/dev/invar-scale-{10,100000,500000}`) and opening through the file tree. The
  deeper half stands: `enumerateProjectFiles` reports `state: 'complete'` with zero files, so an
  invisible scan failure is presented as an empty result.
- **The invariant record *The editor owns no view state* has no citing annotation.** The checker
  reports it as a coverage gap. I verified against a stash of my own changes that this is
  PRE-EXISTING and not something I broke. It is worth a look now rather than later, because #218
  just recorded fold state as document-adjacent, which is the same claim from the other side.
- **[editor.invariants.md](../../../../src/modules/editor/editor.invariants.md) still emits `one category is empty — fine while bootstrapping`.**
  Pre-existing, already flagged by #122, unchanged by this work. A note, not a problem.
- No mispainted cell, focus jump, stall, or wrong glyph was seen in any drive, at any of the three
  scales, before or after.

## What this task says

#122 found that a rule living only in a folder name is already lost. This one found the next layer:
**a rule living only in a comment beside a cast is lost the moment the cast is convenient.**

"The set only ever holds Editors (this seam is the sole creator)" was true, load-bearing, and
written down exactly once — as a comment above the seam that made it true. Ten sites depended on it.
No invariant recorded it, so nothing would have told anyone if a second creator had appeared.
Removing the cast was not the work; finding out what the cast had been silently promising was.

The measurement agreed with the design only after the design was right. `Cursor` and `Viewport` had
zero host importers and zero invariant records that needed to move — the two independent signals
that they were already shared and only the folder said otherwise.
