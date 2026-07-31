# Brief 391-1 — panes must not stay stuck small after a resize

Read the task file: the user's verbatim report is at the top (left/
right panes get stuck in smaller mode after window resize), and two
already-analyzed seam defects sit under it.

Work order:
1. Reproduce by DRIVING first (PTY harness): open side panes, shrink
   the outer terminal, grow it back. Observe the pane sizes stick
   small. Record the driven numbers (pane width before / after
   shrink / after regrow). Also drive the analyzed variants: persisted
   width 33 on an 80-column start; 64-column dock where min 16 beats
   max 12.
2. Fix at the seam per the task's analysis: ALL size writes route
   through clamp (the `set size` and onMouseDown seed paths), and the
   minimum becomes coherent with the live maximum (derived, not a
   fixed 16). If regrow-stickiness needs more than those two (e.g. a
   clamp-at-shrink that never re-expands a REMEMBERED preferred
   size), fix that too: the user's intent is remembered size restored
   when space returns.
3. Drive again: shrink+regrow restores the pane; the driven numbers
   go in the report.
4. Ratchet: count-based smoke assertions (pane width after regrow ==
   width before shrink; report==painted at tiny widths). Condition
   waits only.
5. Re-verify the stressed record "A reported size never leaves its
   configured bounds" in [layout.invariants.md](../../../../src/modules/layout/layout.invariants.md);
   refine its wording if the mechanism moves. Checker --all/--refs
   clean; tsc; focused tests.

Rules: no merge-gate.sh; no push; commit on the branch; READY report
here.

## Invariants in scope
- "A reported size never leaves its configured bounds" ([layout.invariants.md](../../../../src/modules/layout/layout.invariants.md)) — the stressed record; answer with the refined wording if moved.
- Sibling layout records the seam touches — enumerate and answer.
Refute any missed.

## Bycatch expected
Report per [AGENTS.md](../../../../AGENTS.md) taxonomy; include a ## Bycatch section
even when it reads: None observed.
