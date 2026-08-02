# Brief #457 round 1 — make the gate deterministic

## In plain words

Run the gate twice on the same commit and it must give the same
answer. Today it does not: five runs on one unchanged commit gave four
reds and one green, with a different smoke failing each time. Fix that
first. Everything downstream — every landing, every A/B, every claim
that a change is safe — rests on this.

## The goal, stated as a testable property

**The gate's verdict is a function of the commit alone.**

Acceptance criterion, and it is a measurement, not an opinion:

- **Five consecutive runs on one unchanged commit produce five
  identical verdicts.**
- **Run at two different worker counts (3 and 6). The verdict must not
  change with worker count.** If it does, the gate is measuring the
  machine, not the code.
- **A planted real defect must go red in all five runs.** A gate that
  is stable because it stopped detecting things is worse than a flaky
  one.

Those three together are the definition of done. Report the runs.

## Read the task file first

[task-457](task-457-serial-tail-lacks-quiet-retry.md) carries the
measurements. Read its opening: this task's ORIGINAL premise was false
— the conductor claimed the serial tail had no quiet retry, and it has
one. The file name still says otherwise and is kept only so the number
resolves. Work from the rewritten body.

## Established — do not re-derive

Baseline `9f158472`, 6 workers, idle machine: **4 red / 1 green**.
`terminal harness` 2/5, `shortcut-help` 2/5, `behavioral-contracts`
1/5. Pre-landing commit, 3 runs: `terminal` 1/3, so INHERITED.
After the #436 convergence fix, `c5dc3057`: **4 green / 5**, `terminal
harness` **2/5 -> 0/5**. That one is fixed; do not reopen it.

## Where the nondeterminism actually lives

The observation layer is already correct and is NOT the problem:
`PtyTestDriver` records every completed synchronized frame the app
emits rather than sampling on a clock. The conductor's first theory
blamed sampling and was wrong. Three sources remain:

1. **Verdicts that read the clock.** Durations, frame counts,
   "observed within a window", and absence claims over a sampled
   period. These change answer with machine speed. Convert every
   BLOCKING one to a count-, ordering-, or state-based claim. Durations
   may remain as report-only trends and must never block.
2. **Waits whose deadline is a verdict.** A deadline should fire only
   on a genuine hang, never as a judgement about speed. Size deadlines
   so that a timeout means "this will never happen", not "this was
   slow". Then a timeout is a real failure and needs no retry.
3. **Genuinely load-dependent PRODUCT behaviour.** This one cannot be
   converted away, and must not be hidden.

## The load-dependent tier — the key design decision

You cannot have both a deterministic blocking gate and a blocking
check for behaviour that only appears under load. Separate them:

- **Blocking tier: deterministic.** Correctness claims that hold at any
  speed. This is what gates a merge.
- **Contention tier: reported, never blocking.** Deliberately loaded
  runs that hunt load-only defects, with results recorded so a
  regression is visible as a rate change.

`shortcut-help` belongs to the contention tier as a finding AND stays a
real bug (below). Moving something to the reported tier is not
forgiveness — it is refusing to let an unstable verdict block a merge
while still tracking it.

State plainly in the report which checks you moved and why. A check
moved to the reported tier without a named reason is the gate quietly
losing teeth.

## Then: `shortcut-help`, the remaining real defect

```text
FAIL shortcut sheet reached its final row without showing Toggle Word Wrap
```

Invar's OWN list in Invar's OWN sheet — self-generated output, so the
#436 convergence argument gives it no cover. Under load either a row
goes missing or the scroll ends early. Find which. Deliberate
contention is the reproduction instrument. Never widen a scroll budget
to clear it.

## And: the classifier that missed it

The gate's `smoke timing classification` step inspected 69 sources and
passed — including the `tasks:watch` assertion that was load-bound all
along. Widen it to catch "a claim whose truth changes with machine
speed".

**Positive control, mandatory and specific:** the new matcher must FLAG
the pre-#436 form of that assertion (an absence claim over observed
frames) and STAY SILENT on the current convergence form. Proven in one
direction only, it is worthless.

## Record each run's verdict

Emit one durable append-only line per gate run: commit, worker count,
verdict, failing steps, retries. This is how the acceptance criterion
above gets measured, and how the next person sees a rate change. Keep
it small — a full flake ledger was considered and REJECTED.

## Measurement conditions — the machine is NOT quiet

Two builders are live (#459 panels, #451 media). The user ruled that
the gate outranks waiting for quiet. So **every measurement must state
its conditions**: builders live, load average, worker count. A number
without conditions is not a measurement. For comparisons, sample both
sides back to back rather than trusting numbers from different
moments.

## Do not

- Do not retry assertion failures or extend a retry to reach them.
  Both repeat offenders were assertion-class; retrying one is how a
  gate launders a real defect into a green.
- Do not add a second retry to the serial tail; it already has one.
- Do not widen a timeout, frame budget, or scroll budget to make
  anything pass.
- Do not achieve determinism by deleting coverage. The planted-defect
  arm exists to catch exactly that.

## Invariants in scope

- [The harness contract](../../../../scripts/harness/harness.invariants.md)
  — `Harness waits observe conditions not frame ordinals` and
  `Atomicity is claimed only for self-generated output` (#436).
- **Propose the record this task earns.** "A blocking gate verdict does
  not depend on machine speed" is the invariant behind all of the
  above, and it is written nowhere. Give it an `Impossible if true`
  that a reviewer could actually catch a violation with.
- Any record this list MISSED is a finding about the conductor's map.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. Write the
`## Bycatch` section even if it reads `None observed`.

## Verification

- The three-part acceptance criterion at the top, with all runs
  reported.
- The matcher's two arms.
- `bun test` in FULL, `bunx tsc --noEmit`,
  `bash scripts/conventions-gate.sh`, invariant checker `--all --refs`.
- You MAY run `scripts/merge-gate.sh` for this task — it is the subject
  under test. Coordinate: announce in the report which runs you made
  and when, since other builders' work is measured on the same machine.
- Commit with `SKIP_GATE=1`.

## Scope boundary

The gate, the harness, and the shortcut sheet. Do NOT touch
`src/modules/ui/` panel surfaces (#459) or `src/modules/media/` (#451).

## End state

A report opening with `## In plain words`, carrying: the acceptance
runs, which checks moved to the reported tier and why, what
`shortcut-help`'s mechanism actually is, the matcher's two arms, and
the proposed record.
