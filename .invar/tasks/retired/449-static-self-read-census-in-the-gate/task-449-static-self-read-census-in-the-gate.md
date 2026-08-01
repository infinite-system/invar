# Task #449 — the gate holds the static-self-read rule

Priority: architecture-hygiene
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high
State: RETIRED — folded into #448 round 3, 2026-08-01

## In plain words

We say our classes can be extended. In many places they cannot,
because they read their settings from a fixed class name and ignore
the subclass. Cleaning the existing ones is #448. This task stops new
ones appearing, by teaching the checker to refuse them.

## Why this task exists

USER RULING 2026-08-01: "the self references to the class without
extensibility became a bad habit, we need to clean it up and
strengthen that, otherwise we claim full extensibility but it's
actually not."

A cleanup alone decays. The habit produced 61 sites (six fixed in
#443, 55 found by its census) with nothing refusing them. A rule
nothing enforces is a preference.

## Depends on

#448 must land first. Its per-static classification produces the
deliberate rung-3 rows, and those rows ARE this census's starting
allowlist. Enforcing before the walk would either block the tree or
bake today's mistakes into the allowlist.

## What to build

1. A `static-self-read-census` in `scripts/ast-query.ts`, matching the
   existing census shape: instance code in a project class reading a
   static through a raw class name or a namespace `Class` slot rather
   than through `this.constructor`.
2. A positive-control fixture under `scripts/fixtures/` that the
   census MUST reject, plus the negative arm — a correct
   `this.constructor` read the census must stay silent about. Both
   arms, per conductor rule two. A census that only fails toward pass
   is a decoration.
3. Wire it into `scripts/conventions-gate.sh` with the same
   positive-control-first pattern the editable-text census uses.
4. The allowlist for deliberate rung-3 sites SHRINKS ONLY, documented
   like the canvas census, each entry carrying the one-line reason
   #448 recorded for it.

## The contract half

#443 proposed a chosen record, `Live static reads follow the receiving
class`, and the conductor has not accepted it. Accept or refine it as
part of this task, and give it a Verification that RUNS this census.
A record whose Verification is a census the gate runs is a record that
cannot quietly rot. Annotate the enforcement point.

## Impossible if true

A new class can land on main reading its own live static through a
fixed class name without an allowlist entry naming why.

## Retired: folded into #448

USER RULING 2026-08-01: fold. The reason for splitting was that the
allowlist derives from #448's classification. That is not two tasks —
it is one task whose last step is locking the count. The census that
finds the sites IS the census the gate runs, so building it twice in
two branches adds a drift seam and buys nothing.

The real cost of splitting was the unguarded window: main clean, no
gate, #449 sitting behind six queued tasks, while the habit that
produced 61 sites keeps producing. Cleaning without strengthening
decays, which was the whole point of the user's correction.

Every requirement in this file moved verbatim into
`.invar/tasks/in-progress/448-static-reads-that-can-block-overrides/brief-448-3-the-gate-holds-the-rule.md`.
No branch was ever cut for this task.
