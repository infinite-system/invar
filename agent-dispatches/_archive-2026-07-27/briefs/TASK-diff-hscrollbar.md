# TASK — The diff view's horizontal scrollbar repaints without need (#112)

You are a builder on the Invar terminal IDE. Work ONLY in `/tmp/conductor-diffbar`
(branch `fix-diff-horizontal-scrollbar`, forked from main at `d61124d`). Do NOT run
`scripts/merge-gate.sh`; do NOT push/merge/tag/delete. Commit and report to
`/tmp/diff-hscrollbar-READY.md`. `bun install --frozen-lockfile` first.

## The user's review, verbatim

> "Diff view, when scrolling long files the horizontal scroll bar, reloads, maybe still a remnant
> that it recalculates width, since it's a bit different from regular file, here we usually have
> 2 files combined, so have solidify the non breathing horizontal bar, it's not breathing now, but
> you can see it re-render when it does not need to if we knew the width/height properly."

The user distinguishes precisely: the bar no longer BREATHES (thumb geometry is stable) but it
RE-RENDERS — visibly repaints identical or near-identical content during vertical scrolling.

## Reduction

The comparison surface (two panes, combined width) likely recomputes its content width from the
VISIBLE WINDOW per frame, so each vertical step re-derives width → re-renders the bar, even when
the value lands the same. The single-file path solved this class before (vertical thumb stability
invariant; the completion popup's width cache keyed on immutable identity). The fix: full-content
width becomes a per-(document,diff)-REVISION value computed once and cached — vertical scrolling
cannot touch it; the horizontal bar's cells change only when geometry ACTUALLY changes (resize,
diff refresh, real width change from an edit).

Verify by reproducing first: drive a long diff, scroll vertically, capture consecutive frames, and
show the horizontal-scrollbar row's cells CHANGING today (byte-diff the row region across frames).
Then fix, then show the same drive with the row byte-identical across all scroll frames. Ratchet
that assertion into the diff smoke (frame-region stability during vertical scroll), same shape as
the existing thumb-stability contracts. Also assert the cache invalidates when it must: an edit
that lengthens the longest line updates the bar (positive control for the cache).

## Boundaries

The comparison surface belongs to the source-control plugin (GitComparisonContent /
EditorSurfaceContents citizen). ScrollbarGeometry and the shared viewport are host seams — if the
fix belongs in the shared generator, make it there so ANY two-pane surface inherits it; if it is
the diff surface asking the wrong question per frame, fix the asker. Do not fork the scrollbar
painter.

## Verification — exact exit codes

Full checker suite; the before/after frame-region evidence; the diff smokes and scrollbar smokes
3x each; one loaded run; `idle-quiescence` stays green; coverage declarations (counted grammar,
APPEND). Record/refine the invariant: horizontal scrollbar geometry is a function of
(content-width revision, viewport), never of vertical scroll position.

## Rules

Full descriptive names, 80 columns, ivue conventions. Tab indents; fold marks and reserved marks
are taken. Commit `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <message-file>`; clean tree.
