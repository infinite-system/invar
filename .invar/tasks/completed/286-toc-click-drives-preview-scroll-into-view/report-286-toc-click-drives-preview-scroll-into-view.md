# READY — TOC clicks drive preview scroll into reading view

TOC click drives preview scroll into reading view (#286) is complete.

Commit: `349d2e5b6296db248b7c1dba686d129c7456efcb`

The worktree is clean.

## Result

A Structure table-of-contents click now reveals the selected heading in both the source pane and
the Markdown preview. Both panes use a two-row reading margin when document edges permit it. The
target does not land on the trailing body row when a full page remains.

`Workspace.revealSourceLocation` is the source-jump seam. Structure activation, definition jumps,
navigation-history restores, and source Find matches use it. `EditorSurfaceClaims` forwards the
source line only to an occupying surface that presents the same document. The Markdown split waits
until its parsed revision matches the source revision before it follows.

`TextViewport.scrollTopForTarget` is the one placement generator. Its `nearest` mode preserves
ordinary cursor movement. Its `reading` mode supplies the two-row margin for explicit source jumps
and preview follow. The source and preview keep their own row projections, but they do not repeat
the placement policy.

The dead-last-row work (#285) was not changed.

## Driven evidence

I reproduced the defect first with:

`bun run drive --open project.conductor.archive.md --geometry 140x40 --click 'text=Part 10 — The big'`

Before the change, the source cursor moved to line index 530. The source heading painted at row 20,
the last body row. `editorScrollTop` was 516. The preview stayed at
`markdownPreviewScrollTop=0`.

After the change, the same click painted the source and preview headings at row 8.
`editorScrollTop` was 528 and `markdownPreviewScrollTop` was 1753. The pane body started at row 6,
so both headings had two rows of context and sat in the top third.

The durable PTY smoke drives the same click at 140x40 at both scale ends:

- 10 lines: source row 10 and preview row 14 in body rows 6–37. Both are in the top third.
- 100,000 lines: source row 8 and preview row 8 in body rows 6–37. Both have two context rows.

## Positive control

I disconnected `MarkdownWorkspace.revealPresentedSourceLine` from the mounted preview and ran the
Markdown PTY smoke. It turned red with:

`FAIL 100000-line TOC click scrolls source and preview away from the opening section`

I removed the plant. The same smoke then passed.

## Contract changes

I added `Explicit jumps use one reading position` to `src/modules/text/text.invariants.md`.
I refined the Markdown split record to require same-revision preview follow. I refined the
Structure jump record to require reading placement and same-document projection follow.

The invariant checker resolved 1,112 annotations and 217 lattice links with 0 problems.

## Verification

- `bash scripts/conventions-gate.sh` — PASS.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` — PASS, 0 problems.
- `bun test` — 1,902 pass, 0 fail, 68,490 expectations across 293 files.
- `bun scripts/harness/smoke-markdown-harness.ts` — ALL-PASS.
- `bun scripts/harness/smoke-plugin-manifest-harness.ts` — PASS, including the Structure navigator
  outline, jump, degradation, and reinstall arm.
- `python3 .claude/skills/ste-expression/scripts/ste-lint.py
  src/modules/text/text.invariants.md src/modules/markdown/markdown.invariants.md
  src/modules/structure/structure.invariants.md` — completed with no flagged lines.
- The mandatory pre-commit merge gate — ALL-PASS.

## Bycatch

- The first post-change exploratory drive published settled status for the parsed Markdown and
  ready Structure outline, but its printed grid still showed `Parsing Markdown…` and
  `No file is open.` The same command succeeded on the immediate repeat. I did not reproduce it a
  second time.
- The mandatory merge gate's unrelated `smoke: panel-split harness` timed out once in the
  six-worker pool. Its built-in quiet retry passed. The gate recorded this as a flake. I did not
  change that harness.
