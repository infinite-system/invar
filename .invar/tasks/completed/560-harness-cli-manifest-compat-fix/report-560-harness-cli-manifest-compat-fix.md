# READY — 560 harness cli manifest compat fix

## In plain words

Talking to a warm server started before M3 crashed the CLI (the old
server's id-file has no birth-commit field; the warning code assumed
it exists). Fixed with a guard that treats absent as "no warning".
Also task 556's structured report file had merge-conflict scribbles
inside from two copies meeting in the merge — rewritten clean.

## Delivered

- warnIfStale: bootCommit == null guard (covers undefined from
  pre-M3 manifests); old-manifest test added (33 total).
- 556 report-meta.json valid; metrics.tasksWithReportMeta reads 1.

## Invariants in scope (answered)

- A graph server is a disposable cache: upheld — "clients never depend
  on server version" now includes manifest-format version.

## Verification

- Driven: planted old-format manifest + live pid + dead socket — the
  exact crash reproduction — answers cold, exit 0, no crash.
- Gate r1 red: prettier (real — unformatted heredoc json, fixed) +
  diff-overview (#549 class, 4th sighting). Gate r2 GREEN
  (GATE_EXIT=0, /tmp/gate-560-r2.log).

## Bycatch

- Process lesson: a fixture planted in a BRANCH where main will write
  the same file at landing time produces a union-merge with markers —
  never plant landing-owned files in the branch (556's report-meta).
