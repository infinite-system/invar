# project.conventions.md — THE operative convention set (load-bearing infrastructure)

This file is the single canonical WHAT. `project.decisions.md` keeps the WHY/history. Every resume
loads this FIRST (`project.handoff.md` MUST-RE-READ position 1); every delegate packet embeds it mechanically
(`scripts/delegate-packet.sh`); the greppable rules run at every merge (`scripts/conventions-gate.sh`).
Change a convention → change it HERE (and note the why in decisions.md).

## Naming
- Every identifier is a FULL, spelled-out descriptive name. No abbreviations, ever, in all code:
  `editor` not `ed`, `workspace` not `ws`, `index` not `i`, `increment` not `inc`, `palette` not
  `pal`, `options` not `opts`, `direction` not `dir`. Nested loops use distinct real names
  (`rowIndex`/`columnIndex`). CHECK: conventions-gate grep.
- Prefer the full property path over a single-use alias local (`workspace.editor.save()`, not
  `const editor = workspace.editor` used once). A reused COMPUTED result may be stored, named for
  what it is.
- Do NOT rename ivue namespace tokens (`Class`, `$Class`, `Model`, `Instance`) or library APIs.
- Late-dependency getter members carry NO `Class` suffix: `get GitCommands() { return
  GitCommands.Class; }`.
- **Name the state a thing establishes, not the steps it takes.** Mechanism names rot into lies, and
  a descriptive name is TRUSTED, so a stale one is worse than an abbreviation — an abbreviation makes
  a reader look, a good name lets them assume. TEST: if the implementation changed tomorrow, would
  this name still be true? If not, it names the wrong thing.
- **A rename sweep lands ALONE, and lands first.** A convention rename is a semantic conflict factory:
  git merges it cleanly as text and the result does not compile. Never bundle a sweep with feature
  work, and gate it against LATEST main immediately rather than letting it age.

### Why explicit naming is load-bearing here (not style)
An explicit name removes a LOOKUP. Both humans and delegated agents read from a window, not from the
whole program: `elapsedMilliseconds` carries its unit and its derived-duration nature to every site
that mentions it, while `elapsed` or `dt` forces a trip to the definition — and a trip that gets
skipped becomes a guess. Names are the cheapest type annotation that survives into a `grep`.

The second-order effect is what the gates actually run on: consistent naming turns semantic
properties into SEARCHABLE SURFACE PATTERNS. `scripts/merge-gate.sh` distinguishes a measurement
from a wait by looking for a subtraction of two clock readings (`performance.now() -`), which only
works because every measuring site spells it the same way. `assertNoCompleteFrameEmittedFor` states
that it is an absence claim over an interval, and that name is what made the whole class visible;
`checkQuiet(600)` would have hidden it. Conventions are how a mechanical checker reaches a property
a mechanical checker should not be able to see.

## Class kinds & file shape (NEW-FILE RULE)
- The three namespace forms below govern *Public classes use the namespace pattern*
  (`project.invariants.md`). Circular-import safety is a separate late-read rule; even an acyclic
  class publishes through the same namespace seam.
- NEW FILE RULE: exported STATELESS behavior is born as `class $X { static … }` + `export namespace
  X { export const $Class = Static($X); export let Class = $Class; }` — never a bare
  `export function` bag. **The wrapper lives at the `$Class` ANCHOR, never at `Class`** — see the ivue
  statics section below. State: Reactive domain models via `Reactive($X)` (mutable `let Class`);
  plain classes for algorithms/resources. Legacy bare bags are converted by the scheduled item-9
  pass; new code NEVER adds more. CHECK: conventions-gate grep for `^export function` in
  `src/modules/**`.
- One class per `PascalCase.ts` file (ivue namespace pattern); role collections are
  `<module>.<role>.ts`. Docs are `project.<role>.md`. "ivue" is always lowercase.
- FILE-NAME-FOLLOWS-CONTENT: a file whose primary export is a `namespace X` backing a Static/Reactive
  class (`export const/let Class = Static($X)` / `Reactive($X)`) is named `X.ts` (PascalCase matching
  the namespace). A pure contract whose primary declaration is `export interface X` is named
  `X.interface.ts`; the suffix structurally declares the interface-only grammar and removes any
  maintained exemption list. A genuine role-collection of loose data/config with NO class stays
  `<module>.<role>.ts` (e.g. `keybindings.defaults.ts`). The filename tells you which shape is inside.
