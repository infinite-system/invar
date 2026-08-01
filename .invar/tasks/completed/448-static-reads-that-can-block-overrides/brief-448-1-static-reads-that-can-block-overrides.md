# Brief #448 round 1 — static reads that can block subclass overrides

## In plain words

Many classes read their own settings by naming a fixed class instead
of asking themselves. A subclass that changes a setting is then
ignored. Walk all 55 places, decide one of three answers for each, and
say which answer you picked and why. Some of them are fine as they
are, and calling those broken would be the wrong fix.

## Where this came from

#443 fixed six classes and landed. Its census script found 55 more
candidate reads across 14 production classes. #443 deliberately did
not touch them: a census proves the read SHAPE, not that any given
site is wrong.

Read [the #443 report](../../in-progress/443-static-read-indirection-defeats-override/report-443-static-read-indirection-defeats-override.md)
and rerun its census script,
[443-census-static-reads-that-block-overrides.ts](../../in-progress/443-static-read-indirection-defeats-override/443-census-static-reads-that-block-overrides.ts),
before deciding anything. Confirm the count still reproduces. If it
does not, that disagreement is the first finding.

## The ladder (from the ivue skill — read it)

Read the "Reading your own statics — the ladder" section of
[the ivue skill](../../../../.claude/skills/ivue/SKILL.md) in full.

- **Rung 1 — delete the static.** Nothing outside the class reads it.
  The value becomes a plain instance getter. This was the right answer
  for five of #443's six sites. Prefer it.
- **Rung 2 — `(this.constructor as typeof $Class).X`.** Outside code
  reads the static AND subclasses may legitimately change it. It is a
  live knob.
- **Rung 3 — name the class directly.** The value must NOT follow a
  subclass. This is a real answer, not a defect. Say why when you
  choose it.
- **Never** a `protected get <ClassName>()` self-reference getter.

## The pair rule — load-bearing, do not skip

A static is often PRODUCED at one site and MATCHED at another.
`BreadcrumbPicker` is the example the user raised:

```ts
identifier: $BreadcrumbPicker.PARENT_DIRECTORY_ITEM_IDENTIFIER,   // produces
item.identifier === $BreadcrumbPicker.PARENT_DIRECTORY_ITEM_IDENTIFIER // recognizes
```

While every read is pinned, a subclass override is ineffective but
CONSISTENT. Convert one site and leave its partner pinned, and a
subclass produces items it can never recognize — with no type error
and no test failure until a subclass exists. Silent.

So: for each static, enumerate ALL its reads FIRST. They all move to
the same rung, or none of them move. Report the read set per static,
never per line. A per-line conversion table is a rejected deliverable.

## Deliverable

A table, one row per STATIC (not per read site): class, static name,
read count, external readers (yes/no, with the file), rung chosen, one
line of reason. Then the change implementing it.

Where you choose rung 2, add a subclass behavior test that observes
BEHAVIOR, not the getter — a subclass sets the knob, the inherited
behavior follows. #443's `ShortDwellTooltip` is the model.

Where you choose rung 3, no code change. The row and the reason are
the deliverable.

## Per-site proof, not class-level proof

A mass conversion needs per-site evidence. Do not convert a class
because its neighbors converted. If a site is ambiguous, say so and
leave it, with the ambiguity named. An honest 40-of-55 with reasons
beats 55-of-55 with a rule applied blindly.

## Scope boundary

Do NOT touch `src/modules/navigation/`, `src/modules/workspace/`
history code, or editor-area chrome — #444 and the unlanded #442 own
those. `BreadcrumbPicker` sits near #442's landed chrome work; treat
its statics only, not its rendering.

## Invariants in scope

- [project.invariants.md](../../../../project.invariants.md) —
  `Public classes use the namespace pattern`. Removing the last static
  from a class removes its `Static()` anchor too; the namespace then
  publishes the honest raw or reactive form. #443 did this five times.
- [The UI contract](../../../../src/modules/ui/ui.invariants.md) and
  [the monitoring contract](../../../../src/modules/monitoring/monitoring.invariants.md)
  — most affected classes live there. Report any record whose Mechanism
  names a static you move.
- #443 proposed a new chosen record, `Live static reads follow the
  receiving class`, and the conductor has not accepted it yet. Judge
  whether your work makes that record the right shape, or reveals a
  sharper one. Propose; do not edit contracts unasked.
- Any record this list MISSED is a finding about the conductor's map.

## Bycatch expected

Report every defect you SEE, fix only the one you were sent for, per
[AGENTS.md](../../../../AGENTS.md)'s taxonomy: runtime defects,
invariant violations in function, comment drift, distillation
possibilities, generator drift or introduced variance, plain nonsense.
Write the `## Bycatch` section even if it reads `None observed`.

## Verification

- Rerun the census after the change. The remaining count must match
  your rung-3 rows exactly. A leftover you did not classify is a miss.
- `bun test`, `bunx tsc --noEmit`, `bash scripts/conventions-gate.sh`,
  and the invariant checker `--all` and `--refs`.
- `bun run drive` at least once to confirm nothing visual moved. This
  should be a behavior-preserving change everywhere except where a
  subclass test proves the new knob works.
- Do NOT run `scripts/merge-gate.sh`. Commit with `SKIP_GATE=1`. The
  conductor gates and lands.

## Report

Open with `## In plain words`. Answer the invariants list record by
record: upheld, violated, or needs refinement.
