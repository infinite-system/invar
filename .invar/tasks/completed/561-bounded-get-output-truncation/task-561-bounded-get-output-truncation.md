# 561 — bounded get output truncation

Priority: user-directed
State: COMPLETED — 49ed5e62 — get tasks now prints a bounded screenful with a loud truncation marker; --limit/--offset/--full page or bypass; large answers no longer cut off mid-print.
Engine: claude
Environment: linux
Model: fable-5
Effort: medium
Assignment note: conductor self-do — user order 2026-08-14 ("yes do it
as #561").

## In plain words

`get tasks` prints every task — hundreds of records, poison for an AI
reading the answer. Bound what one get PRINTS: big arrays and
big objects show the first 25 entries plus a loud marker saying how
many exist and how to get more. The graph itself stays whole; only the
printing is bounded.

## The shape (settled with the user)

- Serializer-level rule, one generator for every domain: arrays and
  many-keyed objects over DEFAULT_PRINT_LIMIT (25) truncate with
  "…truncated: N total, showing 25 — narrow the path, or use
  --limit/--offset/--full".
- Flags: --limit N --offset K (paging), --full (firehose, explicit).
- Same attached and cold (client-side at print time; wire stays whole).
- The marker teaches progressive disclosure (narrow the path), like
  misses teach addressable keys.

## The deliverable, twice

CODE: bounded serializer + flags + both-arms tests (fires over limit,
silent under it, --full bypasses, nested containers bounded too).
VISUAL: `get tasks` prints a screenful with the truncation marker;
`get tasks --full` prints everything.

## Invariants in scope

- iv-harness.invariants.md "Disk is the store and the graph is a
  projection" — upheld by design: truncation is presentation, the
  graph node stays whole.

## Bycatch expected

Report per AGENTS.md taxonomy, even when None observed.
