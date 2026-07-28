# TASK — #125: the ivue statics cache migration, on the ANCHOR RULE

Work ONLY in `/tmp/conductor-statics221` (branch `refactor-ivue-statics-221`, cut off
latest main). Do NOT run `scripts/merge-gate.sh`; do NOT push/merge/tag/delete — the
conductor does that. Report to `/tmp/statics221-READY.md`.
`export PATH=$HOME/.bun/bin:$PATH`.

**This brief supersedes every earlier version.** A previous revision told you to convert
test doubles to `extends X.Class` and called it "safe as of 2.2.1". That is now
**FORBIDDEN** — see §2. If you find that instruction anywhere (in
`project.ivue-statics-migration.md`, in `tmp/static-cached-getters-2.2.0-brief.md`, or in a
parked branch), it is stale. This brief wins.

## Read these first, in this order

1. `/home/parallels/dev/tui-editor/tmp/anchor-rule-brief.md` — the settled convention from
   the ivue side. Authoritative on the contract.
2. `/home/parallels/dev/tui-editor/tmp/ivue-2.2.1-live-go-brief.md` — the action brief.
3. `/tmp/statics-READY.md` — a previous attempt's BLOCKED report against 2.2.0. Its
   *findings* are accepted. Its *site inventory is superseded* by §3 below, which was
   measured against current main. Do not re-derive either.

