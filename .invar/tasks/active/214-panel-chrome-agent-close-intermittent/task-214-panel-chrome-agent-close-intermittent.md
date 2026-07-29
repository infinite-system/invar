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

## Census tally 2026-07-29 (#295 gate)

- panel-split smoke timed out in #295's commit gate pool run; quiet retry
  passed; not reproduced solo. 4th pool-only occurrence today (also #277,
  #281-adjacent, #290 rounds). Same class: pool-load timeout, solo green.
- input-byte timing gate p50 9.748 ms vs report-only warning 6.406 ms during
  the same pool gate; all five ordering sessions passed. Load-bound metric —
  normalise before tolerating (gate-what-humans-cannot-see rule).
- 2026-07-29 #298 amend gate: scrollbars smoke + panel-split smoke both
  starvation-timeout, both passed on retry (5th/6th pool-only today).
