# Brief 443-1 — remove the self-reference getter, apply the ladder

Read [.claude/skills/ibr/IBR.md](../../../../.claude/skills/ibr/IBR.md) in full, and the `/ivue` skill's new
section "Reading your own statics — the ladder", before any work.

## The defect

Six UI classes read their own static constants through a
self-reference getter. `Reactive(X) === X`, so the namespace `Class`
slot IS the base class. A subclass instance therefore reads the BASE
static and its own override is ignored.

Conductor measurement (subclass overriding the static with 0.1):

- read through `this.constructor`: 0.1, the override applies.
- read through the current pattern: 0.4, the override is ignored.
- base instance through `this.constructor`: 0.4, correct, because the
  engine constructor inherits `$Class`.

## The task

1. Reproduce the measurement first. Write a small script that
   subclasses one of the six classes, overrides its static, and
   prints both reads. See 0.4 where 0.1 belongs before you change
   anything.
2. Apply the ladder from the ivue skill PER SITE, and state the rung
   you chose and why:
   - rung 1: nothing outside the instance reads it, so delete the
     static and keep a plain instance getter.
   - rung 2: something outside reads it, so keep the static and read
     `(this.constructor as typeof $Class).NAME`.
   - rung 3: overriding must not happen, so name the class directly.
   Tooltip's tests read `Tooltip.$Class.TOOLTIP_DWELL_SECONDS`, so
   Tooltip is at least rung 2. Check each other site for outside
   readers before choosing rung 1.
3. Delete every `protected get <ClassName>()` self-reference getter.
   Sites: `src/modules/ui/` Tooltip.ts, ShortcutHelp.ts,
   ContextMenu.ts, HoverCard.ts, PanelHost.ts, OverlayCoordinator.ts.
   Confirm the census is complete: grep for `as unknown as typeof`
   across `src` and report anything the list missed.
4. Positive control, required: a test subclass overrides one static
   and asserts the OBSERVED behavior changes. Plant it before the fix
   and see it red.
5. Check whether any other class in the repo reads a static in a way
   that also blocks overriding, even without this exact shape. Report
   what you find; do not fix outside the six sites without saying so.

## Invariants in scope

- The ivue conventions are law here. The new ladder section is the
  authority for this task.
- Check the ui module contracts for records naming these constants or
  their override behavior. Propose a record if the override
  expectation is nowhere stated: a live static getter must be
  overridable by a subclass.

## Bycatch expected

Report per the [AGENTS.md](../../../../AGENTS.md) taxonomy (runtime
defects, invariant violations, comment drift, distillation
possibilities, generator drift, plain nonsense). Carry a `## Bycatch`
section even when it reads `None observed`.

## End state

A report in this folder naming the rung chosen per site, the census
result, and the positive control's red then green. Unit tests and
`bunx tsc --noEmit` green. Do not run `scripts/merge-gate.sh`; commit
with SKIP_GATE=1; the conductor gates at landing.