Pin **`^2.2.1`**, never `^2.2.0`. 2.2.0 is on the registry and carries two defects: frozen
`$`-caches (crashes `StatusChannel.$state`'s `Object.assign` at boot) and order-dependent
method binding.

The naming axis — SCREAMING_SNAKE literal getters, `scripts/check-static-getter-naming.ts`,
132 renames — **already landed** as `10fb2d0`. This task is the CACHE axis only.

## 1. The anchor rule

**A class that declares static members publishes a wrapped anchor —
`const $Class = Static($X)` — and everything downstream stays exactly as it is.**

```ts
// statics-only capability namespace
export namespace GitCommands {
  export const $Class = Static($GitCommands); // the anchor — wrap ONCE, here
  export let Class = $Class;
}

// statics + reactive instances
export namespace Settings {
  export const $Class = Static($Settings);
  export let Class = Reactive($Class); // Reactive is in-place ⇒ Class === $Class initially
  export type Instance = typeof Class.Instance;
}

// no statics — untouched, today's shape, today's numbers
export namespace Editor {
  export const $Class = $Editor;
  export let Class = Reactive($Class);
}
```

The deciding property is visible in the class body: **declares static members → wrap the
anchor.** `Static()` sits where there is something for it to transform.

**Our tree already has the anchor slot.** 228 files already write
`export const $Class = $X;` inside the namespace, with the raw class declared as
`class $X {}` above it. So for a statics-bearing class the change is **one line**:
`= $Momentum` → `= Static($Momentum)`. There is no class renaming and no declaration
churn. Verify this shape before you start — read `src/modules/system/Momentum.ts:359-362`.

## 2. `extends X.Class` is forbidden — and this is a ratchet, not a migration

An `extends` clause is an **eager snapshot of a mutable slot**. `Class` is the `let` that
kernels and test doubles reassign, so a child defined against it is pinned to whichever
generation happened to be installed at definition time — load-order drift, invisible until
a kernel installs in a different order.

Measured on current main: **0 occurrences of `extends X.Class`**, **63 of
`extends X.$Class`**. So nothing migrates. Downstream keeps extending `$Class` and now
inherits *working* static semantics bare, because the wrapper lives in the anchor.

This is only sound because of 2.2.1's per-receiver symbol discipline — a parent-first read
can no longer poison a child. Probed live against installed 2.2.1: child override wins
after a parent-first read.

## 3. The site census — MEASURED on current main, use these numbers

An earlier brief said "29 sites + 53 hand-rolls". Both are wrong for our tree. Actual:

| population | count |
|---|---:|
| classes declaring `$`-static getters | **36** |
| — already `Class = Static($X)` → move the wrapper up one line (no semantic change) | **22** |
| — `Class = Reactive($X)` → becomes `$Class = Static($X); Class = Reactive($Class)` | **9** |
| — `Class = $X` bare → becomes `$Class = Static($X); Class = $Class` | **5** |
| hand-rolled `Object.defineProperty(this, …)` blocks / files | **55 / 37** |
| `extends X.$Class` (unchanged) | 63 |
| `extends X.Class` (forbidden) | 0 |

Re-derive these counts yourself at the start and **quote your numbers in the report**. If
they disagree with the table, say so and trust your measurement — main moves.

**Nothing silently recomputes today.** All 36 hand-roll `Object.defineProperty(this, …)`,
which wins over the wrapper by defining an own property first. This migration is therefore
*optional cleanup that removes a hand-rolled mechanism*, not a bug fix. Do not describe it
as fixing a live defect.

## 4. The sweep

1. Bump `ivue` to `^2.2.1` in `package.json`; refresh `bun.lock`.
2. Route each of the 36 per §3's table.
3. **Delete every hand-rolled `Object.defineProperty(this, …)` self-replacement block**,
   keeping only the computation body (55 blocks, 37 files). Delete the `cache()` /
   `cachedSet()` helpers (`ThemePalettes`, `ThemeIcons`, `CompletionItemKinds`, `Settings`)
   and unwrap their uses. The public-delegate pattern
   (`static get atRest() { return this.$atRest; }`) needs **no** change.
4. Test doubles: a double that only **overrides** inherited members needs nothing — it
   extends an anchored `$Class` and works bare. See §6.

## 5. Enforcement: ONE test + ONE grep (see `project.conventions.md`)

A check's home follows its subject: **source text → script; runtime property → test.**
Do not migrate the existing conventions-gate checkers into the test suite — briefs already
instruct builders to run `scripts/conventions-gate.sh` in the inner loop, so the early
feedback exists, and mixing convention failures into `bun test` costs diagnosis.

### 5a. The `$`-cache contract — a TEST (`bun test`), not a checker

One test file. For each class declaring `$`-static getters (36 classes, 67 properties on
main), read each `$`-property **twice** and assert the two reads are the **same object**.

This asserts the PROPERTY (the cache works), not the MECHANISM (was `Static()` applied).
That matters: wrapping is **not** cleanly detectable at runtime — probed against installed
2.2.1, a wrapped class has **no marker symbol** (own symbols are `[]` until a read happens)
and its `.name` is `"r"`, a minified wrapper. Any mechanism-sniffing check would be
fragile; the identity assertion is mechanism-agnostic and survives ivue changing `Static`.

**IT MUST DISCOVER, NOT ENUMERATE.** No hand-written list of namespaces — a list rots, and a
rotted list reports green. Discovery is PROVEN to work; do not redesign it:

1. **Source-scan for candidate files** —
   `grep -rlE 'static get \$' src/ --include='*.ts' | grep -v '\.test\.ts$'` → 36 files.
2. **Dynamically `import()` only those**, and for each exported namespace object take
   `$Class` (preferring it over `Class`, so one class is not counted twice).
3. **Find the getters with `Static()`'s OWN criterion** — from
   `Object.getOwnPropertyDescriptors(theClass)`, take names starting with `$` where
   `descriptor.get` is a function and `descriptor.set === undefined`. Using the mechanism's
   own selection rule means there is no separate spec to drift from it.
4. Read each twice; assert identical.

**Capture descriptors BEFORE reading.** A cached read installs an own value property that
shadows the getter, so enumerate first, then read.

**Scan-then-import is load-bearing, not an optimisation.** Importing all of `src` to
discover classes HANGS — measured, killed at 120s; some module has a non-returning
module-level side effect. Narrow the import set first.

Measured on pre-migration main: **36 candidate files → 36 imported, 0 failed → 67
`$`-getters across 36 classes, 67/67 identity-stable, 0 primitive, 0.14s wall, 92MB RSS.**

**Write this test FIRST and confirm it is GREEN before you change anything.** All 67 already
cache today via the hand-rolled `Object.defineProperty` blocks, so a correct test is green
before AND after the sweep — that is the mechanism-agnostic property working. It therefore
acts as a ratchet ON the migration: if it reddens mid-sweep, your change broke caching.
Quote the before and after runs.

Three guards, all required:
- **fail unless the discovered getter count EQUALS the source-scan count** (67 vs 67 today).
  "Fail if zero" is too weak — a discovery walk that finds 4 of 36 also reports green. This
  is the guard that makes UNDER-DISCOVERY loud, and discovery rests on a grep, so a
  `$`-getter not written literally as `static get $` would otherwise vanish silently;
- **fail if it inspected ZERO classes** — a walk over an empty list reports green;
- **fail on any `$`-property whose value is a PRIMITIVE** — `'a' === 'a'` regardless of
  caching, so the identity tell would be vacuous. **Zero instances today** (0 of 65 typed
  returns are `string`/`number`/`boolean`; all return `WeakMap`/arrays/`ReadonlySet`/
  `Record`/`Map`/instances). The guard exists because the line that opens the hole —
  `static get $LABEL(): string` — looks harmless and the blindness is invisible.

**Assert every `$`-property, not one per class.** Two failure modes, different granularity:
wrapping fails per-CLASS (unwrapped anchor ⇒ none of its getters cache), but
not-being-transformed is per-PROPERTY — `Static()` only transforms **get-only** `$`-accessors,
so adding a setter to one, or making it a `static $field`, silently stops THAT ONE caching
while its class stays wrapped and its siblings keep working. Zero instances today (67
get-only, 0 setters, 0 `$`-fields). Iterating a class's own `$`-descriptors instead of
stopping at the first costs no extra code and is the only version that sees mode two.
**Be honest in your report:** for the 12 multi-getter classes those extra assertions are
redundant *today* — insurance against a specific one-line change, not 67 independent
contracts.

**Positive control is free and structural:** a raw (unwrapped) class and a `Reactive`-only
class both FAIL the identity assertion — probed and confirmed. Quote both reds.

### 5b. `extends X.Class` — a one-line GREP in `conventions-gate.sh`

Source text with no runtime signature, so it stays a script. 0 occurrences on main vs 63
`extends X.$Class` — a pure ratchet. Needs its own planted-violation control.

### 5c. Do NOT build

Any rule requiring test doubles to be `Static()`-wrapped, in any form. It **cannot** be a
test — doubles are defined inside `it()` bodies and vanish before a suite-level walk sees
them — and its violation is a slower test, not a broken app. A source-scanning version
would red `src/modules/app/AppLoader.test.ts`, which is correct as written (its doubles only
override), while catching nothing. Unconditional wrapping stays **guidance**.

## 6. `AppLoader.test.ts` is the positive control for 2.2.1's binding fix — do not "fix" it

`src/modules/app/AppLoader.test.ts:32,53` define `$Failing` / `$NoExit` extending
`AppLoader.$Class` and override `bootApp` / `exitProcess`. They install **bare**
(`AppLoader.Class = $NoExit`) and that is correct — they declare nothing new.

Today the test passes by plain prototype lookup, because `AppLoader.$Class` is unwrapped.
**After anchoring, it passes only if 2.2.1's per-receiver bound-method cache routes
`handleFatal` to the child's `exitProcess`** — line 61's `exits.push` is the observation.
So the test moves from incidentally-green to being the thing that fails if the binding
contract is wrong. If it wobbles, that is a finding about ivue, not a test to adjust.
Report it as such and stop.

## 7. Two facts probed against installed 2.2.1 — carry them, don't re-derive

- `Static()` returns a **new subclass**, not in-place: `Static(Static($X)) !== Static($X)`
  and `Static($Double) !== $Double`. **`instanceof` still holds** through the extra
  generation.
- Because caching is **per-receiver**, a wrapped double and its raw class name are **two
  receivers with two caches**: `X.Class.$MEMO !== $Double.$MEMO`, and a write through one
  is invisible via the other. This only bites a double that declares a **mutable** `$`-memo
  table and is read through both names. **Zero current instances** — all five install sites
  already reference through `X.Class`. Do not build an instrument for it; note it in
  `project.ivue-statics-migration.md` as a known shape.
- Guidance, not a gate rule: when you *do* wrap a double, wrapping unconditionally is fine
  and costs nanoseconds in test code. It is a habit, not a contract.

## 8. Cost — measured, and it is a non-issue here

| shape | ns/instance |
|---|---:|
| `Reactive($X)` — unchanged | 6.0 |
| `Reactive(Static($X))` — the anchor | 12.3 |
| anchor, 3-generation chain | 16.2 |

Paid only by statics-bearing classes that are **actually constructed** — the 9 in §3's
middle row: `Settings`, `SettingsPanel`, `LanguageClient`, `HoverCard`, `ShortcutHelp`,
`AgentSpinner`, `MarkdownPreview`, `MarkdownDocument`, `DiffView`. Every one is a
singleton, one-per-pane, or one-per-document (1–13 construction sites each). **Nothing
per-frame, nothing per-line**, so no hoisting question arises. Capability classes never
construct. Confirm this still holds and say so.

A warm `$`-cache read costs ~4–6 ns over a plain property. If you touch a per-frame path
anyway, hoist the guarded read into a local outside the loop and say why — the repo's
central invariant is that per-frame cost does not scale with document length
(`scroll.invariants.md`).

## 9. Acceptance — measurable, not judgement calls

- `grep -rn "Object.defineProperty(this" src` → **0**.
- `EditorWrap.test.ts` collapses from **40,001** fold-projection rebuilds to cached
  behaviour (it previously timed out). Quote before/after.
- `DiffView.test.ts` indexed reads return from **2,110** to **~1,055**. Quote both.
- **The app must BOOT — drive it.** The 2.2.0 attempt crashed `StatusChannel.update` at
  `Bootstrap` and a navigation-only drive missed it. **Open Settings** this time and confirm
  it lists its fields; that is where a zero-descriptor failure hides.
- Both new gate rules green, plus each one's planted-violation red quoted.

## Verification — quote exact exit codes, never read `$?` after a pipeline

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`,
`bun scripts/check-coverage-ratchet.ts`, `bun scripts/check-static-getter-naming.ts`
(clean **and** with each plant), plus the driven boot that opens Settings.

## Conflict plan

If merging main conflicts on a file this sweep transformed, resolve by taking **main's**
content and **re-running the transform** — never by hand-merging. Hand-resolving a
mechanical transform is how a codemod acquires invisible exceptions. Classify against the
merge **BASE**, not by picking a side. To see your own changes use
`git diff $(git merge-base origin/main HEAD)..HEAD` — plain `main..HEAD` shows main's newer
landings as phantom deletions.

Full descriptive identifier names (no abbreviations), 80 columns, ivue conventions. Commit
with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
