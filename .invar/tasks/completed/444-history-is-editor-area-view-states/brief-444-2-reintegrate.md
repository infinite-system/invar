# Brief #444 round 2 — merge the new main and re-verify

## In plain words

Your work is good and is not landing yet only because another task
changed the same test file. Bring in the latest main, put both sets of
checks together, and prove they both still pass by running it.

## Why

`#443` and `#448` landed while you were reporting. Main has moved.

`#442` also rewrote `scripts/harness/smoke-navigation-history-harness.ts`
heavily — the conductor's trial merge produced SIX conflicting hunks in
that one file, plus conflicts in `Workspace.ts` and
[navigation.invariants.md](../../../../src/modules/navigation/navigation.invariants.md). #442 is currently red on its own gate and
is being fixed, so it is NOT on main yet.

So this round is only about main as it stands today. Do not merge
#442's branch.

## What to do

1. `git merge main`. Resolve against the merge-base, never against a
   moved main — a main-relative diff reports main's newer additions as
   deletions by your branch.
2. Re-run your full verification on the merged tree. Your smoke passed
   before the merge; that green belonged to a tree that no longer
   exists.
3. `#448` landed a `static-self-read-census` inside the conventions
   gate. If your new contributor classes trip it, fix the read to
   `this` or `this.constructor`. Do not add an allowlist row.

## Heads up on the coming conflict

When #442 lands, you or it will have to union those six hunks in the
navigation smoke: #442 added chrome assertions (project row tone,
breadcrumb row, padded history buttons), you added the
file-to-comparison-to-file trail. **Both sets must survive.** Nothing
to do now — but if you see a cheap way to make your additions
structurally easier to merge (separate helper, distinct assertion
block rather than edits interleaved into existing ones), take it while
you are in there.

## Invariants in scope

Round 1's list stands, plus the two records you correctly found that
my map missed — `Seams are drawn at the shared generator` and `Plugin
boundaries grant one authority`. Re-confirm both hold on the merged
tree.

Also: `Live static reads follow the receiving class`, newly landed in
[project.invariants.md](../../../../project.invariants.md).

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. Write the
`## Bycatch` section even if it reads `None observed`.

## Verification

- `bun test` in FULL, not focused. Two reds reached a gate on #442
  because only focused tests were run.
- Your navigation-history PTY smoke, re-run on the merged tree.
- `bunx tsc --noEmit`, `bash scripts/conventions-gate.sh`, invariant
  checker `--all` and `--refs`.
- Do NOT run `scripts/merge-gate.sh`. Commit with `SKIP_GATE=1`.

## Report

Open with `## In plain words`. State the merge commit, what conflicted
if anything, and confirm the trail still walks file to comparison to
file in the real PTY after the merge.
