# Brief — #238 round 2: absorb main, resolve your own conflicts

Main has moved: #237 (preview LEFT + auto-open) landed as d42f2af0, and a
follow-up wave of fleet-script commits sits above it. Your branch
`fleet/238-structure-default-right-and-md-toc` now conflicts with main in
three files:

- `src/modules/markdown/MarkdownWorkspace.ts`
- `src/modules/markdown/MarkdownWorkspace.test.ts`
- `scripts/harness/smoke-plugin-manifest-harness.ts` (or its current home)

The work: in YOUR worktree, `git fetch` is unnecessary (same repo) — merge
`main` into your branch (merge, not rebase: your branch is shared history
now) and resolve the conflicts YOURSELF, as the author who knows both
intents: #237 put the preview pane LEFT with auto-open; your #238 puts the
structure pane RIGHT by default with the markdown TOC. The two features
must coexist — a markdown file opened fresh shows preview left AND
structure right, and the manifest smoke counts both contributions.

After the merge: run the full markdown + structure smokes and the manifest
smoke in your worktree; green before you re-report.

KNOWN AND OUT OF SCOPE: main is currently red on `smoke-editor-harness`
(wrap-off rows) — that is #268's task, a pre-existing red you do not fix
and must not mask. If your smokes trip over THAT failure, note it and move
on; everything you own must be green.

## Invariants in scope

- The markdown split record (#237's auto-open + left placement — absorb,
  do not undo); your own structure-pane records from round 1.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The refreshed READY report carries `## Bycatch`
even if it reads `None observed`.

## End state (mechanical)

An UPDATED report at [report-238-structure-default-right-and-md-toc.md](report-238-structure-default-right-and-md-toc.md)
(newer than this round's filing stamp) stating: merge commit sha, the
resolution taken in each of the three files, and the green smoke evidence.
