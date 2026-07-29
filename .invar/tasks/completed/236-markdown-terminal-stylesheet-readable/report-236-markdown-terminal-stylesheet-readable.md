# READY — #236: a terminal stylesheet makes markdown files show very well

Branch: `fleet/236-markdown-terminal-stylesheet-readable`
Commits: `5d7373c1` (smoke grid-column fix), `bdc9ea57` (the stylesheet).
Tree: clean.

## What changed

One new seam, `src/modules/markdown/MarkdownStylesheet.ts`, now owns every
presentation decision for rendered markdown: pane padding, vertical margins
(CSS-collapsed between neighbours), list indents, quote and code-frame
glyphs, palette color SLOTS, and text attributes. `MarkdownPreview` asks it
for geometry. `MarkdownRenderable` asks it for paint. Themes stay upstream:
the stylesheet names slots, the painter resolves them against the active
palette. A new record *Markdown presentation resolves through one
stylesheet* is in [src/modules/markdown/markdown.invariants.md](../../../../src/modules/markdown/markdown.invariants.md), and the
census test in `MarkdownStylesheet.test.ts` proves the two consumers hold
no presentation vocabulary of their own (zero box-drawing or bullet
literals; zero direct palette slot reads beyond the pane fg/bg defaults).
The census went RED on a planted glyph and a planted palette read before I
trusted it (positive control), then green with the plants removed.

What the reader gets, element by element:

- Padding — the user's named pain: 2 display cells at the left and right
  pane edges, 1 blank row on top. Tables, rules, and code frames inset with
  the text.
- Headings: an intensity ramp (h1 bold underline accent, h2 bold accent,
  h3 accent, h4 bold, h5/h6 dim bold) plus 2 rows of air above h1/h2.
- Blockquotes: the accent bar now runs down EVERY wrapped row (it used to
  drop off after the first row), quote text renders dim italic, and
  hard-wrapped quote lines reflow like paragraph lines (parser joins runs
  with a space; a blank quoted line still separates quote paragraphs).
- Lists: items sit single-spaced with a hanging indent; a list still
  separates from surrounding paragraphs by one row (collapsed margins).
- Code fences: the left border now holds on continuation rows and every
  row pads to the frame width, so the right border stays on one column
  (both used to float). Code wraps with the `code` break profile.
- Wrapping: `visitWrapped` now measures display cells and breaks through
  the shared `WrapBreakOpportunity` generator — the same seam the editor
  and agent panes use. CJK lines can no longer overflow a row (locked by
  test); the old code wrapped by UTF-16 length with `lastIndexOf(' ')`.
- Tables: #174's display-cell alignment and ragged-table fallbacks carry
  over unchanged; the table block insets by the pane padding.

## Frame evidence

Fixture: `.invar/tasks/*/236-markdown-terminal-stylesheet-readable/236-sample-elements.md`
(headings 1–5, wrapped paragraph, aligned table, blockquote, nested lists,
ordered list, ts code fence, rule, inline sweep). Drive:
`bun run drive --open <fixture> --geometry 120x40 --key Control+Shift+v
--wait-for-status 'markdownParsing=false' [--click 100,12 --key PageDown ...]`.

BEFORE, 120x40 (text flush at the pane edge, headings flat, quote bar and
fence borders lost on continuation rows, lists double-spaced):

```
│Invar Markdown Preview                 │    │  1. ordered item one            │
│                                       │    │                                 │
│A paragraph of body text that is long  │    │┌ ts ────────────────────────────┐
│enough to wrap at eighty columns and at│    ││ const stylesheet = │
│one hundred twenty columns, so the     │    │  MarkdownStylesheet.Class.reso │
│ Reading is the new writing. The      │ ← bar only on first quote row
│  preview must give body text breathing│
```

AFTER, 120x40 — top, quote/list, and fence regions:

```
│                                       │  │  │ Parser    │ owns syn │  done │ │
│  Invar Markdown Preview               │  │                                   │
│                                       │  │  Blockquote                       │
│  A paragraph of body text that is     │  │                                   │
│  long enough to wrap at eighty        │  │  │ Reading is the new writing.    │
│  columns and at one hundred twenty    │  │  │ The preview must give body     │
│  ...                                  │  │  │ text breathing room from the   │
│                                       │  │  │ pane edges, and blockquotes    │
│  Tables                               │  │  │ must look distinct.            │
│                                       │  │
│  │ Component │   Role   │    State │  │  │  • first item at level one        │
│  ├───────────┼──────────┼──────────┤  │  │  • second item with a longer body │
│                                       │  │    that should wrap and keep its  │
│  ┌ ts ─────────────────────────────┐  │  │    hanging indent aligned ...     │
│  │ const stylesheet = Markdown     │  │  │    • nested item at level two     │
│  │ Stylesheet.Class.resolve(       │  │  │      • nested item at level three │
│  │ 'heading', 1);                  │  │  │  1. ordered item one              │
│  └─────────────────────────────────┘  │  │  2. ordered item two              │
```

