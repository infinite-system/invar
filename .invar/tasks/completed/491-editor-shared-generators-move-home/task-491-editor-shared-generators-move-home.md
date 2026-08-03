# Task 491 — editor shared generators move to core; peer seam repairs

Priority: architecture-hygiene
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high
State: COMPLETED — cf1befd4 — editor generators move to core text; monitoring rides the provider seam

## In plain words

Core files import real classes from the editor plugin folder, so the
editor plugin cannot be removed even in theory. The shared pieces
(EditorWrap math, ReadOnlyTextBuffer, EditorFrameAttribution,
EditorSourceTextViews) are generators used by core diff, RootView,
and the markdown plugin. They belong in a core text/view module.

## Scope (census rows 7 + bycatch — [report](../../completed/488-core-to-plugin-coupling-census/report-488-core-to-plugin-coupling-census.md))

- Move the four shared generators to core (or port consumers); after
  the move, core has zero editor-folder imports.
- ReadOnlyTextBuffer distillation: one read-only buffer generator,
  two cross-boundary consumers (DiffView, MarkdownSplitView).
- Peer-seam repair: MonitoringPlugin value-imports the lsp
  LanguageServerProcessRegistry and reads its statics directly — a
  second rendezvous channel; route it through the provider seam
  ('Peer plugins can have different lifetimes' is STRESSED by this).