- ATOMIC-BIND (forgetting is made impossible, not discouraged): converting a bare-function module to a
  namespace+Static/Reactive class REQUIRES renaming the file to `<Namespace>.ts` in the SAME commit. A
  converted-but-not-renamed file is an INCOMPLETE conversion, not a smaller one. CHECK: conventions-gate
  hard-fails if any `src/modules/**/*.ts` exporting `namespace X { … Static(/Reactive( }` has filename
  ≠ `X.ts`.
- `$` = THE RAW/UNDERLYING FORM OF A PUBLIC SEAM MEMBER — one sigil, one meaning, at BOTH scopes: class
  level (`$Class` → `Class`) and member level (`$fuzzyScore` → `fuzzyScore`). A manifest member's
  backing function is the same name prefixed `$`: `function $fuzzyScore(…) {}` then
  `class $CommandScoring { static fuzzyScore = $fuzzyScore }`. `$name` is the full descriptive name with
  a semantic marker — NOT an abbreviation (the full-names rule still holds). Replaces the old
  `…Implementation` suffix. Rules: (a) `$name` functions are module-private by DEFAULT — export only if
  a subclass/other module needs the raw form (parallel to `$Class`); (b) manifest-shape only — a tiny
  inline-body capability needs no `$name` backing. CHECK: conventions-gate grep for the `…Implementation`
  suffix.
- STATIC GETTERS HAVE TWO ORTHOGONAL NAMING AXES: `$` says cached versus uncached; CASE says
  literal versus derived. A get-only static `$name` is computed once per receiving class by
  `Static()` and **NOT frozen** (ivue ≥ 2.2.1 — the `$` prefix promises stable identity per receiver
  and nothing more; 2.2.0's unconditional shallow freeze was a DEFECT that crashed
  `StatusChannel.$state` at boot, and mutable memo tables are legal and covered by upstream tests);
  a static getter without `$` stays live. Independently, a static
  getter whose only statement returns a literal or frozen literal composition and never reads
  `this` is `SCREAMING_SNAKE_CASE`; a getter that reads `this` or composes over another member is
  lower camel case. Instance getters remain lower camel case because a literal there is usually a
  per-instance knob. `$SCREAMING_SNAKE_CASE` is always invalid: a literal needs no cache. CHECK:
  `scripts/check-static-getter-naming.ts` in `scripts/conventions-gate.sh`.
- FILE GRAMMAR (applies to all new and edited code; AST enforcement is scheduled, the rule is
  not):
  1. **Sequence:** imports → `// invariant:` annotations → the EPONYMOUS declaration → exported
     types → end of file. Nothing else at module level. The eponymous declaration is the class
     the file is named for (namespace-pattern manifest included); in `X.interface.ts` it is
     `export interface X` — the seam itself. Interface files contain no classes or detached
     functions. Types are second-order citizens: they describe, the class or interface seam
     generates; TS type hoisting makes below-declaration types legal in its own signatures.
  2. **No detached behavior or data:** module-level helper functions become `protected` static
     or instance METHODS on the class (prototype methods — never arrow-function class fields,
     which bind per-instance and break `super` chains). Module-level constants (sentinels,
     regexes, tables) become **`protected static` GETTERS** — getters late-bind through the
     prototype so an override governs every use including the base's own; a shadowed readonly
     field does not. Expensive constructions use the `$`-prefixed cached-getter convention.
     The old `$name` backing-function shape collapses: the manifest member IS the method.
  3. **`protected` is the floor:** no `private` modifier, no `#fields` in `src/modules/**` —
     TypeScript `private` blocks subclass override exactly like detachment did (recorded
     invariant: *Construction goes through overridable seams*; everything must extend).
  4. **Tests are strictly colocated:** `Foo.test.ts` beside `Foo.ts`, never in `__tests__/`
     directories; PAIR-COMPLETENESS — every eponymous class file has its colocated test
     (`*.interface.ts` files are structurally exempt because they contain no behavior).
