# Brief — #277: the preview body viewport must follow parent growth

Read first: [task-277-markdown-preview-body-viewport-settles-after-parent-growth.md](task-277-markdown-preview-body-viewport-settles-after-parent-growth.md)
— bycatch of #263, verification-integrity; the record governs. The
markdown seam has moved a lot since filing (#286/#287/#289/#291/#293
landed): REPRODUCE against current main first — the remount workaround
in the markdown harness is the tell and it is still there.

Arms:

1. **Reproduce**: conceal the right dock (parent grows), the preview
   and source borders widen but the preview TABLE still clips to its
   pre-growth body viewport (`alpha` clipped to `alph`). Quote the
   frame.
2. **Fix the generator**: #263's RootView.synchronizeLayoutGeometry
   repair resolves the renderer viewport but does not settle the
   preview BODY viewport. Find where the body viewport is captured and
   make it follow the live pane extent (derive, don't copy — same law
   as #284's colour fix, different seam).
3. **Remove the tell**: the #238 remount workaround in
   [smoke-markdown-harness.ts](../../../../scripts/harness/smoke-markdown-harness.ts)
   comes OUT with the fix; the workaround-free arm must stay green.
4. **Both polarities**: growth widens the body viewport; shrink narrows
   it (the reverse arm must not clip content that fits).

Both scales if the viewport math differs at 100k.

## Invariants in scope

The markdown split-view records in
[markdown.invariants.md](../../../../src/modules/markdown/markdown.invariants.md);
#263's layout-geometry records in
[ui.invariants.md](../../../../src/modules/ui/ui.invariants.md).

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report
carries `## Bycatch` even if it reads `None observed`.

## End state (mechanical)

READY report: reproduction quoted, generator fix, workaround removed,
both polarities driven, green `bun test` + markdown smokes. The
conductor gates at landing.
