# READY — 561 bounded get output truncation

## In plain words

`get tasks` used to print every task — hundreds of records, poison for
an AI reading it. Now big lists show the first 25 plus a loud line
saying how many exist and how to get more. Full output stays one flag
away. Along the way, two older bugs surfaced and died: the "switch"
refactor 556 claimed had silently never landed, and very large answers
were being cut off mid-print.

## Delivered

- HarnessPrint (graph module): one serializer rule — arrays/objects
  over 25 truncate with "truncated: N total, showing K — narrow the
  path, or use --limit/--offset/--full"; root-only offset paging;
  nested containers head-bounded; --full explicit. Graph stays whole;
  identical attached and cold. 6 both-arms tests (39 total).
- parseFlags switch applied FOR REAL (556's claim was false — its
  scripted edit no-opped without an assert; summary-556 records it).
- process.exitCode replaces process.exit: large --full answers flush
  completely (was cut at 155 of 417 nodes).

## Invariants in scope (answered)

- Disk is the store and the graph is a projection: upheld — truncation
  is presentation only; wire and node stay whole.

## Verification

Driven on the real repo: `get tasks` bounded with markers (417 total /
145 active shown 25); --limit 3 --offset 100 pages; --full complete
(653 slug lines); exit codes verified DIRECTLY (the first pipeline
measurement hit doctrine's own pipeline-exit trap). Gate GREEN
(GATE_EXIT=0, /tmp/gate-561.log).

## Bycatch

- Scripted-edit-without-assert = a done that lies (556's switch).
  Lesson for conductor md at next sweep: every scripted edit asserts
  its match or refuses.