- BLAME HYGIENE: every grammar-only conversion commit is appended by full hash to `.git-blame-ignore-revs`; phase-2 waves extend the same list.
  Existing violations (~824 sites inventoried) are converted by the scheduled big-bang sweep;
  new code NEVER adds more. When editing a file the sweep has not reached yet, follow the new
  grammar for what you ADD; converting the rest of the file is optional, not required.
- Reactive state = ref-returning getters; cheap derived state = PLAIN getters (never `computed()`
  unless memoization is proven). Cross-module deps are read LATE (getters/method bodies) — never
  top-level `new`/snapshot. Owned constructions go through overridable `createX()` seams.
- `$stopEffects()` only on classes that OWN effects (it clears ref-getter state cells too).
- `Static` is imported from the ivue package subpath: `import { Static } from 'ivue/extras'` (ivue
  ≥ 2.2.1), never from `ivue` and never vendored.

## Interaction & state discipline
- One writer per scroll/animation regime per frame; a new authority (keyboard, thumb drag, jump)
  HALTS the previous one (adopt-and-stop). Wheel input feeds IMPULSES to momentum, never direct
  offset steps on a momentum-managed pane.
- A mouse event is consumed by exactly ONE handler path; renderer and hit-testers share the SAME
  row/geometry model (never parallel math).
- Scrollbar placement/visibility comes ONLY from `ScrollbarGeometry` (one source; explicit
  `visible` predicate; thickness from the explicit map — never layout read-back).
- Destructive operations (discard, delete, force) execute ONLY behind an explicit confirmation
  distinct from the triggering gesture.
- ALL key handling goes through the keybinding registry as DATA (intent-addressed bindings;
  chords as step lists; canonical floor + overlays + user layers). No inline chord conditionals.
  Advertised binding hints come from `effectiveBindings()` — never hand-written strings.

## Verification (authoritative channels)
- Quick UI sightings → `bun run drive` (scripts/harness/drive.md): ordered input flags with
  per-action completion waits, `--gesture` verbs, `--cells ROW,C1-C2` color dumps. One command
  before any bespoke probe file.
- Semantic state → the session's `status-<session>.json` (harness `field <session> <name>`);
  NEVER pane-scrape state. Visual → FrameProbe (`TUI_FRAME_DUMP=1`, 4 RGBA lanes/cell,
  frame-diff with a no-action control). Native caret → the PTY harness's cursor position from the
  emulator grid (historically tmux `#{cursor_x},#{cursor_y}`).
- Never pipe tsc through anything that masks the exit code: `bunx tsc --noEmit; echo TSC=$?`.
- Every feature lands with: unit tests for extractable logic + a live PTY-harness verification + (where
  visual) a FrameProbe assertion; regressions get a permanent smoke assertion.
- Destructive git verification runs in a SCRATCH repo under /tmp — never this repo's tree.
- Merge gate = tsc + `bun test` + smoke ALL-PASS + invariants checker `--all --refs` 0 problems +
  `scripts/conventions-gate.sh`.
- **Guard the CAPABILITY, not the version that usually implies it.** A dependency version is a
  PROXY for the behaviour code relies on, and a proxy can be satisfied while the behaviour is
  absent. Assert the behaviour directly: wrap a throwaway canary, exercise the property, require the
  result. Version-agnostic, so a flexible range or a locally `bun link`ed build still passes — a
  strict version comparison would lock a developer out of their own editor. Verified: ivue 2.1.0's
  `Static()` skips getters entirely (`if (typeof descriptor.value != "function") continue`), so a
  two-read identity probe returns false there and true on 2.2.1, while `package.json` said `^2.2.1`
  in both cases. State the CONSEQUENCE in the failure, not the symptom — "Static() is not caching
  $-getters, every cached table would recompute on every read; run bun install", never "version
  mismatch". Any guard that can refuse to start the app ships with a documented override.
