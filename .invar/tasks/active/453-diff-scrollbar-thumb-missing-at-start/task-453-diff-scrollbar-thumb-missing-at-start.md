# Task #453 — Diff pane vertical thumb never paints

Priority: flake-evidence
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high
State: ACTIVE

## In plain words

A check that drives the real app stopped working. It is not related to
the work that found it, so it gets its own task and its own evidence.

## Seen

smoke-scrollbars-harness.ts timed out at 'the diff pane vertical thumb is painted before frame collection begins'. The final diff grid showed no thumb. Reproduced twice (#442 round 11).

## Wanted

Drive it and establish whether the product or the instrument is wrong.
Tonight's dirty-dot round proved a broken checker can look exactly like
a broken product: the helper read the wrong row after a layout change,
and the conductor called it a user-visible regression. Establish which
side is wrong BEFORE changing either.

## CORRECTION 2026-08-01 — this is a #452 regression, not an independent bug

I filed this from a red in the #452 stack gate and called it
"pre-existing and unrelated". I never ran the A/B that would have
tested that claim.

The A/B has now run, quiet and serial, on both trees:

- on plain `main`: **ALL-PASS**
- on the #452 stack (`a94eb89f`): **fails, deterministically, same
  message every run**

So the defect does not exist on main. It arrives with #452's opaque
`pane-instance-N` identities, and it belongs to that task's remaining
kind-string consumer sweep.

Folded into #452 round 5. This folder stays for the record and for the
number, but do not dispatch it as separate work unless round 5 proves
the cause is genuinely elsewhere.

**The lesson is mine:** a red seen only on a branch is not evidence
about main. "Unrelated" is a measurement, not an impression, and I
recorded four of them without measuring.
