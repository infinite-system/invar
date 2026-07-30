# Brief #326 round 4 — the word-delete red IS your diff; fix it

The pre-existing classification is refuted by measurement:
- current main, standalone word-delete harness: GREEN 3 of 3;
- your worktree (staged merge), standalone: RED, deterministic — "Timed
  out waiting for Alt+Delete keeps the active buffer open with the cursor
  after hello". Same red in both your gates, pre- and post-merge, so the
  vendor diff itself breaks the Alt+Delete path, not the merge and not
  load.

Do now:
1. Find the mechanism. Your diff touches kernel composition, plugin
   registration, and Bootstrap sealing — suspects: input/keybinding
   routing order changed by the kernel seal, a contributor that no longer
   registers word-delete's handler, or status publication (the wait
   observes a published status key — check whether the key still
   publishes at all on your tree; drive it and read the status file).
2. Fix on your branch. Iterate with the SINGLE harness standalone
   (seconds), not the full gate.
3. When standalone green 3 of 3: commit through the hook (no SKIP_GATE),
   append the real GATE_EXIT chain + final hash to the main-checkout
   report, confirm clean tree, stop.

## Invariants in scope

Your stage-2 set, plus any keybinding/input-routing records your
mechanism analysis implicates — answer any NEW record you touch.

## Bycatch expected

Anything the mechanism hunt surfaces.
