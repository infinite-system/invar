# READY — static-cache population discovery

Branch: `refactor-ivue-statics-221`

Commit: `5f22cd8614f7fdd7daba9a2ba26d134435af3cfa`

## Outcome

- Replaced the 36-entry hand-written namespace list in
  `StaticCacheContract.test.ts` with a broad `\bget \$` source scan over
  non-test `src/**/*.ts`.
- Imported only the candidate files, preferred namespace `$Class` over
  `Class`, captured own descriptors before any reads, and selected get-only
  `$` accessors with `Static()`'s descriptor criterion.
- Kept the non-empty and non-primitive guards, read every discovered getter
  twice with `Object.is`, and guarded the discovered count against the
  independent `static[^(]*get \$` source count.
- Added the explicit zero-instance-`$`-getter assertion by requiring the broad
  source count to equal the independent static count.
- Added `hash-private-members` to `scripts/ast-query.ts` and made its
  zero-count census an always-run `scripts/conventions-gate.sh` step.
- Left `src/modules/app/AppLoader.test.ts` untouched.

This is the requested scope completion. It does not change application
behavior or repair a defect in round 1.

## Discovered population

The adapted reference probe and the committed contract agree:

```text
candidate files from source scan: 36
imported 36, failed 0
DISCOVERED 67 $-getters across 36 classes
  identity-stable: 67   NOT stable: 0   primitive: 0
```

The independent guard reports:

```text
SOURCE_GETTERS=67 INDEPENDENT_STATIC_GETTERS=67
```

Therefore the runtime discovery found 67 getters, the independent source
guard counted 67 static getters, and the zero-instance guard found no
remainder.

The focused committed contract completed in 0.17 seconds with 97,024 KB
maximum RSS. The adapted reference probe completed in 0.13 seconds with
91,648 KB maximum RSS. This is acceptable for `bun test`; the full 251-file
suite completed in 11.73 seconds.

## No hand-written namespace population

The complete import block is:

```ts
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Reactive } from 'ivue';
```

There are no sibling namespace imports and no maintained namespace list.

## Positive controls

Raw class control — exit 1:

```text
+ [
+   "RawPositiveControl.$value did not preserve identity across two reads",
+ ]
RAW_CONTROL_EXIT=1
```

Reactive-only class control — exit 1:

```text
+ [
+   "ReactivePositiveControl.$value did not preserve identity across two reads",
+ ]
REACTIVE_CONTROL_EXIT=1
```

Mutable inheritance anchor plant — conventions gate exit 1:

```text
CONVENTIONS FAIL: extends uses a mutable Class slot — extend the immutable $Class anchor:
src/modules/app/AppLoader.test.ts:72:  class MutableAnchorPositiveControl extends AppLoader.Class {}
PLANTED_CONVENTIONS_GATE_EXIT=1
```

Native hash-private plant — exit 1:

```text
src/modules/system/Momentum.ts:18  #hashPrivatePositiveControl
ast-query hash-private-members: 1 match(es)
HASH_PRIVATE_CONTROL_EXIT=1
```

The same planted conventions-gate run also emitted:

```text
CONVENTIONS FAIL: #private member prevents Static() subclass access
```

All plants were removed before the committed verification pass.

## Verification

All commands ran against commit `5f22cd8`:

| Command | Exit | Result |
| --- | ---: | --- |
| `bunx tsc --noEmit` | 0 | clean |
| `bun test` | 0 | 1,668 pass, 0 fail, 67,512 expectations |
| `bash scripts/conventions-gate.sh` | 0 | hash-private census 0; gate PASS |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` | 0 | 0 problems; 883 annotations and 67 lattice links resolved |
| `bun scripts/check-coverage-ratchet.ts` | 0 | 311 files; no undeclared decrease |

The coverage ratchet reports
`StaticCacheContract.test.ts: 6 assertions / 2 waits -> 10 assertions / 2 waits`.

The implicated root namespace contract and system capability contract are
upheld and strengthened: population membership is now discovered, the
runtime property remains tested, and native hash-private syntax is rejected
by an AST gate. There were no invariant downgrades.

Scale-fixture driving is not applicable: this change touches a tree-wide
source/runtime population contract and a syntax census, not a per-row,
per-item, per-frame, or user-visible application path.

## Bycatch

None observed.
