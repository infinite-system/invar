# 182 — `BunTerminalBackend.test`'s `collectUntil` resolves with partial text on timeout

State: TODO
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default
Priority: verification-integrity

## Outline

`collectUntil` resolves — **successfully** — with whatever partial text it has when its 4000 ms
deadline expires.

### Why this direction is the dangerous one

It is **the inverse of the dominant defect class, and the more dangerous direction.** The dominant class
(#159/#161/#168/#187/#188/#189) asks for evidence of a change that will not happen, and fails loudly on
a timeout. This one **turns a timeout into a pass**. A wait that cannot fail is worse than the flake it
replaces, because nothing in the output distinguishes it from a real observation.

### The precedent, hours earlier

**#172 stripped exactly this shape out of `Bootstrap`**, where a 120 ms version shipped **a file tree
blank on 20/20 boots** — the app was genuinely broken, twenty times running, and the wait reported
success every time.

The blast radius here is small (a test helper) but the shape is identical, and it was found by looking
for the pattern rather than by a failure.

### The standing rule this produced

> **Do NOT add a timeout fallback that resolves successfully.**

Carried into every subsequent wait-repair brief.

## Sources

None in this folder. Detail above recovered from the session transcript (`faf7e858-…jsonl`).
