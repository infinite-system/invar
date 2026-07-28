# READY — #102 Markdown preview aligned tables

Commit: `f28f0ee7d8ca6ad8cd259ed7624eab80c3365f21`

Branch: `feat-markdown-tables`

Worktree: clean

## Result

Markdown preview tables now render as a fixed terminal cell grid. The parser owns pipe syntax and
produces rows, cells, inline spans, links, and per-column alignment. `MarkdownPreview` assigns equal
shares of the current pane width in display cells, truncates cell content without wrapping, and
materializes only table rows intersecting the visible window. `MarkdownRenderable` paints the
structured projection with the active theme's table-border vocabulary; it does not re-parse pipes.

The width policy deliberately does not scan body content for natural widths. Width comes only from
the pane width and column count, so a 1,000-row table has the same per-visible-row projection cost
as a 10-row table. Whole-preview materialization remains available only for explicit find and
selection operations and is cached by parsed revision, width, and border vocabulary.

Malformed syntax degrades to the existing paragraph projection. A missing separator or ragged row
therefore remains visible as raw, wrappable Markdown text; neither case crashes nor silently loses
the separator or extra cell.

## Driven before picture

Driven in the real PTY at the default 120x40 geometry against the repository's
`project.canvas-census.md`.

Before the change, tables were only partially handled: the Markdown separator row was swallowed,
each source row was flattened independently with a raw-looking box divider, and long cells wrapped
without retaining shared column boundaries.

```text
╭─Preview───────────────────────────────╮
││ Kind │ Meaning │                     │
│  CONSTRUCT │ the host builds a │      │
│  domain object (new X, a createX() │   │
│  STATE │ the host owns a │            │
╰───────────────────────────────────────╯
```

## Driven after picture

The same document and geometry after the change:

```text
╭─Preview───────────────────────────────╮
││ Kind             │ Meaning          ││
│├──────────────────┼──────────────────┤│
││ CONSTRUCT        │ the host builds  ││
││ STATE            │ the host owns a  ││
╰───────────────────────────────────────╯
```

The smoke fixture additionally drove ASCII, CJK (`漢字`), emoji (`🙂`), and combining text (`é`)
through the emulator grid. Header, ASCII, and wide-character rows had identical terminal-cell
boundary columns. Left, centre, and right markers placed content at the asserted cell positions.

At 60x25 the cells truncated through the existing overflow-hidden text projection, and the
preview's outer right border remained at terminal column 59. Nothing painted into the neighbouring
surface.

## Scale parity

The same 100x30 PTY geometry and settings were used for generated 10-row and 1,000-row tables:

```text
10 rows:   top boundaries [70,80,89,98], scrollTop 0
1000 rows: top boundaries [70,80,89,98]
           tail boundaries [70,80,89,98], scrollTop 981
```

The projection counter recorded `[5, 5]` table content rows materialized for a six-row viewport at
both scales. `totalRows` visited zero table cells. Parsing remains a document-revision operation;
ordinary painting and scrolling do not parse, measure, or materialize offscreen table cells.

## Positive control

I deliberately changed centre alignment to left alignment, then ran the focused projection
contract. It went red as required:

```text
Expected: 16
Received: 15
at MarkdownPreview.test.ts:203:38
0 pass, 1 fail
```

The defect was removed before the final verification.

## Contract and theme evidence

- Added the canonical `Markdown tables align by display cells` invariant and linked parser,
  projection, and painter annotations.
- Added a tiered `TableBorderGlyphSet` to the theme vocabulary.
- Unicode borders `│ ─ ┼ ├ ┤` are one terminal cell according to the shared width authority and
  have no reserved semantic-mark owner.
- The ASCII theme rung degrades the same vocabulary to `| - +`.
- Emulator assertions cover shared display-cell boundaries, marker alignment, wide glyphs, narrow
  clipping, missing separators, and ragged rows.

## Final verification

All required commands were run once in the final pass, except the requested Markdown smoke which
was run independently three times:

```text
bunx tsc --noEmit                                                    exit 0
bun test                                                             exit 0
  1656 pass, 0 fail, 67408 expect() calls, 249 files
bash scripts/conventions-gate.sh                                     exit 0
node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs
                                                                     exit 0
  875 annotations resolved, 67 lattice links resolved, 0 problems
bun scripts/check-coverage-ratchet.ts                                exit 0
bun scripts/harness/smoke-markdown-harness.ts   run 1                exit 0
bun scripts/harness/smoke-markdown-harness.ts   run 2                exit 0
bun scripts/harness/smoke-markdown-harness.ts   run 3                exit 0
```

`scripts/merge-gate.sh` was not run.

## Bycatch

- The status bar displayed the stale product label `Fable Test` while driving
  `project.canvas-census.md` in the repository workspace. It appeared in both the before and after
  120x40 frames and therefore reproduced a second time. Not fixed; it is outside this task.
