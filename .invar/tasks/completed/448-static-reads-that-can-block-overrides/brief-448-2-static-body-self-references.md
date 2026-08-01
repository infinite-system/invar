# Brief #448 round 2 — the census is half-blind: static bodies too

## In plain words

Your census only looks at normal methods. It never looks inside
`static` code. That is where a second, bigger pile lives: classes that
call their own name instead of saying `this`. Widen the census, then
walk that pile with the same ladder. There is one new rule, and it is
absolute: inside a class's own static code, never write your own class
name.

## What the user found

`AppLoader` is a `Static()` capability whose statics call themselves
eight times:

```ts
static async main(): Promise<void> {
  try {
    if (await AppLoader.Class.handlePluginCommand()) return;
    const booted = await AppLoader.Class.bootApp();
    AppLoader.Class.wireSignals(booted);
  } catch (error) {
    AppLoader.Class.handleFatal(error);
  }
}
```

`AppLoader.Class` is a GLOBAL slot lookup. It does not care which
class the call arrived on. So a subclass inherits `main()`, `main()`
re-enters the slot, and lands back on the base — the subclass's
override never runs.

`this.handleFatal(error)` is strictly better. ivue statics bind to the
RECEIVING class, so `this` follows BOTH the `Class` slot swap and
`extends`. `Namespace.Class` follows only the swap.

| written as | follows a `Class` slot swap | follows `extends` |
| --- | --- | --- |
| `AppLoader.Class.handleFatal()` | yes | no |
| `this.handleFatal()` | yes | yes |

## The proof is already in the repo

`src/modules/app/AppLoader.test.ts` must do BOTH of these to test a
failing boot:

```ts
class $Failing extends AppLoader.$Class { … }   // subclass it
AppLoader.Class = $Failing;                      // AND swap the slot
```

The second line is required only because the self-references cannot be
reached by subclassing. That test is the standing evidence that the
seam is weaker than the file claims. `AppLoader.ts` carries
`invariant: Construction goes through overridable seams` and a header
comment saying the entry orchestration is overridable.

Reproduce this before changing anything: write a subclass that
overrides `handleFatal`, call `main()` on the SUBCLASS without
touching the slot, and show the base handler runs. That is the
positive arm. Then show `this.` makes the override run. Both arms.

## The rule this establishes

**Inside a class's own static body, never name your own class.** Use
`this`. There is no rung 3 here: rung 3 exists for values that must
not follow a subclass, and a method call on yourself is never that.

Reaching a DIFFERENT class stays `Namespace.Class` — that is the
dependency seam and it is correct. Do not touch cross-class reads.

## What to do

1. Widen the census in
   [443-census-static-reads-that-block-overrides.ts](443-census-static-reads-that-block-overrides.ts)
   to cover STATIC bodies as well as instance bodies. Report the two
   populations separately; do not merge the counts.
2. A conductor grep across `src` found roughly 20 files with own-name
   references, led by `BoundedListPopup` 29, `TasksDashboardOverview`
   9, `HoverCard` 8, `AppLoader` 8, `Kernel` 5. That grep is crude and
   counts both populations together — treat it as a floor to beat, not
   an answer. Your census is the number of record.
3. Convert the static-body population to `this`. This population has
   no rung-3 rows, so it should go to zero. If you find a site that
   genuinely cannot, that exception is a finding — name it loudly, do
   not quietly allowlist it.
4. Round 1's instance-body work and its pair rule are unchanged. Keep
   both tables in the report, separately.

## Watch for the pair rule crossing populations

A static may be read from BOTH a static body and an instance body. The
round-1 pair rule still governs: enumerate ALL reads of a static
across both populations before moving any of them.

## Invariants in scope

- [Construction goes through overridable seams](../../../../project.invariants.md)
  — this is the record the finding stresses. Today it is satisfied by
  the `Class` slot alone, and `AppLoader.test.ts` shows subclassing is
  not sufficient by itself. Judge whether the record needs refining to
  say that a seam must follow the RECEIVER, not only the slot. Propose
  the wording; do not edit the contract.
- [app.invariants.md](../../../../src/modules/app/app.invariants.md) —
  `External plugin discovery precedes application boot` is annotated
  inside `bootApp`. Confirm your change keeps that ordering.
- Round 1's list still applies.
- Any record this list MISSED is a finding about the conductor's map.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. Write the
`## Bycatch` section even if it reads `None observed`.

## Verification

- The subclass-without-slot-swap reproduction above, both arms.
- Simplify `AppLoader.test.ts` to drop the now-unnecessary slot
  assignment where subclassing alone suffices. If a test still needs
  the swap after the change, that is a site you missed.
- `bun test`, `bunx tsc --noEmit`, `bash scripts/conventions-gate.sh`,
  invariant checker `--all` and `--refs`, and `bun run drive` once.
- Do NOT run `scripts/merge-gate.sh`. Commit with `SKIP_GATE=1`.

## Report

Open with `## In plain words`. Two tables, two populations, kept
separate. Answer the invariants record by record.
