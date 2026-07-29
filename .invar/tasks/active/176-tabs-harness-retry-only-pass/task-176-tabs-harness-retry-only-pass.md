# 176 — the tabs harness passed only on retry

State: ACTIVE
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default
Priority: flake-evidence

## Outline

`smoke: tabs harness` passed only on retry during the #172 gate, **and it is not in the flake census** —
so it is a new member of the retry population rather than a known one.

### Two readings, and the refusal to guess between them

The timing cuts both ways:

1. **The old global idle was masking a race** by making everything wait longer — in which case #172's
   change EXPOSED the race and is exonerated;
2. **`awaitProjectedFrame()` resolves earlier than the tabs path needs** — a real gap introduced by the
   conversion.

Circumstantial support for implication: tabs was one of the multi-launch jobs, and went **875 ms →
28,291 ms** in the profile.

### The method required before anyone picks a story

**Population separation across three trees**: `1597f40`, pre-fix main, and current main.

That is now affordable in a way it was not before — an N=20 sequence against a 6-minute gate is a
different proposition than against an 18-minute one, which is why the gate-time work (#178) had to come
first.

### Ownership

The investigation half may be **absorbed** by the shared-generator flake work if that finds one cause
behind the whole retry population, along with #164 and #167. Those stay open until it reports rather
than being closed on the expectation.

## Sources

None in this folder. Detail above recovered from the session transcript (`faf7e858-…jsonl`).