- MEASURED ≠ ENFORCED: a check that only prints a verdict, or that runs on-demand, is not enforcement.
  Every INVARIANT must (a) BLOCK — assert with a non-zero exit on violation, never print-FAIL-and-
  exit-0 — and (b) ride the ALWAYS-RUN gate above, not a separate on-demand script. Corollary: pick
  the AUTHORITATIVE signal, not a cheap proxy that happens to pass. (Idle quiescence is the frame
  COUNTER holding at rest, in smoke — delta ≤ 1 over a few-second window, since the status-bar
  minute-clock is the ONE legitimate periodic wake and repaints exactly once per minute; a busy loop
  is dozens-to-hundreds of frames/window, so ≤1 cleanly separates them. Not idle CPU, which stays low
  even while the loop ticks because empty frames are cheap; a CPU-only spot check shipped a live idle
  loop as a false-green.)

### A population test DISCOVERS its population; it never enumerates it
When a contract holds over a POPULATION — every namespace, every registered smoke, every mark owner,
every settings descriptor, every `$`-getter — the test must FIND the members, not list them. A
hand-written list rots the moment someone adds a member, and a rotted list does not fail: it reports
green over a shrinking fraction of the population while still looking exhaustive. That is the same
defect as a smoke the gate never runs, one level up.

**The tell in review:** a test file that opens with N sibling imports of the very modules it is
asserting over. That is an enumeration wearing a test's clothes.

**The shape that works** (proven for the `$`-cache contract, detailed below): a cheap SOURCE SCAN
selects candidate files, the test imports only those, then it asks each subject STRUCTURALLY at
runtime (descriptors, registries, manifests) rather than against a literal list.

**And a discovery test needs a completeness guard, because discovery itself can silently under-find.**
Assert the discovered count against an INDEPENDENT count of the same population — and the guard's
source must not be the discovery mechanism itself. A guard that shares a blind spot with its subject
is not a guard: both agree at a wrong number and the suite is green. "Fail if zero" is too weak; a
walk that finds 4 of 36 also reports green.

### Where a check belongs: source text → script, runtime property → test
A check's HOME follows its SUBJECT, not convenience:
- **Subject is source text** (identifier shape, file layout, a forbidden syntactic form) → a script
  in `scripts/conventions-gate.sh`. Builders already run that gate in the inner loop — every task
  brief names it alongside `bunx tsc --noEmit` and `bun test` — so the early-feedback benefit is
  already present without relocating anything.
- **Subject is a runtime property** (does this value cache, does this method bind to its receiver,
  does this effect observe) → a test in `bun test`. Source text cannot answer these; you have to
  read the thing twice and compare.

Do NOT migrate source-text checkers into the test suite for earlier feedback. The timing is already
there via the brief instruction, and mixing them costs diagnosis: a red `bun test` should tell you
the app broke, not that a getter is misnamed.

## ivue statics: the ANCHOR RULE
**A class that declares static members publishes a wrapped anchor —
`const $Class = Static($X)` — and everything downstream stays as it was.**

```ts
export namespace GitCommands {            // statics-only capability class
  export const $Class = Static($GitCommands);
  export let Class = $Class;
}
export namespace Settings {               // statics + reactive instances
  export const $Class = Static($Settings);
  export let Class = Reactive($Class);    // in-place ⇒ Class === $Class initially
}
export namespace Editor {                 // no statics — unchanged
  export const $Class = $Editor;
  export let Class = Reactive($Class);
}
```
The deciding property is visible in the class body: **declares static members → wrap the anchor.**
Our tree already has the anchor slot (`export const $Class = $X;`), so this is a ONE-LINE change per
statics-bearing class — no renaming, no declaration churn.

- **`extends X.Class` is FORBIDDEN.** An `extends` clause is an eager snapshot of a mutable slot, so
  a child is pinned to whichever generation a kernel or prior test installed — load-order drift.
  Extend `$Class`, which is `const`. Enforced by grep in the conventions gate (source text).
- **A test double that only OVERRIDES needs no wrapper** — it extends an anchored `$Class` and
  inherits working static semantics bare. Only a double that DECLARES new transformable members
  wraps, at the installation line you already write: `X.Class = Static($RecordingX)` — the same slot
  where `X.Class = Reactive($MeasuredX)` already lives. Wrapping unconditionally is fine and costs
  nanoseconds; it is a HABIT, not a contract, and is deliberately not enforced (its violation on an
  override-only double is harmless).
