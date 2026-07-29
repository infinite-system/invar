# READY - Markdown preview body follows parent growth (#277)

Status: READY

Commit: `398fc88dde7167ef3d7f482c3b9f3dcbb7fab94e`

## Outcome

[MarkdownRenderable.ts](../../../../src/modules/markdown/MarkdownRenderable.ts) now refreshes its
visible rows when OpenTUI commits a new renderable size. The refresh reads the live viewport width
and height. It does not copy layout geometry into a second owner.

[smoke-markdown-harness.ts](../../../../scripts/harness/smoke-markdown-harness.ts) no longer closes
and reopens the preview after the right dock is concealed. The real user path now passes without a
remount.

The PTY contract drives both directions. Concealing the right dock grows the preview and renders
the full `alpha` cell. Restoring the dock shrinks the preview and returns the table to its compact
`alph` cell. The same contract passes with 500-line and 100,000-line fixtures.

## Reproduction

I drove the default 120-by-40 layout before changing production code. I opened the Markdown file
and concealed the auto-revealed right dock with `Ctrl+Alt+B`.

The preview and source borders widened. The body kept the narrow table layout:

```text
│  │ Left │ Cen │ Rig │
│  ├──────┼─────┼─────┤
│  │ alph │ mid │   7 │
```

After I removed the harness remount, `bun scripts/harness/smoke-markdown-harness.ts` exited 1 with:

```text
error: FAIL preview row missing: alpha
```

The split geometry had settled, but `MarkdownRenderable` still held rows generated for the earlier
width.

## Generator fix

The generator is the renderable's committed size. `MarkdownRenderable` now binds its standard
`onSizeChange` callback to its existing `refresh()` seam. That seam regenerates only the visible
rows from the live width and height.

The fix stays in the Markdown presentation boundary. It does not add layout math to
[MarkdownSplitView.ts](../../../../src/modules/markdown/MarkdownSplitView.ts), and it does not add
reactive model state to the renderable.

The behavior was already governed by
[A Markdown file offers a live source preview split](../../../../src/modules/markdown/markdown.invariants.md#a-markdown-file-offers-a-live-source-preview-split)
and
[A scrollable pane height is an input not an output](../../../../src/modules/ui/ui.invariants.md#a-scrollable-pane-height-is-an-input-not-an-output).
No invariant record needed a change.

## Positive control

I removed the new `onSizeChange` binding and reran the workaround-free PTY smoke.

The command exited 1. The preview pane was wide, but its table still painted `alph`; the assertion
could not find `alpha`. I then restored the binding.

This proves that the revised workaround-free check detects the planted defect.

## Verification

`bun test` passed:

```text
1934 pass
0 fail
68673 expect() calls
296 files
```

`bash scripts/smoke-markdown.sh` passed with `RESULT: ALL-PASS`.

`bun scripts/harness/smoke-markdown-harness.ts` passed with
`smoke-markdown-harness: ALL-PASS`. Its 500-line and 100,000-line arms both reported:

```text
parent growth widens the live preview body viewport
parent shrink narrows the live preview body viewport
preview body tracks parent growth and shrink without remounting
```

`bun scripts/harness/smoke-scrollbars-harness.ts` passed with
`smoke-scrollbars-harness: ALL-PASS`.

`bun run typecheck` exited 0.

`node .claude/skills/invariants/scripts/check_invariants.mjs --all` exited 0.

`node .claude/skills/invariants/scripts/check_invariants.mjs --refs` exited 0:

```text
1134 annotation(s) resolved, 222 lattice link(s) resolved, 0 problem(s)
```

`bash scripts/conventions-gate.sh` passed.

`git diff --check` passed.

The commit hook also ran the full merge gate. Its Markdown harness passed, as did the unit,
contract, convention, and behavioral-contract steps. The overall gate was red only because the
unrelated panel-split harness timed out twice. I used the documented `SKIP_GATE=1` commit override.
The conductor still owns the landing gate.

## Bycatch

- The scrollbar smoke reproduced #284 (scrollbar colours captured at construction) at both 500
  and 100,000 lines. A live light-theme switch left the scrollbar colours at `16161e/787c99`.
  I did not fix it.
- The full commit gate's panel-split harness timed out twice while waiting for
  `panelContentOrder` and `panelCellIds` to return to `agent,terminal`. Every earlier arm in that
  harness passed. The failure log is
  `/tmp/merge-gate-failures.951389/smoke-panel-split-harness-.log`. I did not fix it.
- The bracket-match harness timed out on its first gate attempt and passed the automatic retry.
  This is an intermittent failure. I did not fix it.
- Suspect: `@opentui/core`'s `SelectableText` resize override does not delegate to the base
  `onSizeChange` callback. A child-size probe therefore never fired. The parent renderable's
  callback avoids that dependency behavior. I did not change the dependency.
- The untracked worktree brief wrapper used task-folder-relative paths from the worktree root and
  omitted both contract anchors. The baseline reference check reported two problems. I corrected
  that excluded local input, and the final reference check reported zero problems. It is not part
  of the commit.

## Handoff

The branch is `fleet/277-markdown-preview-body-viewport-settles-after-parent-growth`.

The worktree is clean after commit.

COMPACTION: one.

conventions @ `2e6c207555c2aeecd49d460e5d8ca3ed8ba030af`
