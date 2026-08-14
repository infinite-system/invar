# READY — 556 iv-harness M3: structured reports, drift wrap, staleness guard

## In plain words

Builders can leave a small structured file beside their report and the
graph turns those into fleet numbers (steering density, invariant
verdicts, touched areas). The drift detector joined the graph as a
wrapped capability. A warm server now knows its birth commit and warns
when it is older than the code.

## Delivered

- report-meta.json schema (TaskReportMeta is the authority);
  TaskNode.reportMeta; `get metrics` aggregates (coverage, steering
  density, verdict tallies, domain counts).
- `get drift`: HarnessDrift wraps scripts/tasks/tasks-status.ts —
  logic stays in the script, the graph parses OUTPUT; absent script =
  absent capability. Live proof: real 5/2/9 signals.
- Boot-commit stamp in manifest + /status; attach warns
  "server booted at X but HEAD is Y" and still answers.
- parseFlags -> switch (user style call). Contract scope refinement:
  remote access goes THROUGH the server; sync derivation load-bearing.

## Invariants in scope (answered)

- A wrapped script keeps its logic in one place: upheld and now
  GENERATING (HarnessDrift is rung 1 in the flesh).
- Disk is the store / disposable cache / one-way arrow / files
  arbitrate: all upheld; disposable-cache Scope refined (remote =
  through the server) — proposed and applied in the same contract.

## Verification

- 32 tests across 8 files; both new modules ratcheted at birth;
  grammar + tsc + self-test green.
- Driven for real: drift returned the repo's live signals; metrics
  flipped 0 -> 1 when a real report-meta.json was planted; the stale
  warning fired on a genuine HEAD move (the M3 commit itself) with
  both hashes and the restart hint, still answering.
- Gate GREEN first run (GATE_EXIT=0, /tmp/gate-556.log, 0 FAILs).

## Bycatch

- tasks-status DRIFT currently reports 24 findings on main (5
  STATE-MISMATCH, 2 DONE-NO-EVIDENCE, 9 THIN + others) — pre-existing
  record hygiene, now one query away; worth a cleanup sweep task.

## Instrument feedback

EASY: the wrap pattern (run script, parse output) took ~70 lines.
MISSING: #558 describe shapes; #559 dispatch/land verb faces.
