# 94 — popup Left/Right should fall through to caret movement

State: ACTIVE — decision taken, not yet built
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default
Priority: performance-behaviour

## Outline

When a popup is open and has no drill target, `Left`/`Right` should fall through to ordinary caret
movement instead of being swallowed.

### The decision, already taken

**Adopt the fall-through**, with the rule derived from STATE — "does this popup expose a drill handler
right now?" — rather than from a hardcoded list of popups. A list would need editing every time a popup
gains or loses drilling; a state query cannot go stale.

### The subtlety, flagged explicitly rather than defaulted

Once the `..` (drill-up) row lands, the breadcrumb popup has a drill target at **every level except
root** — so `Left`/`Right` would change meaning as the user navigates. That may be worth trading away
for predictability. It is a judgement call, and it is left explicit here rather than silently resolved
one way by whoever implements it.

### A REFUTED hypothesis — do not re-chase it

When bare-identifier completion landed (#131), a completion popup became open far more often, and an
`agent`-side `Left` failure appeared in the same gate. The hypothesis was that the popup was eating
`Left` — which would have made #94 a real defect surfacing under new conditions rather than a latent
one.

**The clean solo run does not support it.** The red was contention, and the quiet-lock monitor confirms
that run was a valid measurement rather than another contended one.

#94 remains open **on its own merits, unconnected to that**. Recorded as refuted because, left
dangling, it is exactly the kind of plausible story a future round would waste time re-deriving.

## Sources

None in this folder. Detail above recovered from the session transcript (`faf7e858-…jsonl`).
