# 284 — scrollbar colours captured at construction never follow the live theme

State: IN-PROGRESS
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium
Priority: appearance-correctness

## Outline

Bycatch of #282, reproduced twice: the editor horizontal bar keeps dark
palette colours (#7aa2f7/#1a1b26) after the project selects the light
theme. `ScrollbarSync` captures `theme.palette` into trackOptions at
CONSTRUCTION, before reactive theme selection settles, and never
refreshes. This is a reactivity seam violation — appearance must derive
from the live theme ref, not a captured snapshot (the ivue getter law:
derive, don't copy). Sweep the same capture-at-construction shape in the
other scrollbar consumers (#282's census table names them) and any other
appearance option captured eagerly. Fix at the shared generator so all
bars follow theme switches live; driven assertion: switch theme in a PTY
run, assert both axes repaint with the light pair (both polarities: dark
pair absent).

## Invariants in scope

- The scrollbar records (#282's "One scrollbar painter" record); the
  theme records; ivue conventions (derive-not-copy).

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report carries `## Bycatch` even if it
reads `None observed`.

## Sources

- report-282, Bycatch 1.
