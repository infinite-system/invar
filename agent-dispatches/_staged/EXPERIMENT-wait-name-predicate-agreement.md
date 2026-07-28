# EXPERIMENT — does a wait's PREDICATE match the claim in its NAME?

**This is an experiment. It lands on `experiment/wait-name-predicate-agreement` and NEVER on main.**
Adoption is the user's call, not mine and not yours. Your job is to make the decision cheap by
producing evidence, including evidence that kills it.

Work ONLY in this worktree. Do NOT push, merge, tag or delete. Report to
`/tmp/EXPERIMENT-wait-name-predicate-agreement-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`, then
`bun install` FIRST.

## The fact that motivates this

Over 2026-07-27/28, of every merge-gate red whose cause was CONFIRMED, **all of them were defects in
the harness, not in Invar.** Five separate harnesses regressed from #168's wait conversion; terminal-stage
has failed eight attempts running on a compound predicate whose subject is visibly on the grid;
shortcut-help and panel-chrome each time out on generic waits. The one open candidate for a real product
cause is markdown's ragged row (#174), and even that passed three merge-base gates.

The instrument is now the dominant defect source in this repo, and it gates everything.

## The reduction

A wait carries two claims about the same thing:

- a **NAME** — a human sentence, e.g. `lengthening the widest line refreshes the diff horizontal bar`
- a **PREDICATE** — a machine test, e.g. `frame !== previousFrame`

**Nothing verifies that the second is as narrow as the first.** #189's repair is the clean instance: the
name promised a specific horizontal-extent refresh; the predicate accepted any byte change in the row, so
an intermediate 44-cell thumb satisfied it before the real result arrived. Same shape in #188's two
repairs. The established invariants (`Harness waits observe conditions not frame ordinals`, `Every wait
names itself`) both hold in every one of these cases — they are necessary and not sufficient, because
they constrain the FORM of a wait and never the AGREEMENT between its two claims.

## The candidate instrument

For each wait call site: does the predicate's body reference anything the description names?

Structurally — parse with `scripts/ast-query.ts` (read it first; it is the repo's existing AST tool):
1. collect wait call sites under `scripts/harness` with a description argument and a predicate argument;
2. extract content words, identifiers and numeric literals from the description;
3. extract identifiers, property accesses and literals from the predicate body;
4. flag sites where the intersection is EMPTY while the description contains a specific claim.

## READ THIS BEFORE WRITING THE CHECK — the repo has rejected this class twice

A syntactic pattern standing in for a semantic property has failed here twice: the `.value` lint the
user rejected, and `validate_smoke_classification`, which decided timing-sensitivity by grepping domain
vocabulary (`Momentum|glide|...`) and missed its own target because a file said "animation" instead. The
fix in that case was a domain-INDEPENDENT structural discriminator: a deadline loop ADDS to
`performance.now()`, a measurement SUBTRACTS two readings, so `performance\.now\(\)\s*-` was the tell.

Your check is at risk of the same failure. Find the structural discriminator, not a word list. If you
cannot find one that beats the acceptance bar below, **say so and stop** — a negative result recorded
honestly is a successful outcome of this experiment and there is precedent for keeping one (the
"don't parallelize the cheap checks" measurement).

## ACCEPTANCE BAR — name these before implementing anything else

The experiment is adopted only if the instrument generates real findings and predicts real
impossibilities. State each of these as a prediction FIRST, then measure:

1. **Must name all five known regressions.** Check out the tree at each pre-repair commit and require
   the report to flag: #189's scrollbar wait (`ae2fa98`'s parent), #188's two (`3ad574c`'s parent), and
   the two remaining scrollbars sampling races. A detector that misses the cases it was designed from
   is dead — report the miss and stop.
2. **Precision must be stated as a number, not asserted.** Run over current `scripts/harness` and
   MANUALLY adjudicate every flag: true finding, or false positive with the reason. A flag rate above
   roughly a third of all wait sites makes it unusable as a gate step regardless of recall — say so.
3. **It must name at least one wait nobody has reported yet.** If it only rediscovers known repairs it
   is a regression test, not an instrument. That is a weaker but still real outcome; label it correctly.
4. **The generic case must survive.** #168 correctly identified three sites whose actual claim IS "something
   repainted." The check must have a way for a site to declare that legitimately — and the declaration
   must be visible, not a suppression comment nobody reads.
5. **Positive control.** Plant #189's pre-fix predicate under its post-fix name and require the report to
   name it; remove and require silence.

## Six signals that mean DO NOT adopt

Report any that occur, plainly, without arguing around them:
- the check needs a per-site exception list that grows;
- adjudicating its output takes longer than reading the waits directly;
- it flags sites whose predicates are correct more often than sites whose predicates are wrong;
- making it quiet requires renaming waits rather than fixing predicates (that is worse than the defect);
- it depends on a vocabulary or word list to work;
- it cannot name the five known instances.

## REPORT-ONLY. Not a gate step. Not blocking.

Do not add it to `scripts/merge-gate.sh`. Do not fail any exit code on its findings. Print, count, rank.
Whether it ever blocks is a later decision that needs its precision number first.

## Forbidden

Do not repair any wait you find — that is #192's scope and repairs here make your precision number
unmeasurable. Do not widen a timeout. Do not touch `scripts/merge-gate.sh`. Do not restore a removed
primitive; the `awaitNextCompletedFrame` / `awaitQuiescence` censuses stay at zero identifiers.

## Repo law

`export let Class = $Class`; the `Static()` wrapper lives at the `$Class` anchor; `Reactive()` is exempt.
Full descriptive identifier names — no abbreviations. 80 columns. Invariant records cited by
ROOT-RELATIVE path.

## Verification — quote exact exit codes, never read `$?` after a pipeline

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`,
`bun scripts/check-coverage-ratchet.ts`, plus the five acceptance measurements above as tables.
You do NOT need a full merge-gate: you add no gate step and change no product code. Say so explicitly
rather than skipping it silently.

Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.

## BYCATCH

Report every defect you SEE; fix nothing you were not sent for. Under `## Bycatch`, with exact
reproduction, repetition count, and **whether you verified it at the merge base.**
