# Task #443 — a self-reference getter defeats static overriding

Priority: architecture-hygiene
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high
State: COMPLETED — 3d9fdca6 — Six classes cleaned; five deleted their statics outright. Bycatch became #448 (55-site census) and the Drive.ts type error the conductor had introduced.

## What

Six UI classes read their own static constants through a self-reference
getter:

```ts
protected get Tooltip() {
  return Tooltip.Class as unknown as typeof $Tooltip;
}
public static get TOOLTIP_DWELL_SECONDS() { return 0.4; }
protected get tooltipDwellSeconds() {
  return this.Tooltip.TOOLTIP_DWELL_SECONDS;
}
```

`Reactive(X) === X`, so `Tooltip.Class` is the base class itself. A
subclass instance therefore reads the BASE static, never its own.

Conductor measurement (2026-08-01, subclass overriding the static
with 0.1):

- `this.constructor` read: 0.1 — the override is honored.
- the current pattern:    0.4 — the override is ignored.
- base instance through `this.constructor`: 0.4, correct, because the
  engine constructor inherits `$Class`.

The ivue skill states that non-`$` static getters stay live because
they are the knobs test subclasses pinch. This pattern welds them
shut, at the cost of a double cast and two extra members.

## Sites

`src/modules/ui/`: Tooltip.ts, ShortcutHelp.ts, ContextMenu.ts,
HoverCard.ts, PanelHost.ts, OverlayCoordinator.ts.

## Wanted

Apply the reduction ladder now recorded in the ivue skill, per site,
with the choice stated. Positive control: a subclass that overrides
one static must change the observed behavior; plant it and see it go
red before the fix.
