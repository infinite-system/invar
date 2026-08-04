# Task #438 — the pre-commit hook launches a merge gate in builder worktrees

Priority: verification-integrity
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium
State: IN-PROGRESS

## What

Builder briefs forbid running `scripts/merge-gate.sh`, but the
pre-commit hook starts it on every commit. #435's builder had to stop
a running gate mid-hook and commit with SKIP_GATE=1 (report, section
Verification). An auto-launched gate while builders live also violates
the gate-concurrency doctrine, from inside the tooling.

## Decision needed (user)

Policy choice: (a) hook detects a fleet worktree (.invar/worktrees/*)
and skips the gate automatically with a printed notice; (b) dispatch
exports SKIP_GATE=1 into builder sessions; (c) keep as is and put the
SKIP_GATE instruction in every brief template. Option (a) keeps the
gate for the user's own checkouts and removes the per-builder
foot-gun; the conductor recommends it.

## Evidence from #487 (2026-08-03)

The commit hook auto-started the FULL merge gate inside a builder
worktree, against the brief's own rule that builders never run it.
The builder had to stop its own hook process and commit with
SKIP_GATE=1. Second live instance of the policy gap; the hook should
detect builder worktrees (or dispatch should plant a worktree-local
config) so briefs and hooks stop contradicting each other.

## Evidence from #493 (2026-08-03) — third instance

The pre-commit hook ran the full merge gate on the builder's first
commit, against the brief. The builder used SKIP_GATE=1 after an
accidental partial gate run. Mitigation now in effect: wave briefs
name SKIP_GATE=1 for builder commits. The structural fix (dispatch
plants worktree-local hook config) is still this task.

## Evidence from #495 (2026-08-03) — fourth instance, opposite polarity

This builder let the hook's gate RUN to completion (green) instead of
bypassing — a full merge gate executed while two other builders were
live, which the concurrency rule forbids. The hook enforces neither
policy; dispatch must decide for the worktree.


## Authorization (2026-08-04)

Engine was 'user' because the hook policy was a DECISION. The user
made it: '/goal launch 1-6' includes this task after five builders
were bitten. The decided direction: builder worktrees get a
worktree-local hook policy planted by dispatch, so builder commits
neither launch the full gate nor need SKIP_GATE by hand; the
conductor's checkout keeps the full hook.
