# #354 — welcome screen mislabels Ctrl+P as command palette

State: ACTIVE
Priority: user-directed
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## Bycatch from #351 (builder's words, 2026-07-30, user-visible)

The welcome screen says "Ctrl+P command palette", but default Ctrl+P opens
Go to File (quickopen.open). Seen at 100x30 and 60x15, reproduced more than
once.

## Work

Fix the welcome text to match the real default bindings (check what the
command palette's actual default chord is and state both correctly). Drive
the welcome screen to verify; extend an existing welcome/help smoke
assertion rather than adding a new smoke.
