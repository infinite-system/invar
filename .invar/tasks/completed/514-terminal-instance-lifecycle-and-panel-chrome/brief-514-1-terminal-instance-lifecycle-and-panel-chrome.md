# Brief 514-1 — terminal lifecycle bugs + panel chrome batch

## In plain words

Five user-reported surfaces on the bottom panel, one builder: the
over-removal bug hunted under the user's exact protocol; ONE panel
button with toggle semantics replacing the create-buttons; hover
button colors unified; the + Terminal affordance polished; the
tasks.json glyph joins the right hover cluster. [The task file](task-514-terminal-instance-lifecycle-and-panel-chrome.md)
carries every item verbatim + the conductor's driven evidence,
INCLUDING an early-boot drive dishonesty you must fix FIRST (it
blocked the conductor's own reproduction and may share a mechanism
with the lifecycle bug).

## Order of work

1. Fresh-boot honesty: after a warm-server reload, Ctrl+J +
   waitForStatus(panelVisible,true) passed while the grid showed no
   panel, and settled stayed false. Reproduce, name the mechanism,
   fix (app or instrument — say which with evidence).
2. THE PROTOCOL (user-prescribed; the smoke IS this): create several
   terminals -> remove ALL -> create several -> remove -> create
   split panes -> create a normal terminal, an invar agent, a claude
   agent -> remove one by one. Assert the exact instance list from
   the graph AFTER EVERY STEP. Over-removal is the quarry; fix what
   you catch.
3. Status bar: one panel button (toggle semantics = Ctrl+J), through
   the statusBarSegments seam; agent ✦ button removed (agent stays
   reachable via chord + panel Add). Tooltip candidates "Toggle
   Bottom Panel (Ctrl+J)" / user's "Open Bottom Panel" — implement
   toggle, screenshot both wordings for the user's call at review.
4. Chrome: hover-button background matches the row button; +
   Terminal gets a leading space, no default-selected state, real
   hover and click effects; the tasks.json glyph relocates to the
   right hover cluster (one geometry generator — Panel controls
   share paint and hit geometry).
5. Ratchet: the protocol becomes a permanent smoke arm; chrome
   assertions per the panel-chrome smoke's cell-color style.

## Invariants in scope

- Panel content order is one persisted sequence; An emptied space
  survives its last instance; A persisted pane identity is never
  reissued; Every registered panel content is reachable; Panel
  controls share paint and hit geometry ([src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md))
- Status-bar/contribution seams ([src/modules/app/app.invariants.md](../../../../src/modules/app/app.invariants.md))
Answer record by record; name misses.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy even when None observed.

## Instrument feedback

EASY / CONFUSING / MISSING; asks get converted — especially anything
the fresh-boot fix teaches about the drive layer.

## Rules

Never run scripts/merge-gate.sh; worktree commits skip the gate via
the planted policy; the conductor gates and lands.
