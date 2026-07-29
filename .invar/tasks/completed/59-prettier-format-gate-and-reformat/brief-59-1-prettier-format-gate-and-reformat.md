# TASK #59 — prettier format gate + one-shot repo reformat + the blank-line grammar rule

You are a codex builder in a fresh worktree cut from main. Read AGENTS.md first (you do this
automatically); the invariant and convention skills it points at govern this work.

## What already exists — do NOT rebuild it

- `.prettierrc` is already `printWidth: 80`, 2-space, single-quote, trailing commas.
- The pre-commit hook already prettier-formats STAGED TypeScript (scope = .prettierignore).

So the format style is settled. Your work is the three missing pieces:

## 1. The one-shot whole-repo reformat

- `bunx prettier --write` across the repo (respect .prettierignore; extend it first if generated or
  vendored trees would churn — decide by LOOKING at what changes, not by guessing).
- ONE commit containing only formatting. No semantic change of any kind may ride in it.
- Add that commit's hash to `.git-blame-ignore-revs` (create the file if absent) IN THE SAME commit,
  and note in the commit message that blame skips it.
- Prove zero semantic change mechanically: `bunx tsc --noEmit` green before AND after, `bun test`
  green before AND after, and `git diff --stat` reviewed for any file where the line-count delta
  looks non-formatting (a formatting-only diff shrinks or wraps; it does not delete logic).

## 2. The blocking gate step

- Add `bunx prettier --check` (same scope) as a BLOCKING step in scripts/merge-gate.sh, beside tsc.
- Positive control, both arms (repo law): plant an unformatted fixture, require the step to name it
  red; remove it, require green. A check that cannot fail is a decoration.

## 3. The blank-line grammar rule — this one is NOT prettier's job

Prettier PRESERVES blank lines (collapsing 2+ to 1) but never INSERTS them. The rule "one blank line
between top-level declarations" therefore belongs to the grammar checker, which already enforces the
file shape imports → class → namespace → interface.

- Add the rule to the existing grammar checker beside that sequence rule.
- Failure fixture required: a file with two abutting top-level declarations must exit 1.
- The mechanical inserter (add the missing blank lines repo-wide) runs IN THE SAME reformat commit
  as part 1, so enforcement and conformance land together — never enforce a shape the tree does not
  yet have.

## Order and discipline

Part 3's inserter and part 1's reformat are ONE commit; part 2's gate step is a second commit that
lands only after the tree conforms. Iterate by driving the checkers directly (inner loop); do not
run scripts/merge-gate.sh yourself — the conductor gates. Do not push, merge, tag, or delete.

## Report

Append to /tmp/59-prettier-format-gate-READY.md: the reformat commit hash, files touched count,
tsc/test results before and after, the gate-step positive-control transcript (red then green), the
grammar fixture result, and a ## Bycatch section for anything you see but were not sent for.
