# Brief — #218: a Workspace buffer becomes a document plus a view handle

Read first, in order:
1. `.invar/tasks/active/218-workspace-buffer-splits-document-from-view/task-218-workspace-buffer-splits-document-from-view.md`
2. `.invar/tasks/completed/122-editor-becomes-final-contributor/report-122-editor-becomes-final-contributor.md`
   — the finding this sequence comes from. Its "What is left" section names the
   exact imports you are removing.
3. `.invar/tasks/completed/114-modularity-umbrella-provider-runtime/` — the seam
   conventions. All of them apply.

## The objective

`Workspace` stops holding Editors. A buffer becomes a document
(`src/modules/text/TextDocument`) plus a view handle. LSP sync, hover,
completion, and go-to-definition read the document, not `editor.document`.

Done-test, quoted before and after:

```sh
grep -rn "from ['\"][^'\"]*\.\./editor/" --include='*.ts' src/modules/workspace | grep -v '\.test\.'
# before: Workspace.ts (Editor, EditorContributions), DocumentHandle.ts (EditorFoldState)
# after: no output, exit 1
```

## Constraints

- Each step ends in a working app. Drive before and after: open, edit, tab
  switch, LSP hover and completion, at 10 lines and at 100k/500k. Compare the
  frame fingerprint; it must not move.
- The #202 contract holds unchanged: `bufferLiveCount === 2` at 3 clean tabs,
  dirty tabs retained.
- The #114 lesson binds: before you remove a host branch or a cast, write down
  the rule it silently enforces and check an invariant records it. If none
  does, add the invariant FIRST.
- `EditorFoldState` in `DocumentHandle` is view state in a document seam —
  decide where fold state lives (document-adjacent persistence vs view
  property) and record the decision with its reasoning in
  `project.decisions.md`.
- Do not start #219 (PaneContent retrofit). Report the boundary instead if you
  reach it.

## Verification

Exact exit codes: tsc, bun test, conventions-gate, prettier --check,
check_invariants (at or above 947/67/0), coverage ratchet. Every moved test
declared. Positive control for any new guard rule.

Do not run `scripts/merge-gate.sh`. Commit with
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`. Leave the tree
clean. Write prose per `.claude/skills/ste-expression/SKILL.md` (flavored).
Report bycatch explicitly.
