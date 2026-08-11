# Brief 539-1 — retire the last four module-level variables

## In plain words

Four constants in PluginManifest.ts are the only module-level variables
left in src. Move them onto the class as cached static getters, update
the four call sites to read through `this.`, and if the vendors module
then counts zero, add it to the ratchet so it stays zero.

## The specification — follow it verbatim

[tmp/TASK-module-constants-to-statics.md](../../../../tmp/TASK-module-constants-to-statics.md)
is the complete spec: the exact `$`-getter shapes, the four call-site
edits (PluginManifest.ts:14/18/43/48 via `this.`), the safety analysis,
and the gate follow-through. Do not expand scope: if other vendors
violations remain after the conversion, LIST them in your report as
next-task candidates — do not chase them.

## The deliverable, twice

CODE: four `$`-cached static getters on $PluginManifest; four call sites
through `this.`; module-variable count for vendors drops by exactly 4;
if zero, `vendors` enters the converted-module set in
check-file-grammar.
VISUAL: no visible change (plugin admission behavior byte-identical).

## The bar

- Two-arm control per the spec: before trusting the zero, plant a module
  `const` in a converted module and confirm the checker still counts it;
  remove the plant.
- Plugin admission smokes green (they exercise all four constants).
- `bun scripts/check-file-grammar.ts` before and after — quote both
  counts in the report.
- `scripts/census.sh` discipline zeros unmoved.
- Full `bun test` green.

## Invariants in scope

- The ivue statics discipline (fundamentals: Static() anchor, `$`-cached
  getters promise stable identity, receiver-following reads) — this task
  IS an application of it; state conformance in the report.
- [plugins.invariants.md](../../../../src/modules/plugins/plugins.invariants.md)
  and any vendors-adjacent records — enumerate and answer; likely all
  untouched (no behavior change).

## Bycatch expected

Report per the taxonomy in [AGENTS.md](../../../../AGENTS.md), even when
None observed.
