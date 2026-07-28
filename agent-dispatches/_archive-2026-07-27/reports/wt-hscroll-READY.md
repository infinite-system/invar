# Horizontal comment styling fix — READY

## Tip

- Branch: `fix-hscroll-comment-styling`
- Tip SHA: `94eda40f1bac047d10e906cd5b774ff6775738a0`
- Commit: `fix(ui): preserve comment styling on horizontal scroll`

## Exact pre-fix reproduction

Command:

```text
scripts/smoke-comment-styling.sh
```

Output against the unmodified renderer after adding the driven horizontal-scroll assertions:

```text
== launch on the comment fixture ==
  PASS  boot ready
== open comment.ts ==
  PASS  buffer open (comment.ts)
  PASS  editor focused (editor)
  PASS  wordWrap default OFF (false)
== no-wrap: JSDoc middle line renders in the comment colour ==
  PASS  control: comment fg (81,89,125,255) differs from code fg (169,177,214,255)
  PASS  JSDoc middle line fg == comment fg (81,89,125,255)
== no-wrap: horizontal scroll past comment prefixes preserves comment colour ==
  PASS  horizontal scroll moved right (scrollLeft=131)
  FAIL  horizontally sliced // tail fg == comment fg: got '169,177,214,255' want '81,89,125,255'
  FAIL  horizontally sliced JSDoc tail fg == comment fg: got '169,177,214,255' want '81,89,125,255'
== no-wrap: find boundary inside horizontally scrolled comment preserves tail colour ==
  PASS  horizontal comment find match count (1)
  FAIL  post-find segment fg == comment fg under hscroll: got '169,177,214,255' want '81,89,125,255'
== wrap ON (Alt+Z): // comment continuation row keeps the comment colour ==
  PASS  wordWrap ON (true)
  PASS  wrap continuation fg == comment fg (81,89,125,255)
  PASS  JSDoc middle line fg (wrap mode) == comment fg (81,89,125,255)
== quit ==
== RESULT: FAILURES ==
```

Exit status: `1`.

## Root cause

`src/modules/ui/EditorPaneRenderer.ts`, in the no-wrap horizontal-offset path, first cut the logical
line into `windowText` and then called `Highlighter.highlightLine(windowText, language)`. Once
`scrollLeft` moved past `//`, `/*`, or the JSDoc-leading `*`, the line-local tokenizer received a
context-free tail and classified it as ordinary code. The same lost role propagated across a find
boundary in that horizontally sliced window.

The corrected path is at `src/modules/ui/EditorPaneRenderer.ts:274-301`.

## Fix

- Tokenize the full logical line once in the no-wrap path.
- Slice the resulting spans to the horizontal grapheme window with the existing
  `Highlighter.sliceSpans` seam.
- Continue slicing those window-relative spans at find, diagnostic, and bracket boundaries, so a
  post-find comment segment retains its original role.
- Extend `scripts/smoke-comment-styling.sh` with driven FrameProbe foreground comparisons for a long
  `//` line, a long JSDoc middle line, and the post-find segment under nonzero horizontal scroll.
- Add a focused unit test covering logical-span slicing at a display-column offset that lands inside
  a wide astral grapheme, plus a second sub-slice modeling the post-find boundary.

## Verification transcript

```text
$ bunx tsc --noEmit
(no output)
exit 0

$ bun test
bun test v1.3.14 (0d9b296a)
 800 pass
 0 fail
 12752 expect() calls
Ran 800 tests across 102 files. [3.24s]
exit 0

$ scripts/smoke-comment-styling.sh
== no-wrap: horizontal scroll past comment prefixes preserves comment colour ==
  PASS  horizontal scroll moved right (scrollLeft=131)
  PASS  horizontally sliced // tail fg == comment fg (81,89,125,255)
  PASS  horizontally sliced JSDoc tail fg == comment fg (81,89,125,255)
== no-wrap: find boundary inside horizontally scrolled comment preserves tail colour ==
  PASS  horizontal comment find match count (1)
  PASS  post-find segment fg == comment fg under hscroll (81,89,125,255)
== wrap ON (Alt+Z): // comment continuation row keeps the comment colour ==
  PASS  wordWrap ON (true)
  PASS  wrap continuation fg == comment fg (81,89,125,255)
  PASS  JSDoc middle line fg (wrap mode) == comment fg (81,89,125,255)
== RESULT: ALL-PASS ==
exit 0

$ scripts/smoke-editor.sh
  PASS  line end visible at max scrollLeft
  PASS  Option+wheel routes to horizontal (0->33)
  PASS  edge hold auto-scrolled (scrollLeft=25)
  PASS  idle frame delta <= 1 over 5s untouched (frame 200 -> 200; clock tick at most)
== RESULT: ALL-PASS ==
exit 0

$ scripts/smoke-wrap.sh
  PASS  wrap-off gutter (OK)
  PASS  wordWrap ON (true)
  PASS  wrapped rows + blank continuation gutters (OK rows=7)
  PASS  H wheel routed to vertical (scrollTop 0->24, scrollLeft=0)
  PASS  wrap-off gutter restored (one line == one row) (OK)
== RESULT: ALL-PASS ==
exit 0

$ node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs
402 annotation(s) resolved, 38 lattice link(s) resolved, 0 problem(s)
exit 0

$ scripts/conventions-gate.sh
conventions-gate: PASS
exit 0
```

`TASK.md` names `node scripts/check_invariants.mjs --all --refs`, but that root-level file does not
exist in this checkout. The canonical checker path mandated by `AGENTS.md` and the invariants skill
was run instead, as shown above.

The working tree is clean apart from the pre-existing untracked `TASK.md`, which was not committed.
