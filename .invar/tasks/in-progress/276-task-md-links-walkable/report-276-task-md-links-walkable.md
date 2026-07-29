# Report — #276 (task views emit md links; links walkable by click)

State: IN PROGRESS — checkpoint below. Not READY yet.

## Checkpoint (2026-07-29, machine shutdown warning)

Recovery point: WIP commit `1d52ca4e` on `fleet/276-task-md-links-walkable`
("WIP #276: generator links + stated link misses"). Worktree:
`.invar/worktrees/276-task-md-links-walkable`.

### Done and verified

1. **Generator end — DONE.** `scripts/tasks/tasks-status.ts`: every task line
   in `project.active-tasks.md` / `project.tasks-completed.md` now carries a
   relative markdown link `[label](.invar/tasks/<state>/<folder>/<task-file>)`
   (functions `taskRecordLinkPath` / `linkedTaskLabel`; wired into `taskLine`,
   `completedLine`, and the no-priority-group branch). Views regenerated:
   81/81 active lines and 53/53 completed lines linked (grep both polarities).
   Self-test gained three arms — every-line-linked, every-target-exists, and
   the strip-polarity control (a link-stripped line goes red). All PASS:
   `bun scripts/tasks/tasks-status.ts --self-test`.
2. **Walkability mechanism — DONE at code level, unit-green.** Authored links
   that do not resolve now STATE why instead of silent nothing:
   - `MarkdownReferenceHit.explicitLink` distinguishes authored links from
     backtick paths (`MarkdownRenderable`, both hit sites).
   - `MarkdownSplitView.referenceAt` keeps unresolved authored links (path
     null); unresolved backtick text stays prose. New option
     `notifyUnresolvedReference(target, x, y, gesture)`.
   - `MarkdownPreviewContent` classifies via new `Workspace.referenceIsExternal`
     (shared scheme rule with `resolveFileReference`): message
     `External link — not opened here: <url>` or `Link target not found: <ref>`;
     tooltip on hover, plus `splitView.linkNotice` on Ctrl-click.
   - `MarkdownPlugin` projects `markdownLinkNotice` into the status snapshot
     and registers a status-bar segment that shows the notice.
   - Successful open clears the notice. Ctrl/Cmd+click gesture unchanged
     (#existing established record); resolved opens go through
     `workspace.openFileInTab`, which already records BOTH jump ends.
   - `bun test src/modules/markdown/` green (87 tests), `bunx tsc --noEmit`
     clean. Isolated PTY debug script proves the loop: ctrl-click on the
     rendered `the docs` http link → status bar paints
     `External link — not opened here: https://example.com/docs`, buffer
     unchanged (script: scratchpad debug-276-notice.ts, disposable).

### In progress / remains

1. **Harness smoke arm is RED** — `scripts/harness/smoke-markdown-harness.ts`
   gained an "unresolvable link states why" section (fixture line
   `See [the docs](https://example.com/docs) or [the missing note](missing-note.md).`
   plus three arms). It times out awaiting the notice after the ctrl-click,
   while the SAME gesture works in the isolated debug. Suspect the click
   position resolved into the wrong pane or a stale snapshot at that point in
   the long smoke (the arm runs right after returning from target.ts to the
   README tab). Next step: instrument the arm (dump snapshot + resolved
   position + status keys on timeout) and fix the arm, not the app.
2. **Drive the real loop in the repo worktree** (open project.active-tasks.md
   → ctrl-click a task line → land in the record → sibling-folder link walk →
   Back twice to the view) and quote the evidence in this report.
3. **Invariant records**: add a NEW markdown.invariants.md record
   ("An unresolvable Markdown link states why" — annotations already sit in
   the code naming it) and refine "A file reference opens from rendered
   Markdown" (its Generates line still says plain "no-op external or missing
   targets"). Then run
   `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`
   (NOT yet run — annotations currently name a record that does not exist yet,
   so the checker WILL flag until the record is written).
4. Full `bun test` + markdown/tasks smokes, prettier/gate, final READY report
   with `## Bycatch`.

## Bycatch

None observed so far (checkpoint; final section will restate).
