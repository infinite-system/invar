# 187 — the wheel-at-clamp wait

State: DONE
Created: 2026-07-28

## Outline

**HARD GATE RED.** Both `Drive` and `smoke-editor-harness` awaited a repaint that the clamp **cannot
produce**. At the scroll clamp the wheel is inert by construction — there is nothing left to move, so
no frame arrives, so the wait times out forever.

### The class, and the question that finds it

The dominant defect class: **asking for evidence of a change that will not happen.** A result condition
is only safe when the result is REACHABLE.

Five spellings at the time of this fix:
- **#159** — a mutation with no publication carrier;
- **#161** — a settle preceding its own publisher;
- **#168** — frame 59, which does not exist;
- **#188** — a screen change with no cause;
- **#187** — this one, a clamped wheel with nothing to repaint.

> **The unasked question: is the thing FALSE right now?** If it is already true, the correct wait is a
> no-op, not a timeout.

Frame ordinals are one way to ask for the unreachable; a screen-change predicate on an idempotent
gesture is another; a wheel at a clamp is a third. **Converting between them fixes nothing by itself.**

### The method the repair had to follow

1. **State in writing what each wheel is supposed to accomplish.** A selection-list wheel presumably
   moves the viewport while the selection stays put — so the claim is "the viewport moved AND the
   selected row kept its background," and only the second half was being asserted.
2. **Make the predicate observe the MOVEMENT**: a changed first-visible index, a changed visible range,
   or the selected row at a different screen position. Published state beats a cell diff where it
   exists.
3. **Positive control in both directions, and the RED direction is load-bearing**: with the fixture at
   a position where the wheel cannot move the viewport, the repaired wait must FAIL. **A wait that
   cannot fail is what created this defect.**
4. **Check the fixture is long enough** for a single wheel to move anything. If the list is shorter than
   the viewport the wheel is inert by construction, and the smoke needs a bigger fixture rather than a
   cleverer predicate — the reachability half of the same class.

Bycatch from the landing gate went to #198 and #199.

## Sources

- `brief-187-1-wheel-at-clamp-unreachable-wait.md`
- `report-187-wheel-at-clamp-unreachable-wait.md`
- Detail above additionally recovered from the session transcript (`faf7e858-…jsonl`).
