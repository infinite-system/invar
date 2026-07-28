# 177 — one retry per gate, never the same smoke twice

State: TODO — needs 3–5 clean gates before the ratchet can tighten
Created: 2026-07-28
Engine: claude
Environment: linux
Model: fable-5
Effort: high
Assignment note: Sets a ratchet from measured data; needs 3-5 clean gates first.

## Outline

### The hypothesis this task holds

**The flake may be in the POOL, not in the smokes.** The gate's persistent one-retry-per-run pattern
looks like a single shared cause rather than N independent defects — and while that hypothesis is open,
**point-fixing individual flaky smokes destroys the evidence measurement needs.** That constraint has
been written into every adjacent brief: convert a wait if it is wrong, but do not go hunting beyond it.

### The measured population

From an 11-gate window:

- `terminal-stage` ×4, `scrollbars` ×3, `panel-chrome` ×1, `bounded-list-popup` ×1, `git-watch` ×1,
  `editor` ×1, `clipboard-frame-boundary` ×1
- `markdown` hard-failed once (#174) — **not timeout-class, does not retry, a different class, do not
  fold it in**
- the fold-dense behavioural contract travelled 995 rows against a 1,000-row requirement once (#193) —
  also a different class
- **Only 1 of 11 gates was retry-clean.**

An earlier census over **121 gate runs found 33 masked retries** (~27% retry-clean). **The rate is
getting worse, not better.**

### The proposed contract

**One retry per gate, and never the same smoke twice.** A gate that retries two different smokes is
reporting an unstable pool; a gate that retries the SAME smoke twice is reporting a defect it just
laundered into a pass.

### Sequencing — the user's call, on record

The user asked whether to convert the gate to **no retries at all**: *"otherwise it's still not fully
strict."* The answer taken, and confirmed: **the gate already REPORTS its retries, so keep monitoring
first.** Retry history is now persisted to `.perf-history/gate-retries.ndjson`, which means the ratchet
can be set from measured data rather than from a guess.

**The ratchet needs 3–5 clean gates before it tightens** — turning it on against the current rate would
red every gate and teach everyone to bypass it, which is the failure mode the whole flake programme
exists to avoid.

## Sources

None in this folder. Detail above recovered from the session transcript (`faf7e858-…jsonl`).
