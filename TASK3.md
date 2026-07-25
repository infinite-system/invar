# TASK3 addendum — click-outside dismissal (user directive, 2026-07-25)

"clicking outside shortcut pane / settings page / project open search, should close them"

This is the POINTER twin of the Escape-priority fix you just made, in your own files — take it in
this branch unless you are already past the pointer-routing seam (if so, say so in READY and it
becomes a follow-up).

Scope: every modal overlay that owns the exclusive input slot — Settings, Keyboard Shortcuts,
Command Palette, Quick Open (the project file search), confirmations, and the BoundedListPopup
adapters (buffer dropdown, branch selector, layouts menu). A pointer press whose cell is OUTSIDE
the overlay's own rectangle (and outside its close button) DISMISSES it through the same
close/cancel model path Escape and the ✕ already use — one dismissal generator, three triggers.

Two behavioral decisions to implement explicitly:
1. The dismissing press is CONSUMED — it closes the overlay and does NOT also perform whatever
   that cell would normally do (no cursor jump, no pane focus change, no button activation). One
   click, one effect; the next click acts normally.
2. Presses INSIDE the overlay keep their existing behavior (row selection, scrollbar drag, search
   row focus) — dismissal must not shadow interior interaction, including drags that START inside
   and travel outside (a scrollbar drag leaving the rectangle must NOT dismiss).

The NON-MODAL completion popup keeps its own rule (editor keeps focus; cursor-moving clicks
dismiss it) — do not route it through modal dismissal.

Driven assertions (add to the overlay smoke): open each overlay, click a cell outside it →
closed AND the underlying state unchanged (cursor/focus/active pane identical to before the
click); click inside → interior action still works; a scrollbar drag from inside to outside does
not dismiss. Labeled waits, discovered positions.
