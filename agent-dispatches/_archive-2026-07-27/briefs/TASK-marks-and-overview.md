# TASK — One mark means one thing, and the whole file's marks are visible at once

You are a builder on the Invar terminal IDE. Work ONLY in this worktree. Do NOT run
`scripts/merge-gate.sh`, do NOT push, merge, tag, or delete branches — the conductor does that.
Commit to this branch when done and report.

## The user's report (verbatim)

> "the errors in .ts file should show up like the changes show up in the diff, so you always can see
> the red in the whole file through the scrollbar, and also right now sometimes i see `_` red signifier
> on the left gutter near the line numbers and not sure what it means, does it mean error, or line
> removed? because you implemented latest changes line recently too..."

Two defects, one root: the marking system has fewer distinctions than the meanings it carries.

## Defect 1 — the gutter carries two meanings in one mark. SEPARATE THE COLUMNS.

Established by reading the code, so start from these facts:

- `GutterDecorations.ts` offers exactly TWO glyph shapes: `'bar' | 'underline'`, plus a `color` from
  `'added' | 'modified' | 'deleted' | 'error' | 'warning' | 'info' | 'hint'` and a numeric `priority`.
- `GitDocumentState.ts:50` renders a deletion as `glyph: 'underline'` coloured `palette.deleted` — that
  is the `_` the user could not identify.
- Diagnostics arrive through the same port, and the recorded invariant is *"TS diagnostics render as a
  gutter mark and an underline"* — so a red underline in the gutter meant EITHER "lines deleted here"
  OR "error here", separated only by which red.

**THE USER HAS DECIDED THE RESOLUTION. Implement exactly this:**

1. **The gutter becomes the DIFF column, and nothing else.** Every diff mark uses the SAME shape, the
   bar (`▎`, the one already used for added/modified). No underline, no second shape. Colour alone says
   which kind of change: added, modified, deleted. Shape says "this column is version control".
2. **Diagnostics leave the gutter.** They keep their in-body underline on the offending code, which is
   already unambiguous because it sits under the text rather than in a column, and they gain the
   overview ruler from Defect 2. Red in the gutter then means "deleted" and nothing else.
   This CHANGES the recorded invariant *"TS diagnostics render as a gutter mark and an underline"* —
   refine that record to say diagnostics render as an in-body underline and an overview mark, and state
   in the record WHY the gutter mark was withdrawn (the collision the user hit). Do not silently drop a
   recorded claim.
3. **Keep red for errors** in the body underline and the overview. It is the one colour with no
   competing meaning once diagnostics are out of the gutter, and yellow already means warning.
4. **A RESERVED-MARK TABLE, recorded**, so the next addition cannot silently collide: the mark, its
   meaning, its owner, and the column it lives in. The reason this bug existed is that nothing listed
   which marks were already spoken for. This table is the durable deliverable.

The one nuance to handle honestly: **a deleted block has no line of its own.** Its bar must sit on a
real line (the line below the deletion, or the last line at end-of-file), which means a deletion bar can
sit adjacent to — or on the same line as — a modification bar. State the placement rule you implement,
make the hover name the mark ("3 lines deleted above" versus "modified"), and if a single line carries
both a deletion and a modification, state which colour wins and keep the other recoverable through the
hover. Do not let one silently hide the other.

## Defect 2 — there is no overview ruler

`ScrollbarSync.ts` paints a track and a thumb and NOTHING else: no per-line marks anywhere in the
track. So the user's request — "always see the red in the whole file through the scrollbar" — is new
capability, not a fix.

Required end state:

- An overview column showing, for the WHOLE document, where the marks are: diagnostics and diff marks
  both, at their proportional positions, so a file with one error 900 lines below the viewport shows a
  red pip in the track.
- **It must come from the SAME generator as the gutter marks** — the `GutterDecorations` port that
  landed with the plugin canvas. One source of marks, two renderers: a gutter row and an overview
  column. If you find yourself computing marks twice, the seam is wrong: the two renderers differ only
  in projecting document lines onto (a) one row each and (b) track cells, many lines to one cell.
- Many-to-one aggregation needs a stated rule: when a track cell covers 40 lines containing a warning
  and an error, it shows the HIGHER severity. State the severity order.
- Clicking a track mark should jump there if the surrounding scrollbar contract makes that natural —
  check `ui.invariants.md` first, and if click-to-jump conflicts with the existing drag contract, say so
  and leave it out rather than breaking drag.

## Properties you MUST NOT regress

- **Thumb stability.** There is an invariant that the thumb must not breathe or oscillate, and it has
  regressed twice already. An overview column that changes the track's width or the thumb's geometry
  when marks appear is a regression. Marks live in the track, not by resizing it.
- **idle-quiescence.** At rest the render loop STOPS. Overview marks must be recomputed only when the
  decorations or the document change — never per frame. The behavioural contract will catch a
  violation; run it.
- **Cost.** Aggregating marks is O(document lines) per RECOMPUTE, which is fine, but it must not be
  O(lines) per FRAME, and it must not make opening a large file slower. Measure a large file (10k+
  lines with many diagnostics) and report the numbers.

## Verify by driving

- **The acceptance test for the user's confusion:** drive a real TypeScript file that has BOTH a git
  deletion and a real LSP error, and assert from the PTY that the gutter column contains ONLY the diff
  bar (no diagnostic mark of any shape), that the deletion's bar is a bar and not an underline, and that
  the error is visible in the two places it now lives — the in-body underline on the offending code and
  a mark in the overview ruler. The old ambiguity is gone when the gutter can no longer show a
  diagnostic at all.
- Drive a file whose only error is far below the viewport, and assert the overview shows a mark at the
  proportional position while the gutter shows nothing.
- Assert the aggregation rule with a track cell covering both a warning and an error.
- Assert the thumb geometry is unchanged with and without marks present.
- `bash scripts/behavioral-contracts.sh` green including `idle-quiescence` and the scrollbar contracts.

## Rules

- Full descriptive identifier names, no abbreviations. `.prettierrc`, 80 columns.
- `Static()`/`Reactive()` ivue conventions, `protected` floor, late-read discipline,
  file-name-follows-class, `X.interface.ts` for contracts.
- Read `src/modules/ui/ui.invariants.md`, `src/modules/theme/theme.invariants.md`, and
  `src/modules/workspace/workspace.invariants.md` BEFORE editing — the scrollbar, thumb-stability and
  gutter records are directly in scope and their Rejected-alternatives sections are already paid for.
- Every wait observes the condition its assertion reads. No bare sleeps, no vacuous predicates, no
  clock-based silence assertions.
- Invariant records for both new properties (one mark one meaning + the reserved table; the overview
  derives from the same generator as the gutter), every field including **Scope**. Verify with EXIT
  CODES, never a log tail.
- Run and report exact exit codes: `bunx tsc --noEmit`, `bun test`, `bun scripts/check-file-grammar.ts`,
  both invariant checker passes, `bash scripts/conventions-gate.sh`,
  `bun scripts/check-coverage-ratchet.ts`, `bash scripts/behavioral-contracts.sh`, and every smoke you
  touch three times.
- Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <message-file>`. Leave the worktree
  clean; `git ls-files | grep '^TASK'` must return nothing.

## Report to /tmp/marks-overview-READY.md

The final mark vocabulary as a table (mark, meaning, owner, tier resolutions); the precedence rule for
a line carrying both kinds and how the loser stays recoverable; the severity aggregation rule; the
large-file numbers; proof the thumb geometry is untouched; and anything you could not prove.