- **`Static()` returns a NEW SUBCLASS** — not in-place, not idempotent. `instanceof` survives; class
  identity does not. Consequence: a wrapped double and its raw class name are TWO RECEIVERS WITH TWO
  CACHES, so reference an installed double through `X.Class`, never by its own name.

### The $-cache contract (a discovery test)
`$`-cache stability is a runtime property, so it rides `bun test`, and it asserts the PROPERTY (the
cache works) not the MECHANISM (was `Static()` applied) — wrapping is not reliably detectable at
runtime: no marker symbol, and `.name` is a minified wrapper. The shape:
1. **candidate files — broadest pattern**, `\bget \$` over non-test `src/**/*.ts`. Never assume the
   modifier list: `static override get $X` does NOT contain `static get $X`.
2. **import only those.** Importing all of `src` hangs — a module has a non-returning side effect.
3. **select with `Static()`'s own criterion** — from `Object.getOwnPropertyDescriptors`, `$`-prefixed
   names where `.get` is a function and `.set === undefined`. No second spec to drift.
4. **capture descriptors BEFORE reading** — a cached read installs an own value property that shadows
   the getter.
5. prefer `$Class` over `Class` per namespace; read each twice; assert `Object.is`.

Guards: the independent count (per the population rule above — count with `static[^(]*get \$`, NOT
the discovery pattern); non-empty; **and no primitive values**, since `'a' === 'a'` regardless of
caching makes the identity tell vacuous. Assert EVERY `$`-property, not one per class: wrapping fails
per-class, but `Static()` only transforms get-only accessors, so adding a setter to one silently stops
THAT ONE caching while its siblings keep working. Also assert zero INSTANCE `$`-getters — a real
convention question that must surface rather than vanish into a count mismatch.

Positive control is structural and free: a raw class and a `Reactive`-only class both fail the
identity assertion.

Because it asserts the property and not the mechanism, this test is green both before and after the
`Static()` migration (hand-rolled `defineProperty` caches satisfy it too). Write it FIRST, so it
ratchets a migration instead of describing whatever the migration produced.

**ES `#`-private is forbidden in capability classes.** A `Static()` class is a SUBCLASS of `$Class`
and a `#` name is keyed to its declaring class, so `this.#member` is REJECTED on the wrapped receiver
— not merely uncached. Use TS `private`/`protected` or module-scope state. A `static get #$FOO` is
additionally not a property, so no descriptor walk can see it. CHECK: `scripts/ast-query.ts
private-members` (already gate-resident); an AST query, not a grep, which would match `#` in comments
and strings.

## Retiring smoke files
- A retired smoke lives in `scripts/retired-smokes/`. Move it there with
  `git mv`, preserving its original basename. Do not append `.parked` or any
  other retirement suffix. One directory gives tooling one exclusion prefix
  and readers one place to inspect; preserving the basename keeps searches and
  `git log --follow` direct.
- Every retirement requires a `project.coverage-deltas.md` declaration keyed
  by the original live path. The declaration states why the smoke is retired,
  names its replacement coverage, and includes exact before/after counts when
  the coverage ratchet measures the file.
- Retired content is evidence, not a live contract. No live invariant record,
  script, smoke registration, or `project.*.md` file may cite a file beneath
  the retirement directory. `scripts/check-retired-smoke-references.sh`
  enforces this in the always-run conventions gate.
- Rejected alternative: delete retired files because Git preserves their
  content. That is technically sufficient for recoverability, unlike branch
  deletion, but the project chooses visibility: a retired smoke is often the
  starting point for its replacement, and a visible directory makes the debt
  countable without Git archaeology. This is a judgement call, not a
  technical necessity.

## Contracts (invariants)
- **A record lives WITH its domain, never in the root.** `src/modules/<domain>/<domain>.invariants.md`
  (and `.lattice.md` beside it); a record for a non-module domain lives in that domain's directory
  (`scripts/harness/harness.invariants.md`). The repo root is reserved for whole-repo `project.*`
  records — a domain record there is a misfile, not a variant. A domain that spans modules is
  anchored in the folder of its primary surface and keeps the domain's own name
  (`src/modules/ui/scroll.invariants.md` — the generator is `system/Momentum.ts`, the surface is ui).
