# #338 — a declared graphics tier the terminal cannot render fails silently

State: ACTIVE
Priority: user-directed
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high

## The defect (user-hit, conductor-reproduced 2026-07-30)

The user's persisted setting was `"graphicsTier": "kitty"` while running in an
xterm-256color terminal. The 3D demo pane opened, frames advanced
(mediaMode=demo, frame index rising), and the screen showed NOTHING — kitty
APC sequences emitted into a terminal that ignores them. No notice anywhere.
Reproduction probe: tmp/probe-media-demo-kitty.ts (PAINTED 0) vs
tmp/probe-media-demo-default.ts (PAINTED 549), same session shape.

`resolveGraphicsTier` (src/modules/theme/TerminalCapabilities.ts) returns a
non-auto declaration unconditionally. Declared wins by design (the user may
know better than detection). The defect is the SILENCE, not the precedence.

## Direction (design open — propose, do not assume)

When the declared tier is kitty/sixel and the live renderer's capability
report answers WITHOUT that capability, surface a visible hint at the paint
site (pane notice line like the ffmpeg one, or a status-bar hint):
"graphics tier 'kitty' is declared but the terminal did not report kitty
support — showing nothing? set graphics tier to auto." Do not auto-downgrade
silently; the declaration is the user's. Contract sibling: "Missing ffmpeg is
loud and harmless" (src/modules/media/media.invariants.md) — same loudness
principle, new record likely owed in the image or theme contract.

## Evidence

- User settings snapshot with the pinned tier (2026-07-30).
- Probe pair above; smoke-media arms force halfblock and so never see this.
