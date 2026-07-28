# TASK — #142: `bounded-list-popup` before it becomes a blocker

Work ONLY in `/tmp/conductor-listpopup` (branch `fix-bounded-list-popup-flake`, off latest main).
Do NOT run `scripts/merge-gate.sh`; do NOT push/merge/tag/delete. Report to
`/tmp/listpopup-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`.

## ⚑ DRIVE IT FIRST, and do not open this assuming flake

`smoke: bounded list popup harness` is the recurring name in gate retry tallies — it appeared in
the graphics-tier gate run and again as `RETRY smoke: bounded list popup harness — timeout-class
failure; one quiet retry` in a later run. It has NOT yet hard-failed.

You are being sent BEFORE it blocks anything, because the escalation pattern is now two-for-two
and both times the cause was a real defect, never load:

- **overlay-dialog**: retry-tally regular for two days → hard red → cause was a publication race,
  `OverlayLayer.requestPaint()` mutating reactive `paintRevision` AND directly requesting a
  renderer frame. Two owners of one obligation. Went 4/10 red → 20/20 green.
- **audio-narration**: retry-tally regular for days → hard red that survived its own quiet retry →
  cause was frame-coupled publication of an action that changes no terminal cells. Its measured
  rate was exactly `0,1,0,1,0,1,0,1,0,1` — wall-clock phase against the status-bar clock's minute
  boundary, not randomness.

**The reduction both share: a flake that passes only on retry is a race whose window is usually
smaller than the retry interval.** Load moves the window; it does not create it. The retry
mechanism is what hides this, converting "fails under contention" into a green tick and a tally
line nobody reads — which makes the tally the early warning, not bookkeeping.

## Method

1. **Run it 10x solo on an idle machine and PRINT THE SEQUENCE, not just the rate.** This is the
   single most important instruction here. Narration's cause was legible ONLY as a sequence: a
   perfect alternation named wall-clock phase instantly, where "50% failure" would have read as
   randomness. If your sequence has structure — alternating, periodic, first-run-only, clustered —
   find what shares that period.
2. If it is 10/10 green solo, drive it again under a concurrent gate-sized pool. Contention is a
   test, not an excuse; a smoke that only fails under load is still failing.
3. **Name what it waits on at the timeout**, and what the captured frame actually showed. A
   timeout with no frame is not a diagnosis.
4. **Suspect frame-coupled publication first**, given this repo's history. Ask specifically:
   does this smoke wait on a status probe for an action that changes no terminal cells? Cheap
   diagnostic that separates "never ran" from "ran but nobody heard it": after the timeout, send
   one extra keystroke — if that frame publishes the awaited value, the action ran and only its
   publication was stale.
5. Also check for the second recurring shape: **two owners of one obligation** (two writers of a
   selection/highlight/revision, or an input path and an animation path both advancing state).

## Constraints

- **Never widen a timeout.** A wait that needs more time is hiding a defect, and widening one to
  silence a red is forbidden in this repo.
- Mechanism before fix. A structural read is a hypothesis; four confident diagnoses were
  overturned by measurement in one night this week.
- **Positive control mandatory** before you believe any fix — make the smoke fail deliberately and
  quote the red. A check rewritten until it passes is not a check.
- If the honest answer is that it is genuinely ambient and you can prove it (structure-free
  sequence, fails only under load, mechanism identified as external), say so — a well-evidenced
  negative is a real result. Do not manufacture a fix.

## Bycatch

Report other bugs you notice; do not chase them. Fix one only if small, obvious, clearly correct,
and in a file you already touched — list each separately.

## Verification — quote exact exit codes

The smoke 10x (quote every exit code, in order), plus `bunx tsc --noEmit`, `bun test`,
`bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`,
`bun scripts/check-coverage-ratchet.ts`. Never read `$?` after a pipeline.

Full descriptive identifier names, 80 columns, ivue conventions (subclass `$Class`, never
`Class`). Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree
clean.
