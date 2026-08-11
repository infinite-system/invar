# 548 — land refuses committed priming files

Priority: verification-integrity
State: ACTIVE
Engine: claude
Environment: linux
Model: fable-5
Effort: low

## In plain words

The dispatcher injects BUILDER-FUNDAMENTALS.md and appends AGENTS.md per
worktree. land.sh removes them only when UNTRACKED. A builder that
COMMITS them defeats the guard — they merge into main. Make land.sh (or
the gate) refuse when either appears in the committed branch diff.

## Evidence

- #546 (2026-08-11): builder committed BUILDER-FUNDAMENTALS.md (2814
  lines) into the branch; caught only by the conductor's structural
  read of the diff stat, not by any mechanical guard.

## Outline

land.sh: before merge, `git diff <merge-base>..<tip> --name-only` must
contain neither BUILDER-FUNDAMENTALS.md nor AGENTS.md (AGENTS.md is
legitimately edited sometimes — refuse only if its diff is the
dispatcher's appended fundamentals block, or refuse committed
BUILDER-FUNDAMENTALS.md unconditionally and AGENTS.md only when its
change matches the injection marker). Positive control: a branch with a
committed priming file fails; a clean branch passes; a legitimate
AGENTS.md edit passes.
