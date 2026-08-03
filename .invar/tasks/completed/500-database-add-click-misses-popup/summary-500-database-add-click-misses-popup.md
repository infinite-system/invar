# Summary 500 — root-caused and fixed inside #356 round 7

Not a pointer-hit problem and not a flake: AgentSkillPopup called
unconditional close() on the shared BoundedListPopup and revoked the
Database adapter's live popup on the next projection update. #356
round 7 added owner-checked close (popup sessions carry an owner
identifier); the panel-chrome smoke went fixed-then-green solo and
the contention-tier FAIL disappeared in gates r7/r8. Landed with #356
at 94ec7eac. No separate work remains.
