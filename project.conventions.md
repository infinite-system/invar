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

## Class kinds & file shape (NEW-FILE RULE)
- The three namespace forms below govern *Public classes use the namespace pattern*
  (`project.invariants.md`). Circular-import safety is a separate late-read rule; even an acyclic
  class publishes through the same namespace seam.
- NEW FILE RULE: exported STATELESS behavior is born as `class $X { static … }` + `export namespace
  X { export const $Class = $X; export const Class = Static($X); }` — never a bare
  `export function` bag. State: Reactive domain models via `Reactive($X)` (mutable `let Class`);
  plain classes for algorithms/resources. Legacy bare bags are converted by the scheduled item-9
  pass; new code NEVER adds more. CHECK: conventions-gate grep for `^export function` in
  `src/modules/**`.
- One class per `PascalCase.ts` file (ivue namespace pattern); role collections are
  `<module>.<role>.ts`. Docs are `project.<role>.md`. "ivue" is always lowercase.
- FILE-NAME-FOLLOWS-CONTENT: a file whose primary export is a `namespace X` backing a Static/Reactive
  class (`export const/let Class = Static($X)` / `Reactive($X)`) is named `X.ts` (PascalCase matching
  the namespace). A genuine role-collection of loose data/config with NO class stays
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
- ~~MANIFEST-ON-TOP~~ **SUPERSEDED (2026-07-24) by FILE GRAMMAR below.** The old layout kept
  `$name` implementations as module-level function declarations below the manifest (hoisting made
  it safe). Retired by user adjudication: detached functions are invisible to BOTH governing
  systems — not on the seam (not overridable/stubbable/fork-reachable) and not on a `Reactive()`
  prototype (can never join the graph). One grammar replaces two.
- FILE GRAMMAR (2026-07-24, user-adjudicated; the AST checker enforcing it arrives with the
  scheduled grammar sweep — the LAW applies to all NEW/EDITED code NOW, ahead of enforcement):
  1. **Sequence:** imports → `// invariant:` annotations → the EPONYMOUS declaration → exported
     types → end of file. Nothing else at module level. The eponymous declaration is the class
     the file is named for (namespace-pattern manifest included); in the enumerated
     contract-interface files (AgentBackend, TtsBackend, PaneContent, TerminalBackend,
     LanguageProvider, AgentEvents) it is the eponymous INTERFACE — the seam itself. Types are
     second-order citizens: they describe, the class generates; TS type hoisting makes
     below-class types legal even in the class's own signatures.
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
     (explicit enumerated exemptions only, e.g. pure contract-interface files).
  Existing violations (~824 sites inventoried) are converted by the scheduled big-bang sweep;
  new code NEVER adds more. When editing a file the sweep has not reached yet, follow the new
  grammar for what you ADD; converting the rest of the file is optional, not required.
- Reactive state = ref-returning getters; cheap derived state = PLAIN getters (never `computed()`
  unless memoization is proven). Cross-module deps are read LATE (getters/method bodies) — never
  top-level `new`/snapshot. Owned constructions go through overridable `createX()` seams.
- `$stopEffects()` only on classes that OWN effects (it clears ref-getter state cells too).
- `Static` is imported from the ivue package subpath: `import { Static } from 'ivue/extras'` (ivue
  ≥ 2.1.0). This keeps the primary `ivue` entry at its ~1.1kb hero size; `Static` (~0.28kb) ships via
  the `./extras` subpath. There is NO vendored copy — the old `src/modules/system/Static.ts` was
  deleted when the migration completed.

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
- Semantic state → the session's `status-<session>.json` (harness `field <session> <name>`);
  NEVER pane-scrape state. Visual → FrameProbe (`TUI_FRAME_DUMP=1`, 4 RGBA lanes/cell,
  frame-diff with a no-action control). Native caret → tmux `#{cursor_x},#{cursor_y}`.
- Never pipe tsc through anything that masks the exit code: `bunx tsc --noEmit; echo TSC=$?`.
- Every feature lands with: unit tests for extractable logic + a live tmux verification + (where
  visual) a FrameProbe assertion; regressions get a permanent smoke assertion.
- Destructive git verification runs in a SCRATCH repo under /tmp — never this repo's tree.
- Merge gate = tsc + `bun test` + smoke ALL-PASS + invariants checker `--all --refs` 0 problems +
  `scripts/conventions-gate.sh`.
- MEASURED ≠ ENFORCED: a check that only prints a verdict, or that runs on-demand, is not enforcement.
  Every INVARIANT must (a) BLOCK — assert with a non-zero exit on violation, never print-FAIL-and-
  exit-0 — and (b) ride the ALWAYS-RUN gate above, not a separate on-demand script. Corollary: pick
  the AUTHORITATIVE signal, not a cheap proxy that happens to pass. (Idle quiescence is the frame
  COUNTER holding at rest, in smoke — delta ≤ 1 over a few-second window, since the status-bar
  minute-clock is the ONE legitimate periodic wake and repaints exactly once per minute; a busy loop
  is dozens-to-hundreds of frames/window, so ≤1 cleanly separates them. Not idle CPU, which stays low
  even while the loop ticks because empty frames are cheap; a CPU-only spot check shipped a live idle
  loop as a false-green.)

## Contracts (invariants)
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
  or `orphaned/<branch>` tag (content never landed — superseded, unadopted, or a pre-rebase twin).
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
