# Task #448 — 55 static reads that can block subclass overrides

Priority: architecture-hygiene
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high
State: COMPLETED — eec0e5ea — The census the cleanup produced became the gate that holds it. User-raised: AppLoader's own-name self-references, and the pair rule. Bycatch became #451.

## In plain words

Lots of classes still read their settings from a fixed class name
instead of from themselves. A subclass that changes a setting is then
ignored. It is the same shape #443 just fixed in six places.

## Source

Bycatch from #443, from its structural census, reproduced twice.

## Seen

`443-census-static-reads-that-block-overrides.ts` found 55 candidate
reads across 14 production classes. Highest counts: BoundedListPopup
20, TasksDashboardOverview 9, BreadcrumbPicker 4, LinuxProcessSampler
4, PanelContentsList 4.

## Wanted

Walk the census with the three-rung ladder from the ivue skill. Rung 1
delete the static when nothing outside reads it. Rung 2
`this.constructor` when it is a live knob. Rung 3 name the class
directly when the fix is deliberate. State the rung per site. The
census only proves the read SHAPE, not that every site is wrong.

## Load-bearing constraint: convert a static by PAIR, never by site

USER-RAISED 2026-08-01, from `BreadcrumbPicker`:

```ts
identifier: $BreadcrumbPicker.PARENT_DIRECTORY_ITEM_IDENTIFIER,   // produces
item.identifier === $BreadcrumbPicker.PARENT_DIRECTORY_ITEM_IDENTIFIER // recognizes
```

A static is often both PRODUCED at one site and MATCHED at another.
While every read is pinned to the raw class, a subclass override is
ineffective but CONSISTENT. Convert one site to `this.constructor` and
leave its partner pinned, and a subclass produces items it can never
recognize. That failure carries no type error and no test error unless
a subclass exists. It is silent.

The rule: for each static, enumerate ALL its reads first. They move to
the same rung together, or none of them move. Report the read set per
static, not per line.
