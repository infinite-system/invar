# 165 — the glide-input-coalescing canary sits on a zero-margin boundary

State: ACTIVE
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default
Priority: flake-evidence

## Outline

The scale-travel canary in `glide-input-coalescing` measures **9 rows against an 8-row budget**. One row
of margin, on a contract that load alone can cross.

### The class, with its members

A contract sitting so close to its bound that ambient load crosses it is not a flake and not a defect —
it is an **unstated tolerance**. Prior members:

- **#144** — the glide's 24-frame rapid-ceiling contract, which measured 23/24 twice;
- **#149** — two scroll contracts whose bounds did not account for real scheduling;
- **#165** — this one;
- **#193** — the fold-dense contract's 995 rows against a 1,000-row shape requirement.

Also sighted in passing and explicitly NOT to be fixed inside another task: the scale-travel positive
control firing at 400 vs 423 rows against a 22-row budget. **That control is working as designed** — the
1-row margin is this class appearing on a third contract, not a control defect.

### The rule that governs the repair

**Never widen the timeout, and never raise the frame budget.** Both convert the defect into a slower
version of itself. The question is not "what number makes this pass" but **what the contract is actually
claiming** — if 8 rows was chosen as a felt threshold, then 9 either violates it or the threshold was
never 8.

**Positive control mandatory**: plant the failing interleaving, quote the red, then quote the green. A
contract that can no longer fail is worse than the flake it replaced.

## Sources

None in this folder. Detail above recovered from the session transcript (`faf7e858-…jsonl`).
