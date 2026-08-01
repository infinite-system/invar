## In plain words

Back used to remember files and forget a Git change that filled the main area. The editor, Git, and
Markdown now put their own places into one shared trail. I drove a file, a Git comparison, and a
second file, and Back returned through the comparison to the first file.

## READY

Commit: `cedef9783f744fc2488a5494e1f7030c94cdb67c`

The worktree is clean. I committed with `SKIP_GATE=1`. I did not run the merge gate.

## Result

- [NavigationHistory.ts](../../../../src/modules/navigation/NavigationHistory.ts) now owns only the
  bounded sequence, current index, branching, contributor registration, replay, and replay
  suppression. An entry contains a contributor identifier and an opaque payload.
- [EditorNavigationHistoryContribution.ts](../../../../src/modules/editor/EditorNavigationHistoryContribution.ts)
  owns the source file, line, and column payload. It keeps the same-document and same-line collapse
  rule.
- [GitWorkspace.ts](../../../../src/modules/git/GitWorkspace.ts) records every comparison with a new
  token. Forty comparison opens therefore produce forty entries.
- [MarkdownWorkspace.ts](../../../../src/modules/markdown/MarkdownWorkspace.ts) records and restores
  preview and split states without importing Git or the source editor.
- A contributor can reject a payload. History drops that entry and continues in the requested
  direction. A dead entry must not become a Back target that traps the user.
- [Workspace.ts](../../../../src/modules/workspace/Workspace.ts) now marks generic view-state capture
  points. It no longer owns the source editor payload or replay guard.

## Driven evidence

The default experience reproduced the defect in `/tmp/invar-444-history-repro`. The exact visible
trail after opening `alpha.ts`, its Git comparison, and `beta.ts` was:

```text
Before: beta.ts -> alpha.ts -> alpha.ts
```

The Git comparison was absent from both Back steps.

After the change, the same real key and pointer path produced:

```text
After: beta.ts -> sourceControl.comparison -> alpha.ts
```

Forward then produced `alpha.ts -> sourceControl.comparison -> beta.ts`. The existing
[navigation history PTY smoke](../../../../scripts/harness/smoke-navigation-history-harness.ts)
now drives that full trail. Its final run reported `ALL-PASS`, including both command-bar buttons.

This change has no per-row, per-item, or per-frame work. Small and large document scale do not
change the sequence path. The explicit depth case opened forty Git comparisons and retained forty
distinct entries.

## Red then green

I used three positive controls.

- I made the Git contributor return no current state. The PTY smoke stopped at the first Back step
  while it waited for the Git comparison. Restoring the capture made the full smoke pass.
- I removed seam-wide replay suppression. The fake-contributor test failed with `Expected: 2` and
  `Received: 3`. Restoring suppression made it pass.
- I stopped incrementing the Git comparison token. The forty-comparison test failed with
  `Expected: 40` and `Received: 1`. Restoring the token increment made it pass.

## Invariants

- **Programmatic history navigation does not record new history — needs refinement, then upheld.**
  The title remains true. The old scope and mechanism named source locations and a Workspace guard,
  so they did not hold verbatim after generalization. I refined
  [navigation.invariants.md](../../../../src/modules/navigation/navigation.invariants.md) around
  registered view states and suppression inside `NavigationHistory.navigate`. The fake contributor
  proves that replay suppresses every contributor.
- **Editor records — upheld.** None of the eleven records in
  [editor.invariants.md](../../../../src/modules/editor/editor.invariants.md) was stressed. The new
  contributor observes document identity and cursor state, then uses the existing file-open and
  reveal paths. It does not change editing, projection, or frame work.
- **Only the newest Git request mutates state — upheld.** Async generation guards still run before
  `showComparison`, so stale completions cannot record or display a comparison.
- **Commit selection previews without focus transfer — upheld.** History capture does not change the
  existing `transferFocus` choice. The existing focus test still passes.
- **Public classes use the namespace pattern — upheld.** The new source contributor publishes
  `$Class`, `Class`, and `Model`. It has no statics or reactive state, so `Class` selects the raw
  `$Class`.
- The brief's contract map missed **Seams are drawn at the shared generator** and **Plugin boundaries
  grant one authority** in
  [project.invariants.md](../../../../project.invariants.md). Both apply and remain upheld. Sequence
  mechanics have one shared generator. Each view owns only capture, restore, and same-place policy.
  No new domain record or lattice is missing.

## Verification

- `bun test` passed: 2,284 tests, 0 failures, and 71,832 expectations across 349 files.
- `bun scripts/harness/smoke-navigation-history-harness.ts` passed with `ALL-PASS`.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all` passed every record file.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --refs` resolved 1,329 annotations
  and 263 lattice links with 0 problems.
- `git diff --check` passed.
- `bunx tsc --noEmit` exited 2 because of the four pre-existing findings in
  [Drive.ts](../../../../scripts/harness/Drive.ts): lines 921, 922, 968, and 969 read
  `resolvedPosition` from a hover action whose type has no such property.
- `bash scripts/conventions-gate.sh` exited 1 only because it runs the same failing type check. Its
  file grammar, changed-file grammar, static getter naming, AST censuses, and retired smoke checks
  passed. The changed-file grammar inspected 16 TypeScript files and found 0 problems.

## Bycatch

- PRE-EXISTING: [Drive.ts](../../../../scripts/harness/Drive.ts) has four `TS2339` errors at lines
  921, 922, 968, and 969. The file is unchanged by this commit. The repository-wide type check and
  conventions gate reproduced the errors twice. I did not fix this out-of-scope driver defect.
- SUSPECT: `Ctrl+P` did not open Quick Open while a Git comparison owned focus. The drive timed out
  waiting for the Quick Open surface. I reproduced this once and used the Explorer shortcut for the
  task path. I did not change shortcuts because editor-area chrome and shortcut work belong to
  #442 (editor history row and shortcuts).
- CONTRACT MAP: The brief omitted **Seams are drawn at the shared generator** and **Plugin boundaries
  grant one authority**. Both govern this registration seam. I applied them and reported their
  verdicts above.
