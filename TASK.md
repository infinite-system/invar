# TASK — Overlay dialogs (#63): scrollbar, fit-on-resize, close button, flaky-Escape root cause

Worktree: /tmp/wt-overlays, branch fix-overlay-geometry (latest origin/main).
Run 'bun install --silent && git checkout bun.lock' FIRST.

## User directives (verbatim intents, 2026-07-25)
"the dialog windows for settings / shortcuts should also use the vertical scroll bar and fit
within the window on resize not be outside of canvas if too large, also have mouse clickable
close button at the top, because sometimes esc didn't work for me so i resorted to clicking the
gear button at the bottom status bar to close it, so the philosophy stays that we should be able
to do everything via mouse that we can do via keyboard as keyboard supports is also flaky"

## Deliverables
1. GEOMETRY: settings panel + shortcut help (and any modal overlay) clamp to terminal size on
   RESIZE — never painted outside the canvas; overflow scrolls via the shared scrollbar seam
   (SolidThumbScrollBar/ScrollableTextViewport — wheel + thumb drag + keyboard, one generator).
2. CLOSE: mouse-clickable ✕ at each overlay's top edge, one idiom across overlays, discovered-
   position probes.
3. FLAKY ESCAPE (bug, user-reported): find the drop path — overlay exclusive-input slot vs the
   focused-content key routing (panelux) vs bare-ESC sequence disambiguation timing. Fix, then a
   driven assertion closing each overlay with Escape from EVERY focus state (editor, terminal
   region, agent region, contents list, popup open). Do not paper over with the ✕ — the ✕ is
   parity, not the fix.
4. CONTRACT: add/extend the mouse-parity invariant in ui.invariants.md: every keyboard action has
   a visible mouse path (rationale: the mouse is the reliability floor).

## Laws & verification
FILE GRAMMAR; prettier on commit; settings-meta drives for any new setting; full instruments BY
EXIT CODE; driven smokes on quiet machine (resize the PTY mid-overlay and assert clamp + scroll;
✕ click closes; Escape matrix). Labeled waits; single-token anchors. CLEAN TREE before READY.

## Protocol
SKIP_GATE=1 commits; never gate/push/merge/tag; invariants unions preserve Status/Last refined
trailers; rebase before finishing; hashes verified. Write /tmp/wt-overlays-READY.md with the
Escape root cause named.
