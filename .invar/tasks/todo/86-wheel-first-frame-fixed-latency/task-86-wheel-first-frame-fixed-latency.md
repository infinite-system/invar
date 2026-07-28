# 86 — wheel-to-first-visible-frame is ~85 ms at every scale

State: TODO — WAITING ON THE USER (a feel decision, not a defect)
Created: 2026-07-28

## Outline

### The measurement

- **Keypress to screen: 14 ms.**
- **Wheel notch to first visible frame: 85 ms.**
- **Flat at every scale** — item count does not move it.

A six-fold gap between key response and wheel response, constant.

### Why it matters more than it looks

**Item count was a red herring.** The original complaint was that long lists "choke" — so the work went
after an O(n) per-frame scan, found one, and removed it (a real 1 ms/frame win). But the measurement
says the felt problem may have been describing **the constant, not the list size**. The flyweight fix
was still correct; it was not what the user was feeling.

This is the negative-space result: an instrument that measures across scale can tell a size-dependent
cost from a fixed one, and here it says the remaining cost is fixed.

### Why it is not dispatched

Whether 85 ms is the INTENDED feel is a product call, not a defect report. It sits in the
waiting-on-the-user set alongside the 45% consecutive-fling deficit and #99's kitty-images flag — all
measured, all pre-existing, none of them things a builder should decide.

If the answer is "too slow", the task becomes: find where the fixed 85 ms is spent (the gap between
14 ms and 85 ms is not explained yet) and decide what of it is irreducible — the same shape as #175 for
boot time.

## Sources

None in this folder. Detail above recovered from the session transcript (`faf7e858-…jsonl`).