- **Cite records by ROOT-RELATIVE path**, never by bare filename: `(src/modules/ui/ui.invariants.md)`.
  A bare name resolves only while the record happens to sit in the root, so it silently orphans the
  annotation the moment the record is filed correctly. `--refs` is the authority; it counts
  resolutions, so a moved record shows up as a drop in the total.
- Contract-first for new modules; records follow the /invariants schema (both section headings;
  Evidence + Impossible-if-true required; unnumbered declarative names; charset letters/digits/
  spaces/hyphens). Code that upholds a record carries `// invariant: <exact name> (<path>)`.
- Status is `provisional` until verified BY EXECUTION through an authoritative channel.
- **Seams before duplication or over-unification.** A shared behavior lives in ONE seam only where its
  *generator* is the same across consumers (`TextEditing` word-edits, the `*Backend` provider seams,
  `ScrollableTextViewport`); a new consumer WIRES IN, it does not re-implement. Split where features only
  resemble each other — the tell that a boundary is wrong is a consumer forced to suppress a seam's core
  (peripheral config is fine). Governs the *Seams are drawn at the shared generator* invariant
  (`project.invariants.md`).

## Git branch lifecycle
- Branches are NEVER deleted. Terminal states are MARKED: `finished/<branch>` tag (merged into main)
  or `retired/<branch>` tag (content never landed — superseded, unadopted, or a pre-rebase twin).
  (This line said `orphaned/` until 2026-07-30; the repo's actual tags — 32 `retired/*`, zero
  `orphaned/*` — and AGENTS.md rule 10 both use `retired/`. #327's builder caught the drift.)
  In-flight branches carry neither. Cleanup = worktree removal only. The tags are the greppable
  historical record (`git tag -l 'finished/*'`); the labels are the provenance. Canonical doctrine:
  the /conductor SKILL.md "terminal states" section.

## Delegation
- Every delegate packet is assembled MECHANICALLY by `scripts/delegate-packet.sh` — conventions +
  method essentials + target contracts + task spec. Never hand-assembled from memory.
- FRACTAL INHERITANCE: this applies RECURSIVELY down the spawn tree. ANY agent that spawns a
  sub-agent — coordinator, delegate, or a delegate's delegate — MUST assemble the sub-agent's prompt
  via `scripts/delegate-packet.sh`. Spawning a sub-agent without it is a convention violation. This is
  what makes convention-inheritance self-perpetuating: every clone, at every depth, is born with the
  same conventions + method + contracts because the ONLY sanctioned way to spawn carries them.
- Full-parity context, task-scoped: worktree-per-writer isolation; disjoint file sets where
  possible; NO conductor identity (delegates do the one task and stop); delegates never commit —
  the coordinator reviews (naming gate, contracts, verification evidence) and commits with credit.
- codex: never trusted with deletions; commit before delegating; review `git status` for
  unexpected removals.
- FLEET LIVENESS: while parallel workers run, keep `scripts/fleet-heartbeat.sh <worker>…` armed — the
  operational form of the *A notify channel cannot report its own silence* invariant. Completion-notify
  alone misses a silently-hung worker (one stalled 1.5h undetected); the heartbeat polls each worker's
  process-tree CPU and exits→notifies on STALL (kill+respawn) or all-done (verify+merge). CAP CONCURRENCY
  ~2-3 — over-parallelizing is what starves workers into the hang, and it also flakes driven gates
  (shared-CPU render timing / corrupted shared observability files). See `scripts/fleet-heartbeat.readme.md`.

## Self-handoff
- On ANY resume: read `project.requirements.md` FIRST (the persistent cross-cutting brief), then THIS
  file, then `project.progress.md` (USER PIPELINE + RESUME HERE), then `project.handoff.md`, then the
  contracts of whatever is in flight.
- Every turn-ending status carries: the COMPACTION line + `conventions @ <git hash of this file>`
  (drift made visible).
