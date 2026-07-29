# 204 — drive expects every key to paint, and targets cells by number

State: COMPLETED — merged 7aa3a7c
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default

## Outline

**PRIMARY, user-directed.** *"A primary task is to improve the drive tool then — the drive stubs will
pollute the repo"* and *"first the drive script should be solid so recipes stand on solid
foundations."*

### The two defects

1. **Every action awaits a repaint.** `scripts/harness/Drive.ts:421-422` calls `this.sendAction(...)`
   then unconditionally `await driver.awaitScreenChange(...)`. **That is the dominant defect class in
   the tool everyone will build on** — an eighth spelling of asking for evidence of a change that will
   not happen. A key that legitimately paints nothing (a no-op chord, a clamped wheel, a modifier) hangs
   the driver.
2. **Cells are targeted by number.** A drive that names row 14, column 7 breaks the moment the layout
   moves — which is exactly the brittleness that made eight probes stale (#143).

### Why it comes BEFORE the recipes

The user's sequencing, and the reason for it: recipes authored on a driver whose waits are wrong inherit
the wrong waits, at scale, in files nobody will re-audit. **Fix the foundation first.**

### The recipe design the user specified

> *"maybe we should store the RECIPE for the drive, not the drive code itself — that's where it encodes
> the intent rather than the specific code."*

Plus provenance, in two parts:

> *"the recipe should record the original branch the recipe came from, so agents can bisect if
> necessary"*
>
> *"record all the branches the recipe was improved within later, so there is a small log going on of
> improvement of the recipe"*

So a recipe carries an **origin branch** and an **append-only improvement log** — enough to bisect a
recipe's behaviour the way one bisects code.

### Delivered so far

Every drive action now has a **STATED completion condition** instead of an inferred repaint. Chord
prefixes are **derived from `KeybindingDefaults`** rather than hand-enumerated, so a new chord cannot
silently fall outside the driver's vocabulary.

### A dispatch decision worth keeping

This task was ready to dispatch alongside the flake investigation, and two builders is within cap. **It
was held anyway**: the flake builder's entire deliverable is population separations on LOAD-SENSITIVE
smokes, and a second builder spawning app instances would inflate the very timings it measures.

> **The cap is about machine capacity; this was about not corrupting evidence I had just asked for.
> Concurrency limits should be reasoned per PAIR of tasks, not only per count.**

## Sources

- [brief-204-1-drive-tool-step-model-and-targeting.md](brief-204-1-drive-tool-step-model-and-targeting.md)
- Detail above additionally recovered from the session transcript (`faf7e858-…jsonl`).
