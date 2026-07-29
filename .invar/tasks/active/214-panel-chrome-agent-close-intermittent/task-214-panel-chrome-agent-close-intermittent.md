# 214 — panel-chrome intermittently red at the Agent 2 list-close assertion

State: ACTIVE
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default
Priority: flake-evidence

## Outline

Bycatch from #114 Wave B (one red in seven runs, then six greens).
`smoke-panel-chrome-harness` timed out once at
`the Agent 2 list close removes only that instance`. Evidence:
`/tmp/v3-smoke-panel-chrome-harness.log`.

The assertion sits in the AGENT instance-close path. Wave B does not touch that
path: agent panes are not runtimes, and their creation, registry, and close
handling are unchanged. The builder flagged it so a gate red is not blamed on
that branch.

First question, per the wait doctrine: is the close-confirmation wait a
condition the close action can always make true, or does it race the list
re-render? One-in-seven at the same assertion smells like a wait racing an
async list update, not load. Related standing task: #164
(panel-chrome ASCII-tier timeout) — check whether they share a wait site
before treating them as two defects.

## Sources

- [/tmp/114-wave-b-READY-v2.md](../../../../../../../../../../../tmp/114-wave-b-READY-v2.md) — Bycatch section (copied into
  `.invar/tasks/completed/114-.../` at #114's landing).
