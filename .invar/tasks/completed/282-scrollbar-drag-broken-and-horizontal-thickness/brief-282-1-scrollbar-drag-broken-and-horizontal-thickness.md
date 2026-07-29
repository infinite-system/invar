# Brief — #282: scrollbar drag broke on BOTH axes; horizontal bar thins app-wide

Read first: `.invar/tasks/in-progress/282-scrollbar-drag-broken-and-horizontal-thickness/task-282-*.md`.

USER-REPORTED REGRESSION, first priority:

1. **Thumb dragging is broken on both axes** (track clicks still work —
   the DRAG gesture specifically: press on thumb, move, release).
   REPRODUCE FIRST on current main by driving the real press-move-release
   through the PTY mouse protocol. Then BISECT: main vs pre-#274
   (0a5e2474^) vs pre-#259 (587eed67^) — both landed on the
   scrollbar/pointer seams today (#274: SolidThumbScrollBar + right-dock
   projection; #259: PanelHostFocusSet claiming focus on click — a claim
   that blurs during a drag-press is a prime suspect). Name the breaking
   commit with evidence before fixing. Fix at the generator; check the
   first-click warm-up family (#260) does not mask your repro.

2. **Horizontal bar thinner — EVERYWHERE.** Fix at the shared scrollbar
   generator so every horizontal bar thins together (editor + any pane).
   Enumerate consumers first; a hand-rolled horizontal bar anywhere is a
   seam violation — route it through the shared one. Half-block glyphs
   are the likely vocabulary; argue the choice, both themes.

Verification is DRIVEN and continuous: assert scrollTop/scrollLeft track
the drag through intermediate positions (not endpoint-only), both axes,
editor and right-dock bars, at both scales. Positive control: break the
drag handler, watch the continuous assertion red. Any unrelated red:
control against main before classifying (quote both runs).

## Invariants in scope

- The scrollbar records (SolidThumbScrollBar, ScrollbarSync); #259's
  one-focus-owner record (your fix must not reopen double-focus — its
  smoke stays green); ui pointer records.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report carries `## Bycatch` even if it
reads `None observed`.

## End state (mechanical)

READY report in the task folder: the named breaking commit with bisect
evidence, the generator fix, continuous-drag assertions green both axes +
positive control, the app-wide thinning with the consumer enumeration,
green `bun test` + touched smokes. The conductor gates at landing.
