# #457 — the gate's verdict is not a function of its input

Priority: verification-integrity
State: COMPLETED — 687dc80f — Gate verdict is now a function of the commit: 5 identical verdicts on one commit, unchanged at 3 and 6 workers, planted defect red 5/5. Real defect was a live-emulator read in the shortcut sheet, not a missing retry.
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high

## In plain words

Run the gate five times on the exact same commit and it answers
differently: four reds and one green, with a different smoke failing
each time. A gate that disagrees with itself cannot certify anything,
and it teaches everyone to re-run reds until one passes.

## This task was filed on a false premise. Read this part first.

The original title was "the serial tail lacks a quiet retry" and the
whole task argued for adding one. **That premise is false.** The serial
tail already retries:

```text
RETRY behavioral-contracts (felt invariants) — timeout-class failure;
      one quiet retry (attempt 1 log preserved)
```

The conductor inferred "no retry exists" from a single gate where no
RETRY line appeared — which actually meant the retry had run and failed
too. Implementing the task as originally written would have added a
second retry to a step that already has one, and the "census load-bound
assertions" half would have been aimed by an author who had not
measured. The rewrite below keeps only what five repeated gate runs
actually established.

## The measurement

Five gates, one unchanged commit (`9f158472`), 6 workers, nothing else
on the machine (load average 1.77 on 16 cores):

| run | verdict | failure |
|---|---|---|
| 1 | GATE_EXIT=1 | terminal harness |
| 2 | GATE_EXIT=1 | shortcut-help, behavioral-contracts |
| 3 | GATE_EXIT=0 | — |
| 4 | GATE_EXIT=1 | terminal harness |
| 5 | GATE_EXIT=1 | shortcut-help |

Frequency: `terminal harness` 2/5, `shortcut-help` 2/5,
`behavioral-contracts` 1/5, plus retry-cleared timeouts in `git-watch`
and `panel-chrome`.

Three gates on the PRE-landing commit gave `terminal harness` 1/3, so
these are long-standing and not introduced by the #442/#444/#452
landing.

## What this establishes, and what it does not

**Established:** the failures CONCENTRATE in a few smokes rather than
scattering thinly across many. The conductor predicted scattering,
which would have pointed at one shared observation defect. That
prediction is falsified. There is no single generator.

**Established:** the two repeat offenders are ASSERTION failures, not
timeouts. Retry logic structurally cannot help them and must never be
extended to try — retrying an assertion failure is how a gate launders
a real defect into a green.

**Not established:** why `shortcut-help` fails. That one is open.

## Already resolved, do not redo

`terminal harness` (2/5) is FIXED, separately, under #436: the
assertion demanded that a foreign process's repaint never appear
incomplete, which Invar cannot guarantee. It now asserts convergence.
The new record is
[Atomicity is claimed only for self-generated output](../../../../scripts/harness/harness.invariants.md).
A verification sweep is measuring whether that moved the rate.

## The work

### 1. `shortcut-help`, 2 of 5 runs — the open defect

```text
FAIL shortcut sheet reached its final row without showing Toggle Word Wrap
```

The sheet scrolled to its last row and the entry was absent. This is
Invar's own list in Invar's own sheet — SELF-GENERATED output, so the
#436 convergence argument gives it no cover. Under load a row goes
missing or the scroll terminates early. Find which. Drive it under
deliberate contention; that is the reproduction instrument.

### 2. The timing-classification matcher has a blind spot

The gate runs a `smoke timing classification` step that inspects
sources for duration and frame-silence assertions, and it passed 69
sources — including the `tasks:watch` assertion that was load-bound all
along. Whatever the matcher looks for, it did not look for "a claim
whose truth changes with machine speed". Widen it, and prove the new
matcher fires on the pre-#436 form of that assertion as a positive
control.

### 3. Publish the disagreement rate

Nothing today records that the gate answers differently on identical
input, so no one can tell a real red from a draw. Emit a durable line
per gate run — commit, worker count, verdict, failing steps — that can
be counted later. This replaces the conductor's ad-hoc `/tmp` sweeps.
Keep it small; a full flake ledger was considered and is more machinery
than the finding justifies.

## Both arms

Any matcher or classifier added here must be proven in both
directions: it fires on a planted load-bound assertion, and stays
silent on a count- or ordering-based one. A classifier that flags
everything is as useless as one that flags nothing.

## Standing evidence for the next conductor

A gate returning a different single red each run, each quiet-green on
the same commit, is reporting its own contention — not the product.
Do not re-run for a green. Diagnose, then change the causal condition
so the next run is an experiment rather than a lottery. And when the
verdict comes from lowering concurrency, remember that a 1-in-5 green
looks exactly like a fixed tree: the conductor landed on one and
reported it as a confirmed diagnosis.

## Invariants in scope

- [The harness contract](../../../../scripts/harness/harness.invariants.md)
  — `Harness waits observe conditions not frame ordinals`, and the new
  `Atomicity is claimed only for self-generated output`. Do not widen a
  wait or a budget to clear anything here.
- Any record this list MISSED is a finding about the conductor's map.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. Write the
`## Bycatch` section even if it reads `None observed`.
