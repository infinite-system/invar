# Brief #459 round 5 — the coverage declaration disagrees with the code

## In plain words

You declared the assertion loss, but the numbers are stale. Update them
to what the counter actually measures now.

## The verdict

`/tmp/gate-459b.log`:

```text
FAIL coverage declaration: scripts/harness/smoke-panel-split-harness.ts:
project.coverage-deltas.md:41 declares assertions 35 -> 27, waits 33 -> 29,
but actual counts are assertions 35 -> 29, waits 33 -> 31.
```

Everything else in the gate passed to that point, including the six
smokes from round 4.

## What to do

Correct line 41 of [project.coverage-deltas.md](../../../../project.coverage-deltas.md) to the measured
counts. Re-run `bun scripts/check-coverage-ratchet.ts` and confirm it
passes with its positive control green.

Then check every OTHER declaration you wrote this task the same way.
A declaration written before a later edit is stale by construction, and
the ratchet only names the first file it finds.

## The rule this exercises

A declared decrease is a claim about the code. It must be measured
after the last edit, not estimated when the edit was planned. This is
the same defect that reached a gate on #442.

## Verification

- `bun scripts/check-coverage-ratchet.ts` passes.
- `bun test` in FULL, `bunx tsc --noEmit`,
  `bash scripts/conventions-gate.sh`, invariant checker `--all --refs`.
- Do NOT run `scripts/merge-gate.sh`. Commit with `SKIP_GATE=1`.

## Invariants in scope

- Unchanged from round 4. No record governs the declaration file; if
  that absence is itself a finding, say so.
- Any record this list MISSED is a finding about the conductor's map.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. Write the
`## Bycatch` section even if it reads `None observed`.

## End state

The report gains one line: the corrected counts and confirmation that
every declaration you wrote was re-measured after the final edit.
