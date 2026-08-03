# Task 474 — dispose order emits renderable-removal warnings

Priority: architecture-hygiene
State: COMPLETED — 7b8b889d — Landed: single-action teardown + zero-warnings quit ratchet.
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high

## Evidence (user-observed, 2026-08-02, mirror session Ctrl+C)

At app teardown, OpenTUI prints one warning per renderable:
"Renderable with id editor-gutter is not a child of editor-area, skipping
remove" — likewise editor-code, root-column, bounded-list-popup(+backdrop,
+close), completion-popup(+...), agent-skill-popup(+...). Normally invisible
(the screen clears before a human can read it); the drive server's mirror
made it visible because the hosting terminal keeps the scrollback.

## Reading

Something in dispose removes children from parents they were already removed
from (double-remove or wrong-parent bookkeeping), OR removal order detaches a
subtree and then tries per-child removal against the detached parent. Not
user-visible in function; it is drift between the mount graph and the dispose
path. The popup trio each complains three times (popup, backdrop, close) —
the ModalOverlayDismissal family is the densest cluster.

## Verification

Fix = teardown with ZERO removal warnings, asserted by a smoke that captures
dispose-phase output (the mirror tap or the PTY tail makes this cheap now).
