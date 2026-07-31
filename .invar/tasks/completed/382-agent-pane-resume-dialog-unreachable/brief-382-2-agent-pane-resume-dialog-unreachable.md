# Brief 382-1 — the agent pane must show what the PTY app draws

Read the task file in this folder; the user's report and the three
ranked candidates are there. This is an EXPERIMENT brief: probe before
belief, all three candidates named, and say so plainly if a probe
comes out clean.

SAFETY RULE, absolute: never drive the agent pane against this repo's
real .invar/tasks.json (it spawns real conductor sessions). Use
fixtures/scratch workspaces only, and a PROBE PTY APP, not real
claude, wherever possible.

Work order:
1. Build the separating probe FIRST: a tiny PTY program that prints
   its own reported rows x cols on every SIGWINCH and draws a
   full-height numbered frame (row 1 at top, row N at bottom).
   Run it in the agent pane at several pane sizes and splits.
   - Candidate (a) stale/wrong size: reported size != visible cell
     count.
   - Candidate (b) clipping: reported size == pane size but top rows
     are cut with no way to see them.
   - Candidate (c) app minimum-height: our reporting is correct and
     the guest lays out for more rows anyway.
2. Diagnose from the probe table (pane size, reported size, visible
   rows). The contradiction, if any, is the finding.
3. Fix what WE own: resize propagation on every pane layout change
   (splits, panel toggle, window resize) so the PTY always holds the
   current visible size. If the defect is (c) — claude's own
   behavior — do NOT fabricate a fix; document the honest boundary
   and the workaround, and say final verification needs the user's
   real terminal.
4. Ratchet: extend the agent/terminal-pane smoke with the probe app:
   after a pane resize, the guest's reported size equals the visible
   grid (count-based, condition waits).
5. Verification: tsc, focused tests, extended smoke, checker
   --all/--refs.

Rules: no merge-gate.sh; no push; commit on the branch; READY report
with the probe table verbatim.

## Invariants in scope
- Terminal/agent-pane records ([agent.invariants.md](../../../../src/modules/agent/agent.invariants.md) and any terminal module contract) — enumerate and answer.
Refute any missed.

## Bycatch expected
Report per [AGENTS.md](../../../../AGENTS.md) taxonomy; include a ## Bycatch section
even when it reads: None observed.
