# 272 — Markdown preview body viewport stays stale after parent growth

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
Priority: verification-integrity
Assignment note: Bycatch from #263 (terminal shrink leaves the Markdown split frozen).

## Outline

The #263 (terminal shrink leaves the Markdown split frozen) round-two drive removed the
#238 (structure dock defaults right with Markdown outline) preview remount workaround after
the right dock was concealed. The existing Markdown smoke then failed because the preview
table still used its narrow pre-growth body viewport. The final frame showed that the preview
and source pane borders had widened, but `alpha` was still clipped to `alph`.

The terminal-shrink repair changed `RootView.synchronizeLayoutGeometry` to resolve from the
current renderer viewport. That repair did not settle this body viewport. The remount
workaround must remain in `scripts/harness/smoke-markdown-harness.ts`.

Suspect generator: `MarkdownSplitView.tick` observes `rootRenderable.width`. Its update sets
new pane widths and refreshes `MarkdownRenderable` before Yoga applies the new preview body
width. The next layout pass updates the body width, but no later condition requests another
preview refresh. Prove or refute this sequence by driving the dock conceal path. Do not tune
the table or add another remount.

Completion removes the remount workaround. It adds a real-PTY contract that conceals the
right dock and waits for the preview body to reflow at the wider pane width. The positive
control restores the missing convergence step and makes that contract fail on the clipped
table marker.

## Sources

None. Only the outline above survives.
