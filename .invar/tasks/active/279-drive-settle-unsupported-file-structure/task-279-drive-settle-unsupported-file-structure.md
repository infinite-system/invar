# 279 — the drive treats a hidden structure pane's "no-document" as unsettled

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium
Priority: verification-integrity

## Outline

Bycatch of #274, reproduced twice: `bun run drive --size 100000` (a .txt
file with NO structure provider) times out at 15s AND 30s although the
final frame is correct. Suspect: #266's settled-status registry holds the
drive open on `structureStatus="no-document"` even when the unsupported
file legitimately keeps the pane hidden. The quiescence condition must
distinguish "pending work" from "correctly declined" (the structure
record's answers-or-declines component). Fix at the registry condition;
positive control: the .txt drive settles fast, AND a genuinely-loading
structure still holds the settle (both polarities). Never widen the
timeout.

## Invariants in scope

- harness.invariants.md — #266's "Drive settled observations include
  declared debounced work" record (refine, don't weaken);
  structure.invariants.md answers-or-declines.

## Bycatch expected

Per AGENTS.md's taxonomy. The READY report carries `## Bycatch` even if it
reads `None observed`.

## Sources

- report-274, Bycatch 1; #266's landed registry.
