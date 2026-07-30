# 322 — status: editorColumnContent stays 'source-text-editor' in preview-only mode

State: active
Engine: codex
Model: 5.6-sol
Effort: low
Provenance: BYCATCH of #308 (2026-07-29), twice-observed

## Defect

With #308's preview-only mode active, the published status field
`editorColumnContent` remains `source-text-editor` while
`editorSurfaceIdentifier` is `markdown.preview` and the grid contains
only the preview. Status must tell the truth about the painted surface
(gate-what-humans-cannot-see: instruments key off these fields).
Both polarities: preview-only publishes a preview identifier; returning
to editor restores the editor identifier; a planted lie goes red.