AFTER, 80x40 (preview pane ~19 cells): padding holds, the table truncates
cell text without moving a border or corrupting a neighbour pane:

```
│  Tables           │
│                   │
│  │ Co │ Ro │ S │  │
│  ├────┼────┼───┤  │
│  │ Pa │ ow │ d │  │
│  │ Pr │ ow │ d │  │
│  │ Re │ pa │ d │  │
│                   │
│  Blockquote       │
```

Scale parity: `236-generate-large-markdown-fixture.py` (task folder) makes
a 100,000-line file (40,000 blocks: headings, paragraphs, quotes, tables).
Boot + parse + toggle + three PageDowns settle in 2.3 s total real time;
each PageDown settles as one frame, `markdownBlockCount=40000`,
`markdownScrollTop` advances 15/frame — same feel as the 37-line fixture.
The projection tests lock the numbers: `totalRows` at 10 and 1000 table
rows materializes the same 6 visible rows.

## Verification (exact exit codes)

- `bunx tsc --noEmit -p tsconfig.json` → exit 0.
- `bun test` → exit 0 (1823 pass, 0 fail, 278 files) — includes 12
  markdown-module test files (72 tests) and 6 new stylesheet tests.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all
  --refs` → exit 0 (1035 annotations, 217 lattice links, 0 problems).
- `bun scripts/harness/smoke-markdown-harness.ts` → ALL-PASS (21 PASS),
  run on the final code state.
- Census positive control: planted `•` in `MarkdownPreview.ts` and a
  direct `palette.accent` read in `MarkdownRenderable.ts`; the census test
  failed on both; removed the plants; green.
- merge-gate NOT run (per brief). Committed with `SKIP_GATE=1`.

## Bycatch

- FIXED (own commit `5d7373c1`): `smoke-markdown-harness.ts` compared
  `String.indexOf` positions (UTF-16 units) against `rowCells` display
  columns. The scales diverge when an emoji (surrogate pair) or combining
  mark paints earlier in the same screen row. My spacing rows moved the
  preview's 'alpha' row beside the source pane's CJK/emoji row and the
  latent mismatch went red. Fix: `displayColumnOfText` counts GRAPHEMES of
  the snapshot row text. Category: an instrument measuring in the wrong
  unit. The remaining `indexOf` uses in that smoke are existence checks
  only; they do not compare against cell columns.
- Suspect, reproduced twice: the source editor paints a stray `t` glyph in
  the cell after an emoji. Repro: open a file containing
  `| 漢字 | 🙂 é | 42 |`, `bun run drive --open <file> --geometry 120x40`;
  the boot frame's source row shows `| 🙂t é |`. No preview involved;
  pre-existing. Likely the wide-glyph spacer cell or syntax highlighting on
  a surrogate pair.
- Suspect, reproduced in before AND after frames at 80x40 and 120x40: on
  the LAST visible editor row (row 20 in a 40-row grid), the source pane's
  right border cell is sometimes blank where a long line truncates —
  neighbouring rows show `…l│`, that row shows `…t  │`. Pre-existing,
  outside markdown scope (editor pane painting).
- Contract layer: the invariants checker notes the record *A markdown
  parse can outlive its source revision* has no `// invariant:` annotation
  referencing it (coverage note, pre-existing). Several other modules carry
  the same class of note; listing them is the checker's output tail.
- Generator drift (adjacent, not touched): `MarkdownParser.readList` still
  joins multi-line list items with hard newlines while paragraphs and (now)
  blockquotes reflow — a third re-roll of the same prose-reflow decision.
  Small, but it is the same generator; a follow-up could route it through
  one joiner.

## Notes for the conductor

- Preview PLACEMENT untouched (#237's territory). No changes outside
  `src/modules/markdown/`, the markdown smoke, and the module tests.
- Copy/find semantics: rendered-text copy now includes the pane padding
  spaces and quote bars, exactly as painted — consistent with the existing
  "you copy what you see" contract; the smoke's copy/paste checks pass.
- Updated test expectations in `MarkdownPreview.test.ts` are geometry
  shifts only (borders moved by the 2-cell inset; totalRows +1 for the top
  padding); every invariant assertion (viewport bound, scale parity,
  boundary equality) is unchanged in kind.
