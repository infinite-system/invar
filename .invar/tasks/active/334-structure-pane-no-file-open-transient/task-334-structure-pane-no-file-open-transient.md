# Task #334 — Structure pane shows "No file is open." beside an open file (transient)

Priority: flake-evidence
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
State: ACTIVE

## What was seen (builder evidence, #322 round 1, 2026-07-30)

During a full `bun test` pass, `Drive.test.ts` observed the Structure pane
showing "No file is open." while a 3,352-line Markdown file was open in the
editor. The focused test passed on the second observation. Not reproduced
since. One observation.

## Why it matters

This is a status-lie instance: a pane asserts an absence while the thing is
present. Same family as #322 (status/editor column stale in preview). If it
reproduces, check whether the Structure pane subscribes to the same
projection seam #322 fixed, or holds its own stale snapshot.

## First step

Reproduce by driving: open a large Markdown file, watch the Structure pane
during load. Only diagnose after it reproduces.

## Invariants in scope

ui.invariants.md — panel content records; confirm at reproduction time.
