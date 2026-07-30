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

## Related instance (bycatch of #324, 2026-07-29)

AppStatusProjection publishes generic bottom-panel state under
terminalVisible/terminalFocused/terminalColumns/terminalRows: with the
3D Demo open at 100x30 the active content is media-demo but the
terminal fields report true/true/61/9 (reproduced in two independent
drives; the "Bottom panel / terminal state" comment carries the same
drift). Same lie family as editorColumnContent — fix both at the
projection seam, not per-field.
