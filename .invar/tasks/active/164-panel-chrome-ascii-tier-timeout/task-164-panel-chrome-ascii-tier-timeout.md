# 164 — panel-chrome expand-heading times out in the ASCII tier

State: ACTIVE — pre-existing, reproduced on BOTH populations
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default
Priority: flake-evidence

## Outline

The `panel-chrome` expand-heading condition times out in the ASCII glyph tier. **Pre-existing**, and
reproduced on both populations — so it is not caused by whatever branch happens to be under the gate
when it fires.

### The class it belongs to

This is a confirmed instance of the dominant defect class: **asking for evidence of a change that will
not happen.** A result condition is only safe when the result is REACHABLE. Instances, in order of
discovery:

1. **#158** — a probe keyed to the fourteenth moving frame of a glide that no longer produced fourteen;
2. **#159** — a panel close whose publication had no carrier after coalescing;
3. **#164** — this one, panel-chrome expand-heading, pre-existing on both populations;
4. **#168** — "the next complete synchronized frame," a frame-ordinal wait the repo already forbids.

The audit that finds them: **`mutation → reachable publisher → observed condition`.** Walk the chain and
ask at each link whether the next one can actually occur.

The unasked question that catches it early: **is the thing FALSE right now?** If the condition is
already true, the correct wait is a no-op, not a timeout.

### Investigation ownership

The investigation half of this task may be **absorbed by the shared-generator flake work** (#177/#190
territory) if that finds one cause behind the retry population — along with #167 and #176. Those stay
open until it reports, rather than being closed on the expectation.

### Do not

Widen the timeout. It converts the defect into a slower version of itself, and the timeout is precisely
what disguised this class as a flake for days.

## Sources

None in this folder. Detail above recovered from the session transcript (`faf7e858-…jsonl`).
