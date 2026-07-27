# ivue 2.2.1 static-cache migration

> **TRACKED, PERMANENT (updated 2026-07-27).** This document records the active
> ivue static-cache contract used by Invar. It supersedes the original 2.2.0
> handoff that occupied this path.

## Active contract

Invar requires `"ivue": "^2.2.1"`. Version 2.2.0 must not be used: its
static caches were shallow-frozen, which made the mutable
`StatusChannel.$state` crash at boot, and its bound-method cache was
order-dependent under inheritance. Version 2.2.1 promises stable identity per
receiver without freezing the cached value and uses per-receiver symbols for
both cache values and bound methods.

A class that declares static members wraps its immutable anchor once:

```ts
export namespace Capability {
  export const $Class = Static($Capability);
  export let Class = $Class;
}

export namespace ReactiveModel {
  export const $Class = Static($ReactiveModel);
  export let Class = Reactive($Class);
}
```

Classes without statics retain a raw anchor. Downstream specializations extend
`X.$Class`; `extends X.Class` is forbidden because `Class` is a mutable
selection slot and an extends clause snapshots it eagerly.

Get-only static accessors named `$name` cache once per receiving class.
Non-`$` accessors remain live, and `$` accessors with a setter are not
transformed. The public-delegate form remains valid:
`static get value() { return this.$value; }`.

## Test-double guidance and the two-receiver shape

A double that only overrides inherited members needs no additional wrapper:
it extends the anchored `$Class`, installs bare in `X.Class`, and inherits
working per-receiver cache and method-binding behavior. A double that declares
new transformable members is processed at installation:
`X.Class = Static($RecordingX)`.

`Static()` returns a new subclass rather than transforming in place. A wrapped
double and its raw class name are therefore two receivers with two independent
caches:

```ts
X.Class = Static($Double);
X.Class.$MEMO !== $Double.$MEMO;
```

A mutation through one receiver is not visible through the other. When a
wrapped double declares a mutable `$` memo table, read it through the installed
`X.Class` slot consistently. Current Invar doubles do not exercise the
two-receiver mutable-memo shape.

## Cost and enforcement

The measured construction cost is approximately 6.0 ns for `Reactive($X)`,
12.3 ns for `Reactive(Static($X))`, and 16.2 ns for a three-generation anchor
chain. Invar pays the extra construction only for statics-bearing models that
are singleton, per-pane, or per-document objects; no per-frame or per-line
construction path uses it. A warm `$` read costs about 4–6 ns over a plain
property, so a genuinely hot loop should hoist the guarded read.

Runtime enforcement lives in `bun test`: every declared `$` static accessor is
read twice and must return the same non-primitive object. Source enforcement
lives in `scripts/conventions-gate.sh`: `extends X.Class` is rejected.
