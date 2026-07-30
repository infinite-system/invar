# 317 — bottom panel splitter: thinner bar + left-side editor action buttons + always-draggable

State: COMPLETED — ec92a8b9 — bottom panel separator: thin lower-half-cell + editor action buttons + always-draggable geometry
Engine: codex
Model: 5.6-sol
Effort: high
Provenance: USER-DIRECTED 2026-07-29

## User's words (verbatim, GOVERNS)

> bottom panel separator should be thinner like the bottom horizontal
> scroller we made thinner, if possible even thinner to match the
> vertical splitter width, also left side of bottom panel splitter
> there can be some button to act on the editor, make couple test
> buttons that can do something or maybe report something about editor
> ? and splitter fits between that left side buttons/items and right
> side close btns, etc, but movable splitter must never disappear, must
> have min width so you can drag it

## Design

Three arms:

1. **Thinner separator**: the bottom panel's horizontal separator row
   matches the thinned horizontal scroller treatment; if feasible match
   the vertical splitter's visual width. One thickness source shared
   with the other splitters (derive, don't copy). Drag behaviour
   unchanged at the thinner profile.
2. **Left-side editor action buttons**: a small button area on the LEFT
   side of the splitter row acting on/reporting the editor. User asked
   for a couple of TEST buttons — pick two genuinely useful ones as the
   first citizens (candidates: cursor position / selection stats
   report; toggle word wrap; go-to-symbol — choose what the existing
   editor seams offer cheaply and RECORD the choice as placeholder-
   for-refinement, since the user will iterate). Buttons live on a
   proper seam (a splitter-row contribution point), not hardcoded
   one-offs — this row will grow.
3. **Splitter never disappears**: the draggable splitter segment sits
   BETWEEN the left buttons and the right-side controls (close etc.)
   and keeps a MINIMUM draggable width at every pane size — narrow-
   width drives prove buttons truncate/yield before the drag segment
   ever reaches zero.

Both polarities per arm: thinner row still drags (both scales +
narrow); buttons act and report (each button's effect asserted, and
absent when not clicked); planted zero-width splitter state goes red;
right-side controls keep their hit-targets.

## Acceptance

Frame quotes before/after (thickness, left buttons, layout order:
buttons | splitter | close controls); drag drive at normal + narrow
widths; min-width contract with planted-red control; button effects
PTY-proven.
