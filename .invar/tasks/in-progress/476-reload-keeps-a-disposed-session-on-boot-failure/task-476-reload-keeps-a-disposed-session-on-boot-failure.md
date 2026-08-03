# Task 476 — a failed reload keeps serving a disposed session

Priority: architecture-hygiene
State: IN-PROGRESS
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high

## Evidence (builder bycatch, #473, 2026-08-03 — found by inspection, not forced)

DriveSession's serve loop disposes the active app BEFORE booting the
replacement on --reload. If the replacement boot throws, the catch answers
the reload request with the error but the loop keeps serving with the OLD,
DISPOSED session — every later attach acts on a dead driver.

## Fix shape

Boot the replacement FIRST, dispose the old app only after the new one
reaches ready; on boot failure, answer the error and keep the old session
LIVE. Verification both arms: a forced boot failure (e.g. unwritable home)
leaves the previous session answering attaches; a normal reload still swaps.

## Added scope (same seam): MCP server_start line-count

The one unfulfilled builder ask from #473: MCP `server_start` accepts a
workspace but no line count, so MCP-only callers cannot prepare a generated
scale file. Pass a `sizeLines` option through to DriveSession's existing
--size fixture machinery.
