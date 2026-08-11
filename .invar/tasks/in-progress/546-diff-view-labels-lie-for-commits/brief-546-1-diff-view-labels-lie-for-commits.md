# Brief 546-1 — the diff view labels lie for historical commits

## In plain words

Every comparison view titles its two sides "Base (HEAD)" and "Current
(working)" even when it shows a historical commit, where the base is the
commit's parent and the current side is the commit itself. Make the
labels say what the sides actually are.

## The deliverable, twice

CODE: the comparison's provenance (working-tree / staged / commit)
supplies both labels through ONE source; DiffView stops hardcoding.
VISUAL (conductor drives before landing): open a git comparison of a
historical commit — the sides read the commit's true base and revision,
not "Base (HEAD)/Current (working)"; the working-tree and staged
comparisons still read correctly.

## Evidence

#543 bycatch (its completed report): DiffView.ts:710/:715 hardcode
`Base (HEAD)` / `Current (working)` for every comparison. Reproduce by
driving: git panel, select a commit, read the two side headers.

## The bar

DRIVE ADVERSARIALLY: each comparison KIND driven and its true labels
asserted (working-tree vs staged vs commit vs commit-range if it
exists); ui-design copy rules; a smoke locks each kind's labels; both
polarities on the new assertion.

## Invariants in scope

[git.invariants.md](../../../../src/modules/git/git.invariants.md) and
any diff-view records — enumerate and answer; the comparison-labeling
record likely refines to name the provenance source.

## Bycatch expected

Report per the taxonomy in [AGENTS.md](../../../../AGENTS.md), even when
None observed.
