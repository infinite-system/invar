# 312 — Vue SFC integration: IMPLEMENT from the #311 map

Status: active — BLOCKED ON #311 (map + user review)
Engine: codex
Effort: high
Provenance: USER-DIRECTED 2026-07-29 (same verbatim quote as #311)

## Design

Implements the phased plan from
[the #311 map](../311-vue-sfc-integration-map/) once the user has
reviewed it: per-block language awareness in .vue files — script setup
as TypeScript, style as its declared style language, template as
template — then Vue LSP + structure per the map's phasing.

Do not dispatch before #311's map exists and the user has green-lit the
phasing. The map's boundary list closes this task's scope.
