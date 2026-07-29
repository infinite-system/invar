# 263 — a terminal shrink never re-lays-out the markdown split until a mouse event

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
Priority: user-directed

## Outline

Bycatch of #237, reproduced on UNMODIFIED main, and #237's auto-open makes
it default-path: open the preview with Ctrl+Shift+V (no click anywhere),
shrink 120x40 → 60x25 — the panes keep their wide widths indefinitely (8s+
observed; `MarkdownSplitView.tick` sees `rootRenderable.width` pinned at 83
through 460 ticks) and the preview runs off-screen. ONE mouse event
anywhere on the source pane or divider BEFORE the resize makes the same
shrink settle; a click on the preview pane does not. The old smoke masked
it by clicking the tab button to open.

Something in the resize propagation path is armed only after a pointer
event crosses the app — find that generator (hit-region registration?
a lazy layout subscription?), fix it, and RESTORE the terminal-shrink
coverage #237 had to remove from the markdown smoke (that removal is a
debt this task repays; the narrow-pane arm currently reaches narrowness by
divider drag only).

Reproductions committed in #237's folder:
`probe-237-narrow-resize-settle.ts`, `probe-237-narrow-resize-handshake.ts`.

## Invariants in scope

- The ui layout/resize records (geometry aggregates, #217's family); the
  markdown split record.

## Bycatch expected

Per AGENTS.md's taxonomy — this smells like a sibling of #260 (first click
lands nowhere): both look like pointer-armed lazy state. If one diagnosis
explains both, say so and the conductor folds them. The READY report
carries `## Bycatch` even if it reads `None observed`.

## Sources

- `report-237-...md`, Bycatch 1.
