# TASK — #162: Quick Open opens the wrong file while publishing the right one

Work ONLY in `/tmp/conductor-quickidentity` (branch `fix-quick-open-identity`, cut off latest main).
Do NOT run `scripts/merge-gate.sh`; do NOT push, merge, tag or delete anything. Report to
`/tmp/quickidentity-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`, then `bun install` FIRST — a
fresh worktree has no `node_modules` and every preflight reds on unresolved imports until you do.

## The defect

A user opens Quick Open, sees `TASK.md`, presses Enter, and `project.tasks.md` opens.

This was found as bycatch by the drive-quickstart builder and reproduced repeatedly, including on
a dedicated second probe. Exact sequence:

1. fresh isolated HOME — `HOME=$(mktemp -d)`; the harness HOME is shared and persistent, and a
   leaked `settings.json` will make your run disagree with everyone else's
2. workspace `/tmp/conductor-quickidentity` — **the repository is its own workspace**, which is
   the case the failure was seen in
3. wait for ready
4. `Control+p`
5. type `TASK.md`
6. wait for the full query/match publication
7. Enter

Observed published state at the moment of Enter: `quickOpenSelected=0`, `quickOpenMatches=1`, and
`TASK.md` visibly rendered in the frame.

## Why that published state is the whole clue

Every observable says the correct file is selected. Matching is right, ranking is right, the paint
is right. So the defect lives strictly between **the selection that was published** and **the open
that was performed** — the open path is resolving its target by something other than the identity
the list already established. The candidates, in the order they are worth checking:

- an INDEX into a collection that is ordered or filtered differently at open time than at publish
  time (`quickOpenSelected=0` is an index, and index-into-the-wrong-list is the classic form);
- a RE-QUERY at Enter time, where the second query returns a different first result;
- a path resolved against a different root than the one the row was built from.

**This is the identity-versus-proxy class, and this project has now hit it seven times** in other
forms: `pgrep -f` matching its own argv, a `sed` re-matching a duplicated bare value, a probe
keyed to `src.index('    unicode: [')` hitting the wrong key. Every instance had the same shape —
the acting code RE-DERIVED its target instead of using the one already in hand. Find the
re-derivation and delete it. Do not add a correction layer on top of it; that leaves the defect
and hides it.

## Order of work — driving is the inner loop, not testing

1. **Reproduce by driving.** No assertion written yet. If you cannot see `project.tasks.md` open,
   you cannot fix it. `bun run drive --open <dir> --geometry 120x40` is the on-ramp (#137).
2. **Instrument the seam, not the whole path.** Print the identity the list publishes and the
   identity the open path consumes, at the moment of Enter. The bug is the difference between
   those two values; everything else is context.
3. **Iterate drive → change → drive.** One instrument at a time, never the suite, never 3x.
4. **Write the contract only after the symptom is gone.**

## The contract to lock in

Assert **identity**, not name-matching: the document opened is the same entry the list published
as selected. A test that types `TASK.md` and asserts a file named `TASK.md` opened will pass in a
workspace where no confusable file exists, which is most of them — the defect needs
`TASK.md` and `project.tasks.md` both present to appear at all, and a name assertion would have
been green throughout the period this bug existed.

Include the confusable-pair fixture in the test. That is the load-bearing part.

## Scope note from the reporter, worth reading before you widen anything

The driver uses a disposable single-file workspace for FILE arguments, while DIRECTORY arguments
drive the requested workspace in place. The failure was seen in the directory case. If you find
the two paths construct entries differently, that is a finding — but fix the identity defect
first and report the divergence separately rather than unifying both in one branch.

## Constraints

- **Never widen a wait to make the right file appear.** The publication is already arriving; this
  is not a timing defect.
- Positive control mandatory: after the fix, re-introduce the defect and quote the red, then the
  green. A test that cannot fail is worse than no test.
- If the fix turns out to be in the harness rather than the app, say so loudly and prove it by
  driving the real path — but the reporter saw the WRONG FILE OPEN in a real frame, so treat
  "stale probe" as a claim needing evidence, not a default.

## Repo law

`export let Class = $Class`; the `Static()` wrapper lives at the `$Class` anchor
(`$Class = Static($Raw); Class = $Class`), never `Class = Static($Class)`; `Reactive()` is exempt
because it mutates in place. conventions-gate rules 1.8/1.9/1.95 enforce all three across `src`
and `scripts`. Invariant records live at `src/modules/<domain>/<domain>.invariants.md` and are
cited by ROOT-RELATIVE path. Full descriptive identifier names — `increment` not `inc`, `index`
not `i`. 80 columns.

## BYCATCH

Report every defect you SEE; fix only the one you were SENT for. Put them under a `## Bycatch`
heading with the exact reproduction, how many times it reproduced, and which commit. The
conductor converts them into tasks — five were lost last night because they were reported and
never converted, so the heading is load-bearing.

## Verification — quote exact exit codes, never read `$?` after a pipeline

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` (at or above 907
annotations / 67 lattice links / 0 problems), `bun scripts/check-coverage-ratchet.ts`, plus the
driven reproduction before and after.

Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
