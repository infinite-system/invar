# 198 — `smoke-selection-harness` has two pre-satisfied wheel predicates

State: ACTIVE
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default
Priority: flake-evidence

## Outline

**The waits pass without observing the wheel at all.**

### The shape — the inverse of the dominant class, and it is silent

The dominant defect class asks for evidence of a change that will not happen, and fails loudly. **This
is its inverse: a pre-satisfied wait launders a no-op into a green.**

It is worse in two ways:
- **it is silent** — nothing in the output distinguishes it from a real observation;
- **it is indistinguishable from coverage**, since the coverage ratchet counts CALLS. The smoke appears
  in every census as a wheel test that is not testing the wheel.

### The diagnostic question

**Enumerate the states the predicate can occupy**, and ask whether one of them is already true when the
wait begins. If the condition holds before the action, the wait is a no-op regardless of what the action
does.

### Its sibling, still open

`scrollbars` waits for *"the deep widest line is visible during the wheel drive"* and **failed with AND
without pool siblings** — so contention is excluded. Same question applies from the other side: is there
a state (a clamp) where the wheel legitimately produces no further motion, making the condition
unreachable? **That shape has now been found twice in this repo (#187 and here)**, which is why the
enumerate-the-states step is worth running on every wheel predicate rather than only the failing one.

### Provenance

Filed as bycatch from #187's landing gate (exit 0, ALL-PASS, 4m15s), alongside #199.

## Sources

None in this folder. Detail above recovered from the session transcript (`faf7e858-…jsonl`).
