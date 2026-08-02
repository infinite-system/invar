# Task #455 — Agent composer stays empty after a slash command

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

smoke-agent-cancel-harness.ts timed out waiting for '/resolver-smoke ARGUMENTANCHOR'; its final grid showed an empty composer. Seen once (#442 round 11).

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

Folded into #452 round 5, which fixed it. Verified ALL-PASS at tip
`4b0a97bc`.

**Second correction, same day:** I first wrote that this was a "#452
regression". The evidence only supported "STACK regression" — the
branch carries #442 and #444 as well, and the builder's own A/B pointed
at #442's chrome work rather than the identity change. Not pre-existing
on main is proven; blaming #452 specifically was not. Attribution needs
its own measurement, and I skipped it twice in one evening.

**The lesson is mine:** a red seen only on a branch is not evidence
about main. "Unrelated" is a measurement, not an impression, and I
recorded four of them without measuring.
