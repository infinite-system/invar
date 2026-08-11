# Brief 543-1 — the git drill-down diff does not open

## In plain words

Clicking a file inside an expanded commit should open its before-and-
after view. The smoke proves it does not open, and it was broken before
#542. Find whether the app path regressed or the smoke's row arithmetic
drifted, then fix the one that is wrong.

## The deliverable, twice

CODE: the Enter-to-open-diff path works (or the smoke's arithmetic is
corrected, argued with evidence — never both blind).
VISUAL (conductor drives before landing): expand a commit in the git
log, Down to a file, Enter — the side-by-side diff opens with content.

## Evidence

#542's premise correction (its completed report): smoke-git-log.sh RED
at base a57067e5, stash-reproduced — Down+Enter leaves showingDiff
false. Two named rivals: app regression vs smoke row arithmetic.
Separate them by DRIVING first (the graph shows selection state; the
screen shows rows).

## The bar

Drive before diagnosing; both polarities on the fix; the full
smoke-git-log families green; neighbor sweep (Esc-return, viewed-branch
freshness — the passing families must stay green).

## Invariants in scope

[git.invariants.md](../../../../src/modules/git/git.invariants.md) —
enumerate and answer; the drill-down/diff records are the likely
implicated set.

## Bycatch expected

Report per the taxonomy in [AGENTS.md](../../../../AGENTS.md), even when
None observed.
