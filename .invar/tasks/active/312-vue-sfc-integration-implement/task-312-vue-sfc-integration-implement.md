# 312 — Vue SFC integration: IMPLEMENT from the #311 map

State: active — UNBLOCKED (user accepted all five 2026-07-29)
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

## User's follow-up (verbatim, GOVERNS — added 2026-07-29)

> also full lsp support must be there, etc, so it's not a trivial one
> but will test our plugability for these kinds of features, so it must
> be cleanly pluggable as well

End state includes full Vue LSP support, delivered as a cleanly
pluggable unit — the acceptance includes a "core untouched" polarity:
removing the Vue plugin returns .vue files to plain-text behaviour with
zero dangling references in core.

## Pre-work from #311 bycatch (2026-07-29)

- src/modules/syntax has NO syntax.invariants.md (registry/highlighter
  exist, no domain record) — the record must be written as part of the
  phase-1 syntax-source port work.
- LanguageRegistry.ts comment claims a Tree-sitter registration point
  that does not exist (static extension map only) — fix the drift when
  the real registration port lands.

## User decisions 2026-07-29 (verbatim: "all five as recommended, go ahead with 312")

All five map recommendations ACCEPTED:
1. Full LSP = diagnostics, hover, completion, definition, references,
   document symbols, formatting, folding, Vue routing, TS coexistence.
2. Protocol spike on the Vue server's TypeScript bridge is a BLOCKING
   phase before product wiring.
3. tsgo: if it cannot host/bridge the Vue TS plugin, ship a visible
   compatibility policy.
4. Pin one Vue Language Tools version + record its TypeScript range.
5. True SCSS highlighting ships in the first highlighting slice.

State: UNBLOCKED — dispatch per the map's five phases.
