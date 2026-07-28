# TASK — ivue 2.2.0 $-cached statics migration + SCREAMING_SNAKE literal getters (#125, SOLO)

Builder on Invar. Work ONLY in `/tmp/conductor-statics` (branch `refactor-ivue-statics`, forked
from latest LOCAL `main`). You have the machine to yourself — no other builder is running, because
this touches every module. No merge-gate, no push/tag/delete. Report to `/tmp/statics-READY.md`.
`export PATH=$HOME/.bun/bin:$PATH`.

READ FIRST: `tmp/static-cached-getters-2.2.0-brief.md` in the repo root (gitignored but present).
It is the ivue author's handoff and contains the shipped semantics.

## PASS A — migrate to ivue 2.2.0's formalized `$`-cached statics

The codebase hand-rolled a memoized-static idiom **56 times across 37 files**:

```ts
protected static get $atRest(): X {
  const value = { ... };
  Object.defineProperty(this, '$atRest', { configurable: true, value });
  return value;
}
```

ivue 2.2.0 formalizes it: `Static()` scans own static get-only accessors whose name starts with `$`
and replaces each with an order-correct caching getter keyed on
`Symbol.for('ivue.staticCache.<name>')`, guarded by `Object.hasOwn`. The hand-rolled form is
ORDER-DEPENDENT under inheritance — if the parent reads first, its own data property shadows the
chain and a subclass override of any input is silently ignored. That hole is real here because
`extend $Class` for test doubles is a first-class idiom.

Work:
1. `bun install` after bumping `ivue` `^2.1.0` -> `^2.2.0` in package.json (the bump RIDES WITH
   THIS TASK — the user deferred it here deliberately).
2. Delete every `Object.defineProperty(this, …)` self-replacement block; keep only the computation
   body. ACCEPTANCE: `grep -rn "Object.defineProperty(this" src` returns ZERO.
3. **The freeze is UNCONDITIONAL in 2.2.0** (not dev-only). Any site that MUTATES a cached static
   will now throw in production. **REPORT every such site; do NOT work around it** by cloning,
   dropping the `$`, or re-rolling the cache. That list is a finding.
4. 2.2.0's brief also flags that `Static()`'s lazy METHOD binding has the same order-dependence hole
   one topology over. Check whether 2.2.0 closed it; if not, report — do not patch locally.

## PASS B — SCREAMING_SNAKE for literal-valued static getters

USER: the const-vs-derived distinction blurred when module `const SOMETHING = 50` became
`static get something()`. At a call site `this.openers` and `this.visibleRowCount` look identical,
and only one can change under you.

THE RULE (must be machine-checked or it decays again — it already did once):
- A static getter whose body is a single `return` of a LITERAL (or frozen literal composition) AND
  which never reads `this` MUST be SCREAMING_SNAKE_CASE (`OPENERS`, `PARTNERS`, `CLOSERS`).
- A static getter that reads `this` or composes over other members MUST NOT be (`atRest`,
  `canonicalBindings`).
- STATICS ONLY. On instances a literal getter is usually a per-instance knob; uppercase would lie.
- `$SCREAMING_CASE` is ALWAYS an error — `$` means cached, a literal needs no cache. Free second
  check.

Recorded so it is not re-litigated: uppercase survives the overridability objection because
override is a DESIGN-TIME act by a subclass author, not runtime mutation — the value is constant
within a given class, which is exactly what the subclass-for-tests pattern relies on. `DEFAULT_`
camel prefix was considered and rejected (honest but wordier, scans worse in dense files).

Work: add the AST check to `scripts/conventions-gate.sh` (decide from the AST: does the body read
`this`? is it a literal?), sweep the sites, and record the convention in the conventions doc
alongside the `$` sigil — stating both axes explicitly: **`$` = cached vs uncached; CASE = literal
vs derived; they are orthogonal.**
POSITIVE CONTROL REQUIRED: plant a violation, run the gate, quote the red, remove it.

## Verification

Full checker suite; `bun test`; conventions gate; invariant checker `--all --refs`; coverage
ratchet; behavioral contracts ONCE. Exact exit codes. Report: site count before/after, every
mutating-cached-static site found in Pass A, the Pass B positive-control red, and any site where
the two passes disagreed about what a getter is.

Drive-first per AGENTS.md Rule Zero where behaviour is observable. Bycatch rules apply. Full
descriptive names, 80 cols. Commit `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`;
clean tree.
