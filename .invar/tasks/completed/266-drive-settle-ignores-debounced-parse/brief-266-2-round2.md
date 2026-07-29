# Brief — #266 round 2: the terminal-stage red is YOURS — the control proves it

Your report classified the `smoke-terminal-stage-harness.ts:591` red
(reduced-motion first-frame, `observed=false, complete=false`) as
"unrelated bycatch outside #266". The conductor ran the control you did
not: **unmodified main (7094d96b), same machine, isolated run — exit 0,
ALL-PASS** (`/tmp/ts-main-control.log`). Your tree red twice + main green
once = the difference is your change. "Outside my diff" is not evidence;
the polarity check is (check both polarities — the standing rule).

Likely mechanism to investigate first: your change made the INITIAL
app-ready wait use the settled-status registry too. The reduced-motion
first-frame assertion observes something about the FIRST frames; if the
harness or app path now settles later (structure/markdown quiescence
gating readiness), an early-frame observation window can close before the
assertion looks. Diagnose properly: read `:591`'s condition, find what
changed in its timeline under your registry, and fix at the right end —
either the registry must not delay whatever readiness signal that smoke
observes, or the smoke's wait was already a hidden frame-ordinal
dependency your change exposed (then fix the WAIT to observe its
condition, and say why that is the truth, not a convenience).

Requirements unchanged from round 1, plus:
- `smoke-terminal-stage-harness.ts` green in your worktree, twice.
- Your own positive control for whatever you touch in it.
- Re-run the full pre-commit gate; if anything else reds, control it
  against main BEFORE classifying it — quote both runs in the report.

## Invariants in scope

- Round 1's set; plus the terminal-stage smoke's records if its wait
  changes.

## Bycatch expected

Per AGENTS.md's taxonomy. The refreshed READY report carries `## Bycatch`
even if it reads `None observed`.

## End state (mechanical)

An UPDATED report (newer than this round's filing stamp) with the
diagnosis, the fix location argued, both terminal-stage runs green, and
the controlled classification of any remaining reds.
