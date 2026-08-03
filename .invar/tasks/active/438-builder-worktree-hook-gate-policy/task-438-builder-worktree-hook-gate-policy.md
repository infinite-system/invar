# Task #438 — the pre-commit hook launches a merge gate in builder worktrees

Priority: verification-integrity
Engine: user
Environment: linux
Model: any explicit user choice
Effort: low
State: ACTIVE

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
