# Brief #335 round 1 — gate smoke intermittents (scrollbars thumb, tasks:watch motion)

Read [AGENTS.md](../../../../AGENTS.md) fully before any work. Load [.claude/skills/ibr/IBR.md](../../../../.claude/skills/ibr/IBR.md).

## The situation

Two blocking smokes failed twice tonight on code that also gated GREEN the
same night. The task file in this folder has the full account. The failing
logs sit beside it:

- smoke-scrollbars-harness-.log — arm "wrap-off vertical thumb remains
  present in every scroll frame". The same run PASSED the 70-frame
  byte-identical thumb-extent arm. Hold that contradiction: it localizes the
  miss to a frame outside the settled drive.
- smoke-terminal-harness-.log and -.attempt1.log — arm "real tasks:watch
  advances a live motion row without a ledger change" timed out twice.
  This is #329's area (tasks:watch tick, landed b8cfdc62 tonight).

## Your job — an EXPERIMENT, not a diagnosis

This is an investigation. Ranked rival hypotheses are in the task file for
each smoke: product transient, instrument (unreachable or pre-satisfied
wait), pool-load environment. Find the separating observations. If a number
comes out zero, say so plainly.

1. Reproduce by DRIVING first. Run each failing smoke solo:
   `bun scripts/harness/smoke-scrollbars-harness.ts` and the terminal one.
   A solo green does NOT clear the red. Record solo results as data.
2. Then reproduce the POOL condition: run the failing smoke while 4-6 other
   harness smokes run concurrently (deliberate contention as a probe). Do
   NOT run scripts/merge-gate.sh yourself.
3. For the scrollbars arm: find WHICH frame class lacks the thumb. Read the
   assertion at smoke-scrollbars-harness.ts ~line 1466 and the DIAG dump in
   the preserved log. Is the observed frame settled? Is the wait's condition
   reachable (walk mutation -> publisher -> observed condition)?
4. For tasks:watch: read the wait's predicate. Is "advances without a ledger
   change" reachable under pool load? Check whether the child tasks:watch
   process starves. Count frames, never widen the timeout.
5. Classify each red: product / instrument / environment, with the
   separating evidence. A fix is in scope ONLY if the cause is small and
   local (an unreachable wait, a wrong predicate). A product paint defect is
   a REPORT, not a fix.

Iterate drive -> change -> drive. One instrument at a time. Contract edits
only AFTER a symptom is gone. One verification pass at the end: the two
smokes plus `bunx tsc --noEmit; echo TSC=$?` and
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`.

Never widen a timeout to silence a red. Never write a new tmux smoke.
Commit in your worktree. Do not push, merge, or tag. Write your READY report
as `report-335-<slug>.md` (this task's slug) in this folder. END STATE: that
report file exists in this folder.

## Invariants in scope

- "One writer per scroll regime per frame" family —
  [src/modules/ui/scroll.invariants.md](../../../../src/modules/ui/scroll.invariants.md). Binds the scrollbars arm: thumb
  presence per frame is downstream of the scroll regime's paint.
- Harness records — [scripts/harness/harness.invariants.md](../../../../scripts/harness/harness.invariants.md). Binds both arms:
  wait-condition reachability is a harness contract.
- Report record by record: upheld, violated, or needs refinement. Name any
  record this list MISSED.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s bycatch taxonomy (runtime defects, invariant
violations in function, comment drift, distillation possibilities, generator
drift or introduced variance, plain nonsense). Include a `## Bycatch`
section even if it reads "None observed".
