# 136 — one shared scale-fixture generator with a cached corpus

State: TODO
Created: 2026-07-28
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default
Priority: architecture-hygiene

## Outline

Every instrument that needs a large file rolls its own. The 2k / 20k / 100k / 500k ladder is authored
separately in the component scale instrument, in `measure-input-byte-flush.ts`, in the behavioral
contracts, and again in each new driver — so "the 100k case" is not one subject measured by several
instruments, it is several different files that happen to share a line count.

Wanted: one generator, one cached corpus. Fixtures are GENERATED into `tmp/` and cached, never
committed — a 100k-line file in git lives in every clone forever and churns on every regeneration.
`tmp/` was added to `.gitignore` for exactly this, with the reason written inline and pointing here.

### Why it keeps coming up

Three separate pieces of work have named this task as the natural home for their fixture needs and
each generated into `tmp/` in the meantime with a note that a shared generator would replace it:

- the keystroke-to-painted-frame edit-path instrument (needs the same ladder through a real PTY);
- the drive quickstart (#137), which wants a fixture SIZE to be one flag rather than an authoring
  exercise;
- the nested-fold fixture work, which added `scripts/make-nested-fold-fixture.ts` as yet another
  private generator.

Each deferral is individually reasonable. The accumulation is the task.

### The property that makes it worth doing

Scale parity means the same subject at different sizes. Independently authored fixtures cannot give
that, because a difference between two sizes can be a difference between two files. A shared
generator makes size the ONLY variable, which is the whole point of a scale-invariance contract.

## Sources

None in this folder. Detail above recovered from the session transcript
(`faf7e858-…jsonl`), where the task is referenced by number in the scale-instrument brief, the drive
quickstart brief, and the `.gitignore` change that names it.
