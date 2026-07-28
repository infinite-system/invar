# TASK — #130 round 2: make the $-cache contract DISCOVER its population

Work ONLY in `/tmp/conductor-statics221` (branch `refactor-ivue-statics-221`, on top of
`f124d44`). Do NOT run `scripts/merge-gate.sh`; do NOT push/merge/tag/delete.
Report to `/tmp/statics-discovery-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`.

## Why there is a round 2 — my error, not yours

Round 1 delivered `src/modules/system/StaticCacheContract.test.ts` and it is CORRECT today.
But it opens with **36 explicit namespace imports**, and round 1's brief did not tell you
otherwise — the discovery requirement was added to the brief after you had already read it.
So this is a scope completion, not a defect report. Round 1's guards, positive controls, and
the decision to leave `AppLoader.test.ts` alone were all right and stay.

**The rule, now in `project.conventions.md` ("A population test DISCOVERS its population"):**
a hand-written list rots the moment someone adds a member, and a rotted list does not fail —
it reports green over a shrinking fraction of the population while still looking exhaustive.
The tell is exactly what round 1 produced: a test file opening with N sibling imports of the
modules it asserts over.

## The conversion

**Working reference implementation: `/tmp/REFERENCE-discovery-test.ts`.** It runs, and on
pre-migration main it printed `36 candidate files → 36 imported, 0 failed → 67 $-getters
across 36 classes, 67/67 identity-stable, 0 primitive, 0.14s wall, 92MB RSS`. Adapt it; do
not redesign it.

1. **Candidate FILE scan — use the BROADEST pattern**: `\bget \$` over `src/**/*.ts`,
   excluding `*.test.ts`. It makes NO assumption about modifiers or their order. This matters:
   `static override get $X` does **not** contain the substring `static get $X`, so the strict
   pattern silently drops it (measured: 67 strict vs 72 permissive across the tree; all 5
   misses are in test doubles today, so non-test `src/` agrees at 67 by luck, not by
   construction). The broadest pattern selects the same 36 files today at no cost.
2. **Import only those.** Importing all of `src` to discover classes **HANGS** — measured,
   killed at 120s; some module has a non-returning module-level side effect. Scan-then-import
   is load-bearing, not an optimisation.
3. **Select getters with `Static()`'s OWN criterion** — from
   `Object.getOwnPropertyDescriptors(theClass)`, names starting with `$` where
   `descriptor.get` is a function and `descriptor.set === undefined`. Reusing the mechanism's
   selection rule means there is no second spec to drift from it.
4. **Capture descriptors BEFORE reading** — a cached read installs an own value property that
   shadows the getter.
5. Prefer `$Class` over `Class` per namespace so one class is not counted twice.
6. Read each twice; assert `Object.is` identity.

## The three guards — keep round 1's two, fix the third

Round 1 has fail-on-empty-list and fail-on-primitive. Both stay. The completeness guard is
the one to get right:

**Guard the count against an INDEPENDENT source count — NOT the discovery pattern.**
- discovery selects candidate FILES with the broadest `\bget \$`;
- the guard COUNTS with static-permissive `static[^(]*get \$` — what discovery *should* find.

Why they must differ: a guard that shares a blind spot with its subject is not a guard. Both
would agree at a wrong number and the suite would be green. (I made exactly this mistake
while specifying it.) "Fail if zero" is too weak on its own — a walk that finds 4 of 36 also
reports green.

**Plus a third assertion: zero instance `$`-getters.** Every `\bget \$` in non-test `src/`
must also match the static-permissive pattern (67 == 67 today). An instance `$`-getter is a
real convention question and must surface rather than vanish into a count mismatch.

## Also in scope: the #private ban, using the tool we already have

`project.conventions.md` now bans ES `#`-private in capability classes. The mechanism, which
PRE-EXISTED as the "`Static()` `#private` caveat" in `project.skill-upgrades.md`: a `Static()`
class is a SUBCLASS of `$Class`, and a `#` name is keyed to its declaring class, so
`this.#member` is **rejected on the wrapped receiver** — not merely uncached. A
`static get #$FOO` is additionally not a property at all, so no descriptor walk can see it and
the discovery test is structurally blind to it.

**Enforce with `scripts/ast-query.ts private-members`, NOT a grep.** That query already exists
and covers `private` + `#private`, and `ast-query.ts` is already gate-resident —
`conventions-gate.sh` runs its `text-input-census --require-zero`. Add a `#private`-only
`--require-zero` mode in the same style. An AST query is strictly correct here where grep is
not: grep matches `#` inside comments and strings. Currently 0 files use `#` members, so this
is a ratchet — which means it needs a **planted violation** to prove it can go red.

## Preserve from round 1

- The two positive controls that already exit 1 (raw class and `Reactive`-only class each
  failing the identity assertion). Re-quote both after the conversion.
- `extends X.Class` source ratchet and its planted-violation red.
- `AppLoader.test.ts` untouched — its `$Failing`/`$NoExit` doubles only OVERRIDE, so bare
  installation is correct, and with the anchor in place their passing assertions are now the
  live probe for 2.2.1's per-receiver method binding. **If it wobbles, that is a finding about
  ivue — report it, do not adjust the test.**

## Report these numbers explicitly

- candidate files found / imported / failed;
- discovered getter count vs the independent guard count (expect 67 == 67 across 36 classes);
- wall time and whether it is acceptable for `bun test` (reference: 0.14s, 92MB);
- the reds from: raw control, Reactive control, planted `extends X.Class`, planted `#private`;
- confirm the test file contains **no hand-written namespace list** and quote its import block.

## Verification — quote exact exit codes, never read `$?` after a pipeline

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`,
`bun scripts/check-coverage-ratchet.ts`, plus each planted control.

Full descriptive identifier names, 80 columns, ivue conventions. Commit with
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
