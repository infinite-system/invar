# Decisions

Architecture decisions, grounded in the ivue documentation study (delegated, reviewed against
`../ivue` source + a headless smoke test — see `project.delegation-log.md` #1). The brief mandates
documenting these; each cites the ivue page that informed it. ivue docs live at
`../ivue/docs_v2/{guide,examples}/`.

## Runtime & setup corrections (caught in the study)

- **D0.1 — Install `vue`, not just `@vue/reactivity`.** ivue's public API is one function,
  `Reactive()`, and it imports `watch`/`watchEffect`/`effectScope` from `vue` at runtime
  (peerDep `vue ^3.2.0`). The reactivity core is DOM-free and runs headless under Bun — proven
  by `scripts/ivue-smoke.ts` (`{count:2,double:4,observed:4,ok:true}`). Source: `lib/Reactive.ts`,
  `guide/getting-started.md#install`.
- **D0.2 — Vendor `Static()` and the kernel.** Neither ships in the `ivue` package. `Static()`
  is `experiments/node-namespace/Static.ts`; the extensible kernel is example code
  (`examples/playground/src/examples/extensible-kernel/kernel.ts`). We copy both into the app
  (`system`/`kernel` modules) rather than import from `ivue`. Source: `guide/node-static-runtime.md`.
- **D0.3 — `createX()` is our convention, not an ivue feature.** ivue's real construction seam
  is the mutable `namespace.Class` slot + owner-constructs-child; the brief's `createX()` factory
  idiom is an app convention (an overridable method), documented as such in
  *Construction goes through overridable seams*.

## The ten mandated architecture decisions

1. **Durable state uses ivue Reactive domain classes.** Observable, identity-bearing, disposable
   models (`App`, `Workspace`, `Buffer`, `Editor`, `GitRepository`, …) are `class $X {}` +
   `namespace X { const $Class; let Class = Reactive($Class) }`. `Reactive()` transforms in place
   and rewrites getters to lazy cells. Source: `guide/getting-started.md`, `guide/modules.md`.
2. **High-cardinality data uses compact storage + flyweight views.** Columnar typed arrays / plain
   Maps hold ground truth; disposable per-render facades (three fields: owner+row+col) expose it;
   a two-tier sparse revision overlay (fine per-item + coarse per-block refs) drives reactivity;
   explicit eviction releases cold overlays. Measured 4.7 bytes/cell at 20M cells. Source:
   `guide/flyweight.md`, `examples/flyweight-grid/model/`.
3. **Cheap derived values are plain getters, not `computed()`.** A plain getter lives once on the
   prototype (0 bytes/instance) and is reactive via leaf-ref subscription at any depth; `computed()`
   (~300 bytes/instance observed) is a surgical opt-in for expensive recompute, render-suppression,
   or stable ref identity. Aim nearly-computed-free. Source: `guide/state.md`, `guide/computed-watch.md`.
4. **Effects are owned and disposed explicitly for outliving instances.** `Reactive()` injects
   `$watch`/`$watchEffect`/`$stopEffects`; the effect scope is a lazily-allocated detached
   `effectScope`. Component-lifetime instances use plain `watch`/`onUnmounted`; app-root/store
   instances use `this.$watch` and an owner calls `$stopEffects()`. ivue calls no user hooks ever.
   Source: `guide/lifecycle-teardown.md`, `lib/Reactive.ts`.
5. **Namespace `Class` bindings are the replaceable extension seam.** `const $Class` is the raw
   `extends` root; `let Class` is the mutable selection slot every consumer reads (`new X.Class()`).
   A plugin/kernel swaps the slot at boot. Never snapshot it (`const C = X.Class` loses later
   selection). Source: `guide/namespace-pattern.md`, `guide/modules.md`.
6. **The extensible kernel composes the class graph before construction.** `defineClass` captures
   inheritance; `registerClass` queues `(Base)=>class extends Base{}` factories; `sealClassGraph`
   topologically composes, reparents descendants onto composed parents, applies `Reactive()`/`Static()`,
   replaces `Class` bindings, and seals. Post-seal construction is native `new`. Source:
   `examples/extensible-kernel.md`, `examples/.../extensible-kernel/kernel.ts`.
7. **Plain classes and static capabilities stay distinct from reactive models.** Plain stateful
   classes (`PieceTable`, `LineIndex`, `LspTransport`, `TreeSitterParser`) own algorithms/resources
   with no reactivity; `Static()` capability classes (`Files`, `GitCommands`, `Paths`) are
   allocation-free function bags with `super` + replaceable slot. Reactive models bridge engines via
   small revision refs. Source: `guide/node-static-runtime.md`, `guide/namespace-pattern.md`.
8. **Late dependency reads avoid circular-init failure.** Every cross-module reference sits in a
   getter/method body (`static get Dep() { return Dep.Class }`); the namespace compiles to a hoisted
   `var`, safe to hold from module-eval. No top-level `new`, no snapshot, no `export default X.Class`.
   Source: `guide/modules.md#circular-references-resolve-by-construction`.
9. **Inactive workspaces/panes/buffers/parsers/LSP are cooled or disposed, not hidden.** The
   `$stopEffects()` deactivate/reactivate cycle windows reactivity over a retained model; durable
   truth lives outside the overlay; re-arm watchers in an `activate()` method (not the constructor).
   Keyed overlays never self-GC → explicit eviction (`evictOutsideRows`-style). Source:
   `guide/lifecycle-teardown.md`, `guide/flyweight.md`.
10. **ivue patterns used directly vs adapted for OpenTUI/Bun.** Used directly: Reactive models,
    plain getters, the namespace pattern, `$watch`/`$stopEffects`, flyweight + eviction, late reads.
    Adapted: `Static()` + kernel are vendored (not packaged); HMR is dev-by-restart (no hot runtime
    for a Bun process); the single "render effect" is the OpenTUI frame effect calling
    `requestRender()`, pulling the visible window. Source: `guide/node-static-runtime.md`,
    `guide/node-class-hmr.md`, `guide/hmr.md`.

## Correction noted for contracts

`guide/principles.md` still references an "optional `stopEffects()` hook" — that hook was removed;
`lib/Reactive.ts` (no hooks at all) is authoritative. `LESSONS.md` confirms "ivue auto-calls NOTHING."

## Pending simplifications (post-gate — do NOT act until the §5.1 gate is green)

### D-S1 — Drop the redundant `Class` suffix from member NAMES (keep `.Class` in bodies)

**Correction (2026-07-21):** an earlier framing (collapse the namespace triad / drop `.Class` from
call sites) was a MISREAD and is withdrawn. **`.Class` stays everywhere** — it is the mutable
composition seam the kernel composes and tests swap (load-bearing for *Construction goes through
overridable seams* and *The app is built only after the kernel is sealed*, and the M7 plugin demo);
`new Namespace()` can't work and ESM forbids reassigning a bare export, so the impl must live on
`.Class`. Dropping it is off the table.

**The actual, purely-cosmetic change:** rename getter/factory MEMBER names that carry a redundant
`Class` suffix, keeping the `.Class` in the body:
`get GitCommandsClass() { return GitCommands.Class; }` → `get gitCommands() { return GitCommands.Class; }`.
No `.Class` reference removed, no seam change, no call-site removal, no invariant impact — a rename
of local member names only. Update the members' callers.

**Watch for name collisions:** renaming a member to exactly its imported namespace name
(`get GitCommands() { return GitCommands.Class }`) shadows the import and reads ambiguously — in
those cases keep a distinct, clear name (lowercase `gitCommands`, or a role name), don't collide.

**Scope:** the `<Thing>Class` late-dependency getters (e.g. GitRepository's `GitCommandsClass` /
`ClockClass` / `StatusChannelClass`). The `createX()` seam methods already carry no `Class` suffix —
untouched.

**Timing / method:** a discrete rename pass AFTER the gate (or trivially inline where small +
local), re-running `bunx tsc --noEmit` + full `bun test` + the checker (`--all --refs`) so no caller
breaks. Do not act mid-build.

**Status:** pending · **Logged:** 2026-07-21 (rescoped 2026-07-21)

---

## D — Delegation standard: full-parity context, task-scoped, boss-identity stripped

**Decision:** Every delegation (codex worker OR review subagent) is briefed as onboarding a resumed
self, not a fresh underling. The prompt =
**(shared cold-start orientation) + (only the contracts the task touches) + (role-framed task) −
(conductor identity).**

- **Shared orientation (fixed, reusable — the `project.handoff.md` MUST-RE-READ foundation):** the ivue reference
  + namespace pattern (`class $X` + `namespace X { const $Class; let Class = Reactive($X)/Static($X);
  type Instance }`, plain getters not `computed()`, late dependency reads, `createX()` seams, the
  `$stopEffects` footgun, `Static()` for stateless capabilities); the naming/module conventions; the
  verify discipline (drive real TUI under tmux, assert STATE from `artifacts/status.json`, NEVER
  pane-scrape; `bunx tsc --noEmit; echo TSC=$?` — never piped through tail/tee); the
  coordinate/frame-effect facts; and the codex-integration protocol (files land UNTRACKED in the
  worktree, the coordinator reviews + commits, codex often skips tests + the contract so demand
  them). Point the delegate at `project.handoff.md` + `project.ivue-reference.md` + the OpenTUI/coordinate
  facts rather than re-inlining — start it where the coordinator stands.
- **Scope contracts only (tiered):** include the target module's `*.invariants.md` + the specific
  `project.invariants.md` records the task touches — NOT all contracts. Cloning everything multiplies
  a large context per agent and defeats the point of delegating (keeping the main loop lean).
- **Role-framed, conductor identity STRIPPED:** clone the understanding, not the role. The delegate
  must NOT receive the coordination context / re-wake loop / "spawn your own agents and re-plan"
  framing, or it will spin up its own sub-agents and re-litigate the plan. Frame it as: "you are a
  scoped worker — read these docs, do exactly this one thing, return it for review."

Applies to BUILDING delegates AND independent adversarial reviewers (a reviewer gets the same
orientation + the contract + the code + a "try to REFUTE this against its contract via IBR /
invariants" framing — cross-model independence, since the author is the worst reviewer of their own
work). Spin up codex worktrees freely for both, worktree-per-writer isolated; parallelize genuinely
independent work.

**Why:** under-briefing is why delegated workers drift, skip tests, or violate the pattern — it
wastes more time than doing it yourself. Full-parity context scoped to the task, minus the
boss-identity, is what stops drift.

**Status:** adopted · **Logged:** 2026-07-21

**Hardening (2026-07-21) — embed the method, gate on compliance:** codex cannot invoke Claude
slash-commands and skips path-pointers, so the shared-orientation packet must INLINE the method, not
just link it: (a) the IBR reduction discipline (reduce to load-bearing generators; if-then form;
sort reality-based vs chosen; predict impossibilities; provisional-until-verified-by-execution), and
(b) the /invariants contract essentials (both required headings verbatim, the record schema with
Evidence + Impossible-if-true required, unnumbered declarative record names, the annotation format
`// invariant: <exact record name> (<path>)`, the name charset = letters/digits/spaces/hyphens only —
no commas). The absolute-path pointers stay, but the inline copy is the guarantee. This is embedded
in `scripts/codex/_preamble.txt` (the "METHOD — IBR + /invariants (EMBEDDED)" section). **Hard review
gate:** reject any delegate output whose `<module>.invariants.md` is not a proper IBR reduction
(vacuous/bare records, missing impossibilities, wrong schema, no Evidence) — send it back or redo it;
run the checker (`--all --refs`) on every delegated module before merge; non-conforming contracts
never merge. Adversarial-review delegates apply the IBR breaking discipline + impossibility test
against the module's contract. Every agent in this build — coordinator, codex, subagents — governs by
IBR + /invariants.

---

## D — Vendor the IBR skills into the project (self-contained, worktree-portable)

**Decision:** Install the `/ibr` + `/invariants` skills into `tui-editor/.claude/skills` via the
published package — `npx @invariantai/ibr install` (validated end-to-end; also `npx @invariantai/ibr
check --all` runs the bundled checker). The project is now self-contained: the slash-commands work
in-project, the checker runs from a project-local path
(`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`), and codex git-worktrees
inherit the skills (they were referenced by machine-absolute `/home/parallels/dev/ibr/...` paths that
don't exist in a worktree on another machine — now `.claude/skills/...`, portable).

**Supersedes** the earlier "never copy the checker into the target repo" note: that guarded against
ad-hoc drift between the canonical skill and stray copies. This is different — a PINNED published
version (`@invariantai/ibr` 0.1.0), intentionally vendored, byte-identical to canonical (verified via
`diff`), refreshed by re-running the installer. Version pinning + the release-sync workflow manage
drift. The canonical source remains the npm package.

**Applied:** codex preamble + `project.handoff.md` + `project.progress.md` now point at the project-local checker/skill paths.

**Status:** adopted · **Logged:** 2026-07-21

---

## D — The verification invariant (the "how do we test" formula)

**tmux is NOT the testing invariant — it is only the DRIVER.** The reduced formula:

> A test is only as true as the channel it reads is authoritative for the property under test.
> Drive through the real input path; assert at the layer where the property is authoritative;
> never reconstruct a property from a channel downstream of where it is defined.

This forces a per-property choice of oracle. For this TUI there are exactly three properties, each
with ONE authoritative channel:

1. **Pure logic** (coordinate math, grapheme span-splitting, parsers, `selectionRange()`, porcelain
   parsing) → **unit tests on pure functions**; oracle = the return value. Deterministic, no tmux.
   This is where correctness should live whenever logic can be extracted from I/O.
2. **Semantic state** (what the app BELIEVES: cursor, selection, buffer revision, dirty, focus, tree,
   git status) → the **`status.json` side-channel** the app itself writes (`StatusChannel`); oracle =
   the app's own state export. tmux sends real keys (the honest input path); assertions read
   status.json — NEVER pane-scrape. Settle on the frame counter, never a fixed sleep.
3. **Visual output** (what is actually DRAWN per cell: char/fg/bg/attrs) → the **`FrameProbe`**
   framebuffer dump (`TUI_FRAME_DUMP=1` → `artifacts/frame.json`); oracle = OpenTUI's render buffer,
   read BEFORE the pty. NOT `tmux capture-pane -e` (lossy for truecolor bg — proven). The
   gold-standard visual assertion is a **frame-diff**: snapshot before/after an action; the changed
   cells ARE the effect (no offset or color-decode math). This is what caught the selection
   mis-position bug.

**Role of tmux:** the driver only — a real pty + real keystrokes + process lifecycle + resize. It is
the input path, not the oracle. Reaching for a "Playwright for terminal" (headless xterm) only makes
sense to verify the SGR *encoder* end-to-end; for asserting our app's behavior the framebuffer is
strictly better (source of truth, no round-trip loss).

**Impossible if the formula holds:** a green test that asserts a color by grepping pane escapes; a
state assertion that pane-scrapes rendered text instead of reading status.json; a "settled" wait
that's a fixed sleep rather than a frame-count signal; correctness that lives only in an integration
test when it could be a pure unit test.

**Status:** adopted · **Logged:** 2026-07-21

## D — agent-tmux is the codex/subagent driver; humans attach with `tmux attach -t at_<name>`

**Decision:** delegated interactive agents (codex, claude workers) run under `scripts/agent-tmux.sh`
(brought into tui-editor from the maintained blackline copy). Sessions are namespaced `at_<name>`;
a human watches/steers any worker live with `tmux attach -t at_<name>` (detach `Ctrl-b d`), or
non-intrusively with `scripts/agent-tmux.sh peek <name> [lines]`. Launch:
`scripts/agent-tmux.sh launch <name> --cwd <worktree> --profile codex -- codex --yolo`. A live tmux
session is SINGLE-OWNER — attach to watch freely, but don't drive it from two places at once.
**Caveat:** the `codex` profile's ready/busy regexes are still `[UNVERIFIED]` placeholders — codex's
interactive UI renders fine under tmux (confirmed: YOLO banner + `›` prompt + `model · dir` footer),
but `launch`/`wait` marker detection needs a live tuning pass against codex's real idle/busy footer
before agent-tmux can reliably auto-drive codex (until then, drive codex directly or tune the markers).

**Status:** adopted (markers pending verification) · **Logged:** 2026-07-21

---

## D — Full descriptive names, no abbreviations (global code convention)

**Rule (ALL code, always):** every identifier — variables, parameters, loop counters, locals,
fields — is a full spelled-out descriptive name. **No abbreviations, ever.** `increment` not `inc`,
`index` not `i`, `whiteCenter` not `wc`, `editor` not `ed`, `gitPanel` not `gp`, `commitLog` not
`cl`, `palette` not `pal`, `selection` not `sel`, `current` not `cur`, `options` not `opts`,
`direction` not `dir`, `workspace` not `ws`. Nested loops use distinct real names
(`rowIndex`/`columnIndex`), never `i`/`j`. This is about NAMING (not destructuring).

**Related (same spirit — explicitness):** don't create a local that is merely a short alias of a
property path; reference the full path (`workspace.editor`, not `const editor = workspace.editor`
used once). A reused COMPUTED result (method/function call) may be stored, named for what it is.

**Do NOT rename:** external/library API names, or the ivue namespace tokens (`Class`, `$Class`,
`Model`, `Instance`). A rename must be behavior-preserving — keep tsc + all tests green.

**Enforcement:** de-abbreviate before every commit; hard gate on delegated (codex/subagent) output.
Embedded in `scripts/codex/_preamble.txt`. IBR *explicitness over abstraction* applied to naming.
User directive: "code is getting sloppy… use full names… a global understanding for ALL code always."

**Status:** adopted · **Logged:** 2026-07-21

## D — Name the state established, not the steps taken (naming convention, refinement 2)

**Decision:** Extend the full-descriptive-names convention with two rules: an identifier names the
STATE it establishes rather than the mechanism it uses, and a rename sweep lands alone and early.

**Why the first rule:** the value of a descriptive name is that it removes a lookup — the reader
trusts it and does not go to the definition. That trust is exactly what makes a stale descriptive
name worse than an abbreviation: an abbreviation forces a look, a good name licenses an assumption.
A name that describes MECHANISM therefore has a built-in expiry, because mechanisms change while
intent does not. Lived case: `focusPanelOutsideDialog` clicked outside an open dialog to focus the
pane beneath, and read perfectly — until outside-press dismissal landed and that gesture became
"close". The name then described something impossible, while still reading like documentation. Its
replacement, `focusPanelBeforeOpeningDialog`, names the state it leaves behind and survives any
change of gesture. Test: if the implementation changed tomorrow, would the name still be true?

**Why the second rule:** a convention rename is a semantic-conflict factory. Git merges a rename
cleanly as text, so nothing warns you; the build breaks instead. Lived case: a builder renamed
`deps` → `dependencies` in `OverlayLayer` (for this very convention) on a branch, while main
separately landed `createModalDismissal` using `this.deps`. Clean merge, broken compile. Sweeps
must not ride along with feature work, and must be gated against LATEST main before they age.

**Why explicitness is load-bearing rather than stylistic (the part worth keeping):** humans and
delegated agents both read from a window, not from the whole program, so a name is the cheapest type
annotation that survives into a `grep`. The second-order effect is what the gates run on: consistent
naming turns semantic properties into searchable surface patterns. `merge-gate.sh` now distinguishes
a MEASUREMENT from a WAIT by finding a subtraction of two clock readings (`performance.now() -`),
which only works because every measuring site spells it identically — and
`assertNoCompleteFrameEmittedFor` is what made the absence-assertion class visible at all, where
`checkQuiet(600)` would have hidden it. Conventions are how a mechanical checker reaches a property
it should not be able to see.

**Status:** adopted · **Logged:** 2026-07-25

## D — The terminal is a RUNTIME, and reverse presence is a capability on it, not a channel (#114 Wave B, 2026-07-28)

The terminal became the first `PaneRuntime`: the third plugin kind #103 named. The host supplies
identity, laid-out geometry, a working folder, and — for a declared task — the command line it was
told to run. It never chooses a shell, a prompt, a lifetime, or a disposal order.

**Why a runtime seam rather than another provider.** A provider ANSWERS; a runtime OWNS. The
`LanguageProvider` shape (Wave A) is a question-answer port with no lifetime — asking twice is free.
A terminal has a process behind it, so its seam must carry creation, instance identity, removal, and
absence. Reusing the provider seam would have forced the host to hold the process's lifetime on the
runtime's behalf, which is exactly the coupling being removed.

**Why the agent half needs no new surface.** A CLI agent in a pane is a terminal PROFILE: a
`PaneRuntimeRequest` with a `process` declaration and a `workingDirectory`. `claude`/`codex` read
their context from the workspace folder they are started in, so "context verified present" is a
check the RUNTIME performs before it starts the child — the host cannot verify what it is not
allowed to know it started. That is why agents are not a plugin: the expressive power already exists
in the request.

**#46 (TerminalObserver, reverse presence) — folded in, not deferred.** Its two waves are already
built: `TerminalObserver` (bounded, redacted, write-incapable) and `AgentTerminalFollow`'s four
modes behind the #53 footer control. What Wave B settles is WHERE the presence channel lives: it is
the `terminal-observation` capability on the pane, resolved by identifier through
`PaneContent.capability`. Neither side imports the other's class, and the channel is withdrawn with
the runtime. No separate observer registry is needed and none should be added.

**#46 versus #157 (external harnesses over MCP) — share the PAYLOAD, not the channel.** They are
two directions of one idea but not of one mechanism. Outbound observation is in-process, already
bounded and redacted, and carries no trust boundary; inbound control from an external harness is
where transport, discovery, instance identity, attribution, and consent all live. Unifying them
would drag a trust boundary into a path that has none. What they should share is the event
vocabulary already recorded in `terminal.invariants.md` — a command boundary plus a payload that
declares `headLines`, `tailLines`, `totalLines`, `truncated`, and `byteCap` — so an MCP tool can
serve the same events without a second shape.

## Convention provenance (moved out of project.conventions.md, 2026-07-27)

`project.conventions.md` is the canonical WHAT; these are the cases that produced its rules. They
were inline there and made it read as a log.

- **Name the state, not the steps** — a harness helper `focusPanelOutsideDialog` clicked outside an
  open dialog to focus the pane beneath. Outside-press dismissal then landed, that gesture became
  "close", and the name still read perfectly while describing something impossible. Renamed
  `focusPanelBeforeOpeningDialog`, which names the state it leaves behind and survives a change of
  gesture.
- **A rename sweep lands alone** — a builder renamed `deps` → `dependencies` in `OverlayLayer` while
  main separately landed `createModalDismissal` using `this.deps`. Clean text merge, broken build.
- **MANIFEST-ON-TOP retired** (superseded by FILE GRAMMAR) — the old layout kept `$name`
  implementations as module-level function declarations below the manifest, relying on hoisting.
  Retired by user adjudication: detached functions are invisible to BOTH governing systems — not on
  the seam (not overridable, stubbable, or fork-reachable) and not on a `Reactive()` prototype (can
  never join the graph). One grammar replaces two.
- **A population test discovers its population** — the first `$`-cache contract landed with 36
  explicit namespace imports: correct on the day, silently partial from the next commit onward.
- **The `$`-cache freeze was a defect, not a design** — ivue 2.2.0 shallow-froze `$`-caches
  unconditionally, crashing `StatusChannel.$state`'s `Object.assign` at boot. Reverted in 2.2.1:
  the `$` prefix promises stable identity per receiver and nothing more.
- **Discovery measurements** (pre-migration main) — 36 candidate files, 67 `$`-getters across 36
  classes, 67/67 identity-stable, 0 primitive, 0.14s wall, 92MB RSS. Importing all of `src` instead
  of scan-selected candidates hangs past 120s.
- **Store the RECIPE, not the drive** — a corpus of replayable drive scripts was proposed and
  declined by the user: "the drive stubs will pollute the repo." The reduction they then named is the
  keeper — encode the INTENT, not the code. The asymmetry is the whole argument: a stored drive rots
  silently (coordinates drift, it still exits 0, and it lies to a checker that cannot tell), while a
  stored recipe is prose whose staleness is visible to a reader and which can never manufacture a
  green. Non-executability is the feature. It also captures the expensive part: in the folded-flyweight
  work the key names were cheap, while "use the NESTED fixture because the flat one structurally
  cannot express the defect; collapse a LEVEL-0 region because it must span more than one block; type
  at the root while the fold is active; page PAST the collapsed body" was the reasoning. Recipes
  belong in the domain's invariant record beside the invariant they exercise — the artifact a cold
  start already fetches and the invariant checker already keeps honest — never as a standalone
  script library. `--click 45,7` is the anti-pattern: two integers encoding "the fold gutter of the
  first top-level region", true only for today's layout.
- **A recipe carries TWO anchors, and they diverge** — user addition: record the branch a recipe came
  from so a later agent can bisect. Refined into two fields, because one cannot do both jobs.
  *Provenance* is the branch and task that produced it — WHY the gesture exists, and the line of work
  whose reasoning explains it. *Last observed true* is a COMMIT, and it is the bisect lower bound: the
  window a future agent searches is that commit to HEAD, so re-verifying a recipe shrinks the window
  for everyone afterwards. They start equal and separate immediately; keeping only the first leaves the
  search unbounded, keeping only the second discards the reasoning. Branch provenance is durable here
  only because of the never-delete rule — branches are parked with `finished/`/`orphaned/` tags, so the
  name still resolves years later. A recipe whose anchor is on a branch that never landed is still
  informative: it says the behaviour existed on a line of work that was abandoned, which is usually the
  answer to "why doesn't this work any more."
- **The anchors become an APPEND-ONLY ledger, and each entry needs a KIND** — user addition: record
  every branch the recipe was later improved within, so each recipe carries a small log of its own
  improvement. Append-only, never rewritten: each entry is a known-true point, so the log is a ladder of
  bisect footholds rather than a changelog, and rewriting it destroys the ladder (same reason history is
  never rewritten here). The load-bearing refinement is that "the recipe changed" has two opposite
  meanings and an undifferentiated entry is useless as evidence, so each one declares which it is:
  *tracked-a-change* (the app moved and the recipe was updated to match), *corrected-an-error* (the app
  did not move, our description of it was wrong), or *re-verified-unchanged* (nothing edited — the
  cheapest and most valuable entry, because it advances the bisect lower bound for free). A bisect reads
  those three completely differently.
  Generative consequence, and the answer to "won't this log rot too": a recipe whose ledger grows long
  without the recipe itself getting clearer is evidence the area is volatile, which makes it a candidate
  for PROMOTION to an executed gated contract. Log length is a promotion signal, not decoration — which
  is what keeps the ledger from becoming the unread-artifact trap that killed the drive corpus.

## The shared text primitives leave the source-text view (#122, 2026-07-28)

Context: #122 asked for the capstone of the modularity extraction — the source-text view stops
being a privileged built-in and becomes an ordinary contributor. Its done-test was mechanical:
`modules/editor/` host references go 4 → 0, the standard git, LSP, and the terminal already meet.

The measurement was measuring the wrong thing, and the brief predicted it would. Counting which
host files name `modules/editor/` said 4. Counting relative production imports said 33. The gap is
not bycatch — it is the finding. `modules/editor/` held TWO different things:

- the SOURCE-TEXT VIEW — `Editor`, `EditorWrap`, `EditorPane`, `BracketMatch`, `CodeFolding`;
- the SHARED TEXT PRIMITIVES every text surface in the app stands on.

`EditorCoordinates` was imported by 33 production files across 12 modules — agent, app, diff,
filetree, git, inline-rewrite, lsp, markdown, scripts, search, syntax, ui. `TextInputModel` by 10
across 5. Those are not the host knowing about the editor. That is the host doing grapheme and
display-column arithmetic, and being charged for a dependency on the editor to do it.

The contract layer already knew. `TextInputModel` cites *Editable text fields share one input
model*, `WrapBreakOpportunity` cites *Wrapped surfaces share one break generator*, `TextEditing`
cites *Seams are drawn at the shared generator* — all three records live in `project.invariants.md`,
not `editor.invariants.md`, and AGENTS.md names `TextEditing` word-edits as a shared generator in
the convention itself. `EditorCoordinates` documented itself as "the shared horizontal-scroll
primitive for every list/text pane". Only the FOLDER disagreed.

Decision: the shared text primitives move to `src/modules/text/` and `EditorCoordinates` is renamed
`TextCoordinates`, because a class named for the editor in every host file is itself the false
signal the census kept reporting. Four invariant records moved with them into
`src/modules/text/text.invariants.md`. The rules did not change; their recorded owner did.

Why this is a precondition and not a detour: the editor's host coupling cannot be measured, let
alone removed, while the measurement counts the app's text primitives. It is also what the
workspace needs — once the editor is a plugin, `Workspace`, `DocumentHandle`, and
`LanguageProvider` must still hold documents without depending on it. `TextDocument` moved for
that reason.

The seam has one direction, and a conventions-gate rule (1.52) enforces it: `src/modules/text/`
never imports `../editor/`. A primitive that reaches back into the view stops being shared and
silently re-fuses the two.

What this did NOT reach: the census went 4 → 3 and 33 → 9, not to 0. The residue is the real
capstone — `Workspace` constructs `Editor` buffers, `RootView` mounts the editor as native
renderables rather than through the `PaneContent` seam, and `Bootstrap` reads bracket state. The
editor is the only pane that is not a `PaneContent`, and putting it on that seam is the rewrite the
capstone actually names. See the #122 report for the measured evidence.

## Fold state is document-adjacent persistence, not a view property (#218, 2026-07-29)

`DocumentHandle` held a `foldState` typed `EditorFoldState`, imported from `src/modules/editor/`.
The type sat in a document seam and was named after the view. #218 had to decide where fold state
belongs before it could remove that import, because "just move the type" and "move the state" are
different answers.

Decision: fold state is DOCUMENT-ADJACENT PERSISTENCE. It stays on the stable `DocumentHandle`,
and its type moves to `src/modules/text/DocumentFoldState.interface.ts` beside the document. A
view ATTACHES to a fold state it does not own (`SourceTextView.attachFoldState`).

The reasoning is the flyweight. A clean background tab is dehydrated: its view is disposed and a
later activation builds a new one. A collapsed region is a user decision about a FILE, not about
the current instance showing it. Store it on the view and every eviction silently discards it —
the exact stale-state class *Document identity survives document instance replacement* exists to
prevent. Store it beside the document and it survives, which is what the code already did; only
the recorded owner was wrong.

The type test agrees with the storage test. A fold is `{ collapsedLineStarts: Set<number> }` — a
set of DOCUMENT line numbers. It carries no wrap width, no scroll offset, and no visual row, so
nothing in it needs the view to be interpreted. `FoldRange` is now an alias of the same file's
`DocumentFoldRange` for the same reason: a foldable region is a document range and the view adds
no coordinate of its own.

Rejected: make fold state a view property and re-derive it on rehydration from a persisted
side-table. That is the same storage with an extra copy, and it puts the authority in the place
that keeps being destroyed.

## The cursor and the scroll window are text primitives, not view parts (#218, 2026-07-29)

To state what a workspace buffer's VIEW is without naming the editor, #218 needed a contract
(`src/modules/workspace/SourceTextView.interface.ts`) that could say `cursor` and `viewport`. Both
classes lived in `src/modules/editor/`, so the contract could not name them without re-creating the
import it exists to remove.

The measurement settled it. `Cursor` and `Viewport` had ZERO importers outside
`src/modules/editor/` — every consumer reached them only through `editor.cursor` and
`editor.viewport`, so no host file named either type. That is the #122 finding again at a smaller
size: a primitive parked behind the editor door that the app uses without knowing it.

The contract layer agreed, as it did in #122. `Cursor` already cited *A cursor position resolves to
three distinct coordinates*, which lives in `src/modules/text/text.invariants.md`, not
`editor.invariants.md`. `Viewport` cited two `project.invariants.md` records (*The terminal shows a
bounded viewport*, *Cost tracks the actively observed set*). Neither record had to move with the
files, which is the strongest sign the folder was the only thing that disagreed.

Decision: both move to `src/modules/text/` as `TextCursor` and `TextViewport`. They are renamed for
the same reason `EditorCoordinates` became `TextCoordinates` — the file names are the seam, and
`Viewport` alone reads as any pane's viewport rather than the window one text surface shows.
`ReadOnlyTextBuffer`, the shared model behind the editor, the diff view, and the Markdown split
view, already owned the cursor, so this puts the type where its one generator is.

At that point, `ReadOnlyTextBuffer`, `EditorWrap`, `CodeFolding`, and `BracketMatch` did not move.
The later shared-generators audit found that the first two serve the editor, diff, Markdown, and UI
core through the same generator. It moved `ReadOnlyTextBuffer`, `EditorWrap`,
`EditorFrameAttribution`, and the generic `EditorSourceTextViews` provider to `src/modules/text/`.
`CodeFolding`, `BracketMatch`, and the concrete editor provider factory remain in
`src/modules/editor/` because they belong to the editor plugin.
