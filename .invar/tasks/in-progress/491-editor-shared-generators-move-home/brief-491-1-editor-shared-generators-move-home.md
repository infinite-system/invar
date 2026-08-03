# Brief 491-1 — editor shared generators move home; peer seam repairs

## In plain words

Core imports real classes from the editor plugin folder, so the
editor plugin cannot even in theory be removed. The shared pieces are
generators: wrap math, a read-only text buffer, frame attribution,
source text views. Move them into core (a text/view module), port the
consumers, and repair one peer seam violation found by the census.

## Reproduce by DRIVING first

Drive the app: open a file, a diff, and a markdown split view — the
three consumers of the shared generators. They must render byte-same
after the move (screen-compare before/after with the drive layer).

## Your map

[The #488 census report](../../completed/488-core-to-plugin-coupling-census/report-488-core-to-plugin-coupling-census.md)
row 7 and Bycatch:

- Move EditorWrap, ReadOnlyTextBuffer, EditorFrameAttribution,
  EditorSourceTextViews out of the editor plugin folder into core
  (seam-at-shared-generator: one home, named seam, no copies).
  Consumers: RootView.ts:20,32, ScrollbarSync.ts:7, DiffView.ts:20,
  Bootstrap.ts:74, MarkdownSplitView.ts:13.
- Peer seam repair: MonitoringPlugin.ts:31,123 value-imports the lsp
  LanguageServerProcessRegistry and reads its statics — a second
  rendezvous channel. Route it through the provider seam the peers
  use ('Peer plugins can have different lifetimes' is STRESSED by
  this; your fix un-stresses it).
- After: core has ZERO editor-folder imports; re-run
  census-488-imports.ts and report before/after.

## Invariants in scope

- Seams are drawn at the shared generator ([project.invariants.md](../../../../project.invariants.md)).
- Peer plugins can have different lifetimes; Provider rendezvous is
  host carried ([src/modules/plugins/plugins.invariants.md](../../../../src/modules/plugins/plugins.invariants.md)).
- Editor records in [src/modules/editor/editor.invariants.md](../../../../src/modules/editor/editor.invariants.md) if
  present — check and answer record by record; name misses.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy even when None observed.

## Instrument feedback

EASY / CONFUSING / MISSING; asks get converted.

## Rules

Never run scripts/merge-gate.sh. Commit on your branch; READY report
in the task folder. File moves via git mv so history survives.

Commit note: the pre-commit hook auto-runs the full gate; use the
documented SKIP_GATE=1 bypass on your branch commits (the conductor
gates the combined tree at landing).
