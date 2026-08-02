# Brief #457 round 2 — a gate label must name the thing you can run

## In plain words

The gate prints a name for each check. Someone reading a failure copies
that name to reproduce it. For at least one job the name does not match
any real file, so the copy fails. Fix the class.

## The sighting

`scripts/merge-gate.sh:1231`:

```bash
parallel_safe_smoke "smoke: animated-media harness" bun scripts/harness/smoke-media-harness.ts
```

The label says `animated-media harness`. The only media harness file is
`smoke-media-harness.ts`. The conductor wrote
`bun scripts/harness/smoke-animated-media-harness.ts` into a brief for
another task, derived straight from this label; the builder hit
`Module not found` and reported it as bycatch.

## Why this is in scope for a determinism task

A gate's verdict is only useful if a human or an agent can reproduce
the failing check. When a label does not resolve to a runnable command,
reproduction fails in a way that looks like the check is broken, and
the reader's next move is to re-run the whole gate — the exact habit
this task exists to remove.

It is also the cheapest possible class of gate defect: a naming
mismatch that no test can catch because nothing verifies labels.

## The work

Census every registered gate job — parallel pool and serial tail — and
check that its label resolves to what it runs. Then make the class
impossible rather than fixing the one:

- prefer deriving the label FROM the command, so they cannot drift; or
- add a check that every registered job's label resolves to its script
  path, and run it in the gate's own self-test phase.

Deriving is better than checking. A label that cannot disagree needs no
guard.

## Both arms

- Positive: a deliberately mismatched label must fail the new check.
- Negative: the corrected set must pass, with no label exempted by a
  special case.

If you make labels derived rather than checked, the arms become: a
job's printed label matches its script path for every registered job,
and a planted mismatch is unrepresentable — say so plainly if that is
what you built.

## Scope note

This is additive to round 1 and does not change its acceptance
criterion. Do it while you are already inside `merge-gate.sh`; do not
let it displace the determinism work, which remains the priority.

## Invariants in scope

- Same as round 1. If a record covers gate job registration, this
  refines it; if none does, say so rather than inventing one.
- Any record this list MISSED is a finding about the conductor's map.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. Write the
`## Bycatch` section even if it reads `None observed`.

## End state

The round 1 report gains a short section: the label census count, how
many mismatched, and whether you made the class impossible or merely
checked it.
