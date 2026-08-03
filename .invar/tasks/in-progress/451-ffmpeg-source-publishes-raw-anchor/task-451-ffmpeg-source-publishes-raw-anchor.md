# Task #451 — FfmpegVideoSource publishes a raw anchor despite having statics

Priority: architecture-hygiene
Engine: codex
Environment: any
Model: 5.6-sol
Effort: medium
State: IN-PROGRESS

## In plain words

One class has shared helper functions but skips the wrapper that makes
them behave correctly for subclasses. It is a small mistake with the
same root as the big cleanup we just did.

## Source

Bycatch from #448.

## Seen

`src/modules/media/FfmpegVideoSource.ts` declares `locate` and
`sampleArgumentVector` statics but publishes the raw
`$FfmpegVideoSource` anchor. The namespace-pattern record requires
`Static($X)` for a statics-bearing public class.

## Wanted

Anchor the statics at `$Class` per the ivue skill's anchor rule, or
delete the statics if nothing outside reads them (rung 1). Decide
which and say why. `sampleArgumentVector` is on #448's rung-3
allowlist as a deliberately fixed recipe, so check whether anchoring
changes that row.

## Invariant

`Public classes use the namespace pattern` (project.invariants.md).
This is a live violation, not drift.

## HELD from gating 2026-08-02 — deliberate, not forgotten

Delivered READY at `a80c75c0`. NOT gated and NOT landed, on purpose.

#457 is measuring gate determinism by RUNNING GATES on unchanged
commits. A concurrent gate from this task would add load to exactly the
measurement that decides whether the gate can be trusted. The user's
standing goal is a solid deterministic gate, and that outranks landing
a small hygiene fix a few hours sooner.

Land this once #457 reports its acceptance runs.

## Two conductor-map findings from its Bycatch — both correct, both mine

1. The brief ordered `bun scripts/harness/smoke-animated-media-harness.ts`.
   **That file does not exist.** The only media harness is
   `scripts/harness/smoke-media-harness.ts`. An instruction is an
   assertion; this one was never run before being handed over.
2. The brief's invariant list omitted the colocated
   `src/modules/media/media.invariants.md` while the task changes
   `src/modules/media/`. Path-implication should have caught it. The
   builder reviewed all six records anyway.

Both are defects in briefing, not in the work.
