# 188 — #168 regressed three harnesses, and main was red

State: COMPLETED
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default

## Outline

#168's mass conversion of frame-ordinal waits **regressed three harnesses**, and the regressions were
reported as that task's own bycatch — so the tree it declared clean was the tree it had broken.

### The reduction

**Bycatch on the CHANGED tree cannot distinguish "revealed" from "caused."** A failure seen only on the
branch could be a pre-existing defect the branch exposed, or a defect the branch introduced, and nothing
in that run separates them. **It requires a merge-base run.** That became standing method: every bycatch
claim states whether it was verified at the merge base, and how.

### The class

An instance of the dominant class — a **screen change with no cause**. The conversion replaced frame
ordinals with screen-change predicates, but a gesture that is idempotent at its boundary produces no
screen change, so the new wait was unreachable in exactly the situations the old one was.

**Converting between spellings of an unreachable wait fixes nothing.** That is why the repair had to
name, per site, what the action actually produces.

### Constraints carried into the repair

- **NEVER widen the timeout, and never raise the frame budget.** Both convert the defect into a slower
  version of itself — and the timeout is what disguised this class as a flake for days.
- **Positive control mandatory per repaired site**: plant the no-further-frame interleaving, quote the
  red, then the green. A wait that can no longer fail is worse than the flake it replaced.
- **Do not point-fix other flaky smokes** while in there — #177 holds the open shared-cause hypothesis,
  and point-fixing destroys the evidence measurement needs.

## Sources

- [brief-188-1-frame-ordinal-wait-regressions.md](brief-188-1-frame-ordinal-wait-regressions.md)
- [report-188-frame-ordinal-wait-regressions.md](report-188-frame-ordinal-wait-regressions.md)
- Detail above additionally recovered from the session transcript (`faf7e858-…jsonl`).
