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
