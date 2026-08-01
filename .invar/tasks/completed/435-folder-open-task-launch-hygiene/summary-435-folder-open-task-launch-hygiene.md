# Summary #435 — what actually happened

Landed 69886b7e on a fully green gate (82 OK, GATE_EXIT=0), 50m
dispatch-to-landing, five rounds (three substantive).

- The user's "nine terminals" decomposed exactly as the conductor's
  driven mechanism predicted: relaunch-on-every-open (no dedupe
  consult), displaced-warning pseudo-terminals, and restore stacking.
- The builder chose to RESTORE the Terminal space with its contents,
  justified against three existing records rather than the brief's
  open either-way — the right use of the contract layer as design
  authority.
- Positive control: planting the old defect (deleting the root from
  the identifier map) turned the new smoke's absent arm red.
- The builder's reproduction found the conductor's drive --home bug
  (stale status.json satisfying new-boot waits); fixed and landed
  mid-task on main.
- Nothing refuted; one residual: the conductor's original restore
  sighting (Database-only space) was partly an artifact of that stale
  status bug — the real pre-fix restore behavior was never isolated,
  and the fixed behavior is now contract-locked, so the question is
  moot.
- Bycatch converted: #437 (gesture mechanics to the shared layer),
  #438 (pre-commit hook gates in builder worktrees; user decision).
