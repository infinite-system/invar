# TUI Code Workspace — Project Invariants

Root contract: the load-bearing generators the whole architecture descends from, and the
governance record naming the contract-governed modules. Module-level rules live in each
module's colocated `src/modules/<module>/<module>.invariants.md`.

Invariants are unnumbered — the name is the identifier, referenced by name everywhere and
matched byte-for-byte by `// invariant:` code annotations. Chosen invariants stand on reality
invariants, never the reverse.

Grounding: the ivue mechanisms cited below are verified against `../ivue` source/docs and a
headless smoke test (`scripts/ivue-smoke.ts`); see `project.decisions.md` for the study and page
references.

## Reality-based invariants

### The terminal shows a bounded viewport

**Invariant:** If content is displayed in a terminal, then only a fixed rows×columns window is
visible at once, independent of how much content exists.

**Scope:** All rendering. The window size changes only on resize.

**Mechanism:** A terminal is a fixed cell grid; the emulator exposes a finite dimension and
scrolls, it does not show unbounded content simultaneously.

**Generates:** *Cost tracks the actively observed set*; viewport-only rendering; virtualized
file tree, git history, outline, and editor.

**Evidence:** OpenTUI reports fixed terminal dimensions; `git`/scrollback do not change it.

**Impossible if true:** A render pass that must materialize every line/row/commit of a large
document to show one screen.

**Verification:** Inspection — the render path queries terminal dimensions and renders a
window bounded by them.

**Status:** established

**Last refined:** 2026-07-21

### A referenced resource stays alive

**Invariant:** If an effect, subprocess, watcher, timer, file descriptor, or keyed reactive
overlay remains referenced, then it retains its cost until explicitly released — garbage
collection cannot reclaim what is still reachable.

**Scope:** All owned resources: ivue effect scopes, OpenTUI renderables, LSP/git subprocesses,
file watchers, Tree-sitter trees, keyed revision-ref overlays.

**Mechanism:** JS reachability keeps referenced objects alive; OS resources persist until
closed. ivue keyed overlays (`Map<key, Ref>`) hold strong references and their watchers
subscribe permanently — they never self-GC, so eviction is part of the design, not optional
(`../ivue` flyweight docs; `$stopEffects()` is required for component-outliving instances).

**Generates:** *A resource lives only while observed* (component of *Cost tracks the actively
observed set*); the hot/warm/cold/disposed lifecycle tiers; explicit `dispose()`/eviction
paths; the resource-lifecycle audit.

**Evidence:** `../ivue/lib/Reactive.ts` (`$stopEffects` deletes scope + cached cells);
flyweight `evictOutsideRows` releases fine refs/computeds outside the viewport.

**Impossible if true:** Memory that stabilizes after repeated open/close cycles without any
explicit disposal or eviction path being exercised.

**Verification:** A lifecycle test that opens/closes buffers, workspaces, previews, and LSP
repeatedly and asserts RSS stabilizes and subprocess/watcher/effect counts return to baseline.

**Status:** provisional

**Last refined:** 2026-07-21

### Eager circular runtime reads fail during init

**Invariant:** If a module reads another module's runtime value during evaluation while their
imports form a cycle, then the read is initialization-order-dependent and can throw
(`Cannot access 'X' before initialization`).

**Scope:** Runtime imports across every cyclic module path. Type-only imports and acyclic imports
are outside this reality statement.

**Mechanism:** ECMAScript modules evaluate an import graph in dependency order while imported
bindings remain subject to initialization timing. A top-level `new B.Class()`, `const C =
B.Class`, or `export default B.Class` can therefore read through a cycle before `B` has
initialized. Circular inheritance remains impossible for the same eager reason.

**Generates:** *Imported dependencies are read late*; the ban on constructing or snapshotting
`X.Class` at module scope.

**Evidence:** `project.brief.md` `Circular Dependency Rule`;
`../ivue/docs_v2/guide/modules.md#circular-references-resolve-by-construction`.

**Impossible if true:** A guarantee that an eager runtime read through an import cycle succeeds
before the imported binding initializes.

**Verification:** A build/lint check that flags top-level `new *.Class` / `const * = *.Class` /
`export default *.Class`; plus the app boots under any module order.

**Status:** provisional

**Last refined:** 2026-07-24

### An async result can outlive the state it described

**Invariant:** If a parse, LSP, or git result is produced asynchronously, then it can arrive
after the buffer/state it described has already changed.

**Scope:** Tree-sitter parses, LSP responses (diagnostics, semantic tokens, definitions), git
refreshes, ESLint runs.

**Mechanism:** Concurrency: the text/state advances while a worker/subprocess/request is in
flight; completion order is not arrival order.

**Generates:** *Async results are revision-stamped and stale results discarded*; *The immediate
layer never blocks the deferred layer*; superseding/cancelling stale refreshes.

**Evidence:** Standard concurrency; the brief's syntax and diagnostics sections.

**Impossible if true:** A highlight or diagnostic set derived from text older than the current
buffer overwriting the current view.

**Verification:** A test that issues rapid edits while a slow parse/LSP result is in flight and
asserts the stale result is dropped (revision mismatch), never applied.

**Status:** provisional

**Last refined:** 2026-07-21

### Terminals report key repeat not key up

**Invariant:** If a key is held, then the terminal emits repeated key events, not a
key-down/key-up pair — hold duration must be inferred from repeat timing.

**Scope:** All keyboard input, especially arrow-key acceleration.

**Mechanism:** Terminal input protocols deliver auto-repeat characters; true key-up is not
generally available.

**Generates:** Arrow-key acceleration inferred from repeat cadence; immediate reset on pause
or direction change.

**Evidence:** The brief's arrow-acceleration section; terminal input reality.

**Impossible if true:** Acceleration logic that depends on a real key-up event to reset.

**Verification:** A harness test sending repeated arrow sequences and asserting the acceleration
curve and its reset on pause.

**Status:** provisional

**Last refined:** 2026-07-21

### Terminal color and glyph support varies

**Invariant:** If the UI uses color or glyphs, then support varies across terminals (color
depth truecolor/256/16; nerd-font glyphs may be absent), so every palette and icon must resolve
through a capability fallback.

**Scope:** Themes, file-type icons, diagnostic underlines, git decorations, all styled output.

**Mechanism:** Terminals differ in declared color and font capability; using an unsupported
color/glyph degrades to garbage or blanks.

**Generates:** *Appearance is data with a capability fallback*; the truecolor→256→16 and
nerd→unicode→ascii ladders; the undercurl→underline→gutter diagnostic ladder.

**Evidence:** The brief's diagnostic-fallback section; terminal capability reality.

**Impossible if true:** Legible output on a 16-color / no-nerd-font terminal that hard-codes
truecolor or nerd glyphs.

**Verification:** A harness test rendering the file tree and diagnostics under forced 16-color /
no-nerd-font capability and asserting legibility.

**Status:** provisional

**Last refined:** 2026-07-21

### Language and git tools are separate failable processes

**Invariant:** If the editor uses LSP, git, or ESLint, then each is a separate OS process that
can be absent, slow, or crash, and the editor must remain fully usable regardless.

**Scope:** LSP servers, git subprocesses, ESLint providers.

**Mechanism:** These run out-of-process; their availability and latency are outside the
editor's control.

**Generates:** *The immediate layer never blocks the deferred layer*; lazy startup; disposal
on cool/close; graceful degradation to no-semantic mode.

**Evidence:** The brief's LSP/git/ESLint sections; subprocess reality.

**Impossible if true:** Editing that blocks or crashes when LSP/git/ESLint is missing, slow, or
dies.

**Verification:** Adversarial tests: LSP absent, LSP killed mid-session, git command failure —
editing continues, no crash, terminal restored.

**Status:** provisional

**Last refined:** 2026-07-21

### A notify channel cannot report its own silence

**Invariant:** If a component learns of change through a notify/event channel — an fs watcher, an LSP
publishDiagnostics stream, a worker's completion signal — then that channel can never report a DROPPED
event or a DEAD source: silence is indistinguishable from "nothing changed" and from "the source hung."
So correctness under any notify channel requires a periodic PULL floor that re-reads ground truth on a
bounded interval; notify is a latency accelerator over that floor, never a replacement for it.

**Scope:** GitWatcher (fs events), LSP publishDiagnostics, and — crossing out of the editor into the
build itself — the parallel worker fleet (completion-notify).

**Mechanism:** An event channel signals the PRESENCE of a change; it has no symbol for the ABSENCE of a
signal. A dropped event (inotify `IN_Q_OVERFLOW`), a delivery gap, or a hung/dead source all emit
nothing — so only an independent periodic read can detect divergence.

**Generates:** The GitWatcher reconcile-floor (bounded `git status` re-read under the fs-watch
accelerator); the fleet heartbeat (bounded process-tree-CPU poll under completion-notify); LSP
rescan-on-overflow.

**Evidence:** GitWatcher reconcile-floor (`src/modules/git/GitWatcher.ts` + `git.invariants.md`);
`scripts/fleet-heartbeat.sh` (+ `.readme.md`) — a worker once hung 1.5h SILENTLY under notify-only until
a pull heartbeat caught it. The domain-crossing (fs-watch ⇄ orchestration) is the validator that this is
real, not a local convention.

**Impossible if true:** A notify-only design that stays correct when its source drops an event or dies;
detecting a silent hang without an independent periodic read.

**Verification:** Kill the watcher / exhaust inotify → change a file → the panel still converges via the
floor; hang a worker → the heartbeat flags flat process-tree CPU within N beats.

**Status:** provisional

**Last refined:** 2026-07-22

### A text position has several encodings

**Invariant:** If a position in text is referenced, then its UTF-8 byte offset, UTF-16 unit
offset, logical character index, and terminal display column do not coincide, and each consumer
must use the encoding it requires.

**Scope:** Cursor math, selection, Tree-sitter edit coordinates, LSP positions (UTF-16),
terminal column mapping, tab expansion, wide/combining characters.

**Mechanism:** Multi-byte UTF-8, surrogate-pair UTF-16, zero-width/combining marks, wide (2-col)
glyphs, and tab expansion each break the 1:1 assumption between these encodings.

**Generates:** Explicit encoding conversions at every boundary; the coordinate-correctness test
matrix; the editor/syntax/lsp coordinate discipline.

**Evidence:** The brief's coordinate-correctness section; Unicode/terminal reality.

**Impossible if true:** A cursor, selection, or LSP jump that lands correctly on ASCII but
drifts on Unicode, tabs, wide, or combining characters.

**Verification:** Unit tests over Unicode, tabs, CRLF/LF, combining, wide chars, asserting each
encoding conversion round-trips.

**Status:** provisional

**Last refined:** 2026-07-21

## Chosen invariants

### Cost tracks the actively observed set

**Invariant:** If data exists in the system, then its memory, reactivity, and background-activity
cost scale with what is visible and actively observed, not with what exists.

**Scope:** Editor buffers, syntax spans, terminal cells, file tree, git history, diagnostics,
symbol outline, markdown tokens — every high-cardinality dataset.

**Components:**
- *Ground truth is compact and non-reactive at rest* — columnar typed arrays / plain Maps /
  packed spans hold the data; refs are sparse version signals, not value holders.
- *A resource lives only while observed* — reactive overlays and services are materialized for
  the visible window and evicted/disposed when cold.

**Mechanism:** The ivue flyweight pattern (`../ivue` flyweight-grid): columnar ground truth +
disposable per-render facades + a two-tier sparse revision overlay (fine per-item, coarse
per-block refs) with explicit eviction; a single frame effect pulls only the visible window
through tracked accessors, subscribing to exactly the version refs it touches. Full-document
aggregates that a frame consumes are revision-keyed snapshots or incrementally maintained scalars:
fold ranges have line and collapsed-range indexes, serialized document length is a running count,
and diff overview projection is cached by immutable alignment plus track height. Measured 4.7
bytes/cell at 20M cells, +0.3 MB after 30 viewports.

**Generates:** The flyweight architecture; viewport rendering; packed highlight spans and
`ScreenBuffer`; hot/warm/cold/disposed tiers; lazy LSP; `evict*` paths.

**Evidence:** `../ivue/docs_v2/guide/flyweight.md` + the flyweight-grid model (4.7 bytes/cell at
20M cells, +0.3 MB after 30 viewports); the flyweight editor/syntax code lands M2. 2026-07-24
three-instrument latency investigation: full uncached keypress→byte-flush path measured 2.97 ms
(156 production files, 120×40 viewport), +1.2 ms across the entire 07-22→07-24 feature era —
the bound held through the heaviest landing window in the repo's history. This invariant is
what keeps *Derived state is a plain getter unless caching is proven* affordable: uncached
derivation is cheap exactly while every hot-path read is viewport-bounded; held tight, the
no-computed paradigm holds indefinitely against data scale, leaving only per-feature additive
cost, which the gate step watches.

**Impossible if true:** A reactive object per cell/token/line; an LSP alive for a cold
workspace; idle CPU above ~zero; memory that grows with file/repo size rather than visible size; a
per-frame quantity that scales with document length.

**Verification:** `bun scripts/harness/measure-scroll-smoothness.ts` drives the
same gesture over 2k and 100k flat editor fixtures and requires exact equality
of document-line reads, fold/wrap projection lookups, and layout computations
per attributed frame. One diff and one fold-dense editor wall-clock canary
retain the 28 FPS sanity floor without making host speed the scale contract.
The fold-dense editor checkpoint keeps folding, indent guides, and
version-control gutter marks enabled, direct-jumps to line 75,000, settles on
observed scroll state and frame quiescence, excludes jump frames, then drives
at least 1,000 rows of real wheel input. Unit cost ratchets in
`CodeFolding.test.ts`, `Editor.test.ts`, and `DiffView.test.ts` prove
unchanged-frame lookups do not rescan their document-scale inputs. Idle CPU
remains ~0 after activity. Continuous (time axis): the per-gate byte-flush
latency step (campaign wave 1) — a spike names the commit that broke the bound.

**Status:** established

**Last refined:** 2026-07-27

### Held key movement accelerates within a ceiling

**Invariant:** If plain arrow events repeat in one direction within the terminal repeat window, then
movement follows one shared acceleration run whose first event moves exactly one unit and whose step
never exceeds 50 units.

**Scope:** Plain arrow movement in the editor caret, Markdown preview, `BoundedListPopup`, and every
future consumer of `ScrollPhysics.keyAccelerationFor`. Ctrl-arrow jump movement uses the separate
bounded jump curve.

**Mechanism:** One stateful `ScrollPhysics` instance owns direction, run length, and last-event time.
`keyRunLength` resets without key-up after a pause or direction change, and `keyAcceleration` maps the
run through the hand-tuned quadratic curve capped by `KEY_ACCEL_CAP_ROWS`.

**Generates:** Exact deliberate presses; accelerated holds; one terminal-repeat inference seam for
editor and list movement; a 50-unit maximum plain-arrow step.

**Rejected alternatives:** Track repeat runs in each input handler — the editor and popup infer holds
differently and drift. Wait for key-up — terminals do not report it.

**Evidence:** `src/modules/ui/ScrollPhysics.ts`; `src/modules/ui/ScrollPhysics.test.ts`;
`scripts/harness/smoke-completion-harness.ts` drives both a 5,000-item completion list and a long
editor file.

**Impossible if true:** One deliberate arrow press moves more than one unit; a held plain arrow never
accelerates; one repeat moves more than 50 units; a consumer needs a key-up event or private run
tracker.

**Verification:** `bun test src/modules/ui/ScrollPhysics.test.ts
src/modules/ui/BoundedListPopup.test.ts && bun scripts/harness/smoke-completion-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-26

### Derived state is a plain getter unless caching is proven

**Invariant:** If a value is derived from reactive state, then it is expressed as a named plain
getter unless a specific need (expensive recompute, render-suppression, or a stable ref
identity) justifies `computed()`.

**Scope:** All derived/conditional state in reactive models.

**Mechanism:** ivue rewrites getters to lazy cells; a plain getter lives once on the prototype
(0 bytes/instance) and stays fully reactive by subscribing to the leaf refs it reads, at any
depth. `computed()` costs ~300 bytes/instance when observed and is only worth it when caching
pays (`../ivue` computed-watch docs; 60 computeds × 10k items ≈ hundreds of MB).

**Generates:** The nearly-computed-free architecture; named getters for every `v-if`/ternary;
thin computeds (logic in a method, arrow always).

**Rejected alternatives:** `computed()` by default — costs memory per instance for derivations
that a plain getter delivers free.

**Evidence:** `../ivue/docs_v2/guide/computed-watch.md`; `scripts/ivue-smoke.ts` (the plain
getter `double` tracks reactively). Enforced from M1. 2026-07-24: the paradigm's CPU cost was
measured at the byte boundary — the entire recompute-everything tax on the hottest path (coarse
frame effect, all renderers, all getter chains, dependency re-tracking) is ~3 ms total at
current scale, while the memory-side saving stands; the trade is measured, not assumed. Holds
because reads are bounded — see *Cost tracks the actively observed set*: the two invariants are
load-bearing together.

**Impossible if true:** A `computed()` in the codebase with no caching/identity justification.

**Verification:** A review/lint pass counting `computed()` uses, each with a one-line
justification; the architecture-compliance audit. Continuous (time axis): the per-gate
byte-flush latency step — if getter accumulation ever makes recomputation expensive, a specific
gate goes red and `computed()` is applied surgically to the profiled-hot derivation, per this
invariant's own escape clause.

**Status:** established

**Last refined:** 2026-07-24

### Imported dependencies are read late

**Invariant:** If a module depends on another module's class, then that dependency is read
inside a getter or method body at call time, never constructed or snapshotted at module scope.

**Scope:** Every cross-module class reference in the graph.

**Mechanism:** Stands on *Eager circular runtime reads fail during init*. Reading the live
`X.Class` binding late (never `const C = X.Class`, never top-level `new`) lets the cyclic entity
web resolve by construction.

**Generates:** The `static get Dep() { return Dep.Class }` late-getter pattern; the ban on
default-exporting a `Class`; boot under any module order.

**Evidence:** `../ivue/docs_v2/guide/modules.md#circular-references-resolve-by-construction`.
Lint gate + enforced from M1.

**Impossible if true:** A top-level `new *.Class()`, `const * = *.Class`, or `export default
*.Class` in module source.

**Verification:** A lint/grep gate flagging those forms; the app boots under shuffled import
order.

**Status:** provisional

**Last refined:** 2026-07-21

### Public classes use the namespace pattern

**Invariant:** If Invar publishes a project-owned class, then it exposes a private `class $X`
through `namespace X` with `$Class = $X` and one honest `Class` binding: `Static($X)` for a
stateless capability, `Reactive($X)` for a reactive model, or `$X` for a plain stateful class.

**Scope:** Every public class under `src/modules/`. External library classes, interfaces, types,
and data-only role collections are outside this rule.

**Mechanism:** The namespace keeps the public domain name stable while `$Class` exposes the raw
inheritance root and `Class` exposes the selected construction form. The three bindings preserve
the actual distinction between stateless capability, reactive model, and plain stateful class.
The pattern was discovered through ivue, but Invar adopts it independently of reactivity and
independently of whether a module currently participates in an import cycle.

**Generates:** One class shape across the codebase; `new X.Class()` construction; `extends
X.$Class` specialization; the `Static` / `Reactive` / raw class-kind distinction; PascalCase
class filenames matching their namespaces.

**Rejected alternatives:** Directly exporting a class constructor — removes the raw-versus-selected
form and forces consumers to change shape when the class later gains reactivity, static binding,
or specialization.

**Evidence:** `project.conventions.md` `Class kinds and file shape`; `src/modules/app/AppLoader.ts`;
`scripts/check-exported-capabilities.mjs`.

**Impossible if true:** A direct `export class X`; a public class module without `X.$Class` and
`X.Class`; a `Class` binding whose `Static`, `Reactive`, or raw form contradicts the class's
actual state and lifetime.

**Verification:** `node scripts/check-exported-capabilities.mjs && bash scripts/conventions-gate.sh`.

**Status:** established

**Last refined:** 2026-07-24

### Construction goes through overridable seams

**Invariant:** If an object assembles a dependency, then it does so through an overridable seam
— the mutable `Class` slot or an overridable factory method — never a hidden hard-coded
decision in a constructor.

**Scope:** All domain-model and capability construction.

**Mechanism:** *Public classes use the namespace pattern* supplies the mutable `namespace.Class`
binding (`new X.Class()` reads the live slot; a plugin/kernel swaps it) plus
owner-constructs-child (`new Task.Class(this, data)`). Our chosen convention adds `createX()`
factory methods for constructor-time assembly, overridable via subclass/`super` — `createX()` is
our idiom, not an ivue feature.

**Generates:** The `Class`-slot swap for plugins; `createX()` factory methods; owner-injects-self
child construction; testable replacement of ids/clocks/engines.

**Rejected alternatives:** Hard-coding `new ConcreteDep()` in a constructor — unreplaceable in
tests and plugins.

**Evidence:** `../ivue` namespace-pattern docs + `examples/.../workspace-platform/Workspace.ts`
(owner-constructs-child, `new Task.Class(this, data)`). Code from M1.

**Impossible if true:** A dependency choice baked into a constructor with no override point.

**Verification:** A test replacing a model's id/clock/storage seam via subclass or `Class` swap
and observing the substitution take effect.

**Status:** provisional

**Last refined:** 2026-07-21

### Seams are drawn at the shared generator

**Invariant:** If two features share a behavior, that behavior belongs in one seam *only* when its
generator is the same for both. If they merely resemble each other but their generators differ, they
must not share — and if a consumer would have to suppress a seam's core behavior to use it, the
boundary is wrong: the true shared thing is a sub-part.

**Scope:** All cross-consumer reuse — shared engines/models/utilities (`TextEditing`,
`ScrollableTextViewport`, `TextSelectionModel`, `WrapText`, the `PaneContent` / `AgentBackend` /
`TtsBackend` seams). Peripheral configuration is exempt; only core/generative behavior is load-bearing.

**Mechanism:** A seam earns its place by reducing branching for *every* consumer. Surface similarity is
not shared structure; the generator is. A consumer forced to disable a seam's core is proof the shared
thing was mis-identified — the true shared behavior is a sub-part.

**Generates:** One `TextInputModel` across editable one-line fields; one
`TextEditing.deletePreviousWord` / `deleteNextWord` boundary authority across the editor and those
inputs; one `ScrollableTextViewport` for virtualized momentum scroll; the transcript/composer split
(shared wrap + selection + per-row highlight, *separate* scroll); one `ReadOnlyTextBuffer` below
editable `Editor` behavior; uniformity-by-reuse — a new consumer is one wire-up, not a
reimplementation.

**Rejected alternatives:** Unify by surface similarity (force the composer through the scroll engine) —
bolts on momentum + a scrollbar it must then suppress. Duplicate per consumer (a word-delete in each
input) — drifts.

**Evidence:** `src/modules/editor/TextInputModel.ts` owns one-line text and caret operations for
`AgentComposer`, `QuickOpen`, `CommandRegistry`, and `FindInBuffer`; `TextEditing.deletePreviousWord`
and `deleteNextWord` supply both word boundaries; the composer refused `ScrollableTextViewport`
because it would suppress momentum + the scrollbar, and split to a shared wrap + selection seam
instead (agent-pane-scroll build, 2026-07-23); `src/modules/editor/ReadOnlyTextBuffer.ts` is consumed
by `Editor`, `DiffView`, and `MarkdownSplitView` without exposing editing or undo.

**Impossible if true:** A behavior implemented more than once across consumers that share its generator;
a consumer of a shared seam that must disable that seam's core/generative behavior (peripheral config
excepted).

**Verification:** grep — no duplicate implementation of a shared-generator behavior; each shared seam's
consumers all exercise its core, differing only in peripheral flags.

**Status:** established

**Last refined:** 2026-07-24

### Wrapped surfaces share one break generator

**Invariant:** If an Invar surface searches for semantic soft-wrap positions, then it obtains
every legal break from `WrapBreakOpportunity` through an explicit prose or code profile.

**Scope:** Editor word-wrap mode, agent transcript bodies, the agent composer, and every future
surface that prefers semantic break opportunities before its width fallback. Width-only
grapheme wrapping in generic geometry or terminal emulation and clipped one-line chrome are
outside this rule.

**Mechanism:** `WrapBreakOpportunity.previousBreakOpportunity` scans backward over an
already-segmented grapheme array and returns the latest fitting boundary. The prose profile
admits whitespace and post-hyphen boundaries. The code profile extends that set with
post-separator, post-opening-bracket, pre-closing-bracket, lowercase-to-uppercase, and
around-operator-run boundaries. `EditorWrap` and `AgentWordWrap` supply the profile; neither
defines its own boundary character set.

**Generates:** One legal-break vocabulary across wrapped surfaces; prose that keeps ordinary
words whole; code that prefers readable identifier, path, bracket, punctuation, and operator seams;
profile differences without duplicated scanners.

**Rejected alternatives:** A wrapper-specific boundary predicate — the agent and editor drift as
soon as either surface adds a new break rule.

**Evidence:** `src/modules/editor/WrapBreakOpportunity.ts`;
`src/modules/editor/WrapBreakOpportunity.test.ts`; consumers in
`src/modules/editor/EditorWrap.ts` and `src/modules/agent/AgentWordWrap.ts`;
`scripts/harness/smoke-wrap-harness.ts`.

**Impossible if true:** The editor and agent owning independent lists of legal break characters; a
semantic wrapper adding a boundary rule without expressing it as a shared profile; prose and code
using different scanners for the same boundary profile.

**Verification:** `bun test src/modules/editor/WrapBreakOpportunity.test.ts
src/modules/editor/EditorWrap.test.ts src/modules/agent/AgentWordWrap.test.ts && bun
scripts/harness/smoke-wrap-harness.ts && bun scripts/harness/smoke-agent-pane-ux-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-25

### Editable text fields share one input model

**Invariant:** If Invar owns an editable one-logical-line text field, then its text, grapheme caret,
insertion, deletion, and horizontal movement come from `TextInputModel`, and every action
`TextInputModel.apply` implements is REACHABLE in that field.

**Scope:** `AgentComposer`; `QuickOpen.query`; `CommandRegistry.query`; `FindInBuffer.query` and
`replacement`; `BoundedListPopup.query`; every future one-line editable field. Full document
editors and terminal subprocess input are outside this rule.

**Mechanism:** `TextInputModel` owns the reactive string and grapheme caret and delegates word
boundaries to `TextEditing`. Consumers retain only their surface-specific filtering, layout,
selection, pointer, history, or navigation behavior. `scripts/ast-query.ts text-input-census
--require-zero` fails when a class still combines its own input-like state with edit or movement
members. Reachability has one chord table too: `KeybindingDefaults.textInputBindings(context)` emits
the `textInput.*` bindings per field context and `Bootstrap.applyTextInputAction` routes them to the
focused field, so a surface that already owns an unmodified key declares it in `hostOwnedPlainKeys`
instead of writing a second mapping.

**Generates:** One editing behavior across every text field; one complete text-input keybinding
table; caret painting at the real grapheme position; an enforced zero-count census gate.

**Rejected alternatives:** Per-surface query editing — fields drift until some lack caret movement
or delete a different span.

**Evidence:** `src/modules/editor/TextInputModel.ts`;
`src/modules/editor/TextInputModel.test.ts`; adopters in `src/modules/agent/AgentComposer.ts`,
`src/modules/search/QuickOpen.ts`, `src/modules/commands/CommandRegistry.ts`, and
`src/modules/search/FindInBuffer.ts`; `src/modules/ui/BoundedListPopup.ts`
(`applyQueryInputAction`); `src/modules/keybindings/KeybindingDefaults.ts`
(`textInputBindings`); `scripts/conventions-gate.sh`.

**Impossible if true:** An adopted text field storing its own query or caret and reimplementing
insert, backspace, delete, word deletion, or horizontal movement; an adopted field that composes the
model yet leaves word movement or word deletion unreachable because its keys were never routed; a
fourth chord table for the same `textInput.*` actions.

**Verification:** `bun test src/modules/editor/TextInputModel.test.ts
src/modules/keybindings/KeybindingDefaults.test.ts && bun scripts/ast-query.ts text-input-census
--require-zero && bun scripts/harness/smoke-text-input-harness.ts && bun
scripts/harness/smoke-field-caret-harness.ts`

**Status:** provisional

**Last refined:** 2026-07-26

### The app is built only after the kernel is sealed

**Invariant:** If the application is constructed, then plugin class-graph composition has already
completed and sealed — no application instance is created during plugin registration.

**Scope:** Boot sequence; kernel plugins; the `App` root and all module models.

**Mechanism:** The kernel (vendored/adapted from `../ivue` extensible-kernel) registers
extension classes, captures inheritance, topologically composes plugin factories, reparents
descendants onto composed parents, applies `Reactive()`/`Static()`, replaces namespace `Class`
bindings, then seals; construction after seal is native `new` + prototype dispatch with zero
registry lookup. Sealing changes future construction only; it never hot-mutates existing
instances.

**Generates:** The `Bootstrap` boot phase; `kernel.sealClassGraph()` before `new App.Class()`;
plugin toggle = capture → reset → re-register → seal → reconstruct.

**Evidence:** `../ivue/examples/playground/src/examples/extensible-kernel/kernel.ts`
(`sealClassGraph` composes then seals). Kernel module M1, plugins M7.

**Impossible if true:** An application singleton constructed during module evaluation or during
plugin registration; a live instance mutated into a new class by a plugin toggle.

**Verification:** A test that registers a kernel plugin, seals, constructs, and asserts the
composed behavior is present and no instance predates the seal.

**Status:** provisional

**Last refined:** 2026-07-21

### ivue owns state and OpenTUI owns projection

**Invariant:** If application state is observed, then ivue owns it; if the terminal is drawn or
input is read, then OpenTUI owns that — there is exactly one state system and one projection
system.

**Scope:** All application state and all terminal rendering/input.

**Mechanism:** A single reactive source of truth (ivue models) feeds custom OpenTUI renderables;
the editor viewport is a custom renderable, never a template renderer holding parallel state.

**Generates:** Custom `*Renderable` classes; no second state store; the one-way flow below.

**Rejected alternatives:** A second state system inside the renderer — two sources of truth that
drift.

**Evidence:** The brief's Terminal-Rendering and Rendering-and-Reactivity rules (one state
system; custom renderables). Enforced from M1.

**Impossible if true:** Two systems both holding editor/workspace state; a render path that is
the source of scroll/selection truth.

**Verification:** Architecture audit — grep for state held in renderables; assert renderables
pull from models and hold none.

**Status:** provisional

**Last refined:** 2026-07-21

### Data flows one way

**Invariant:** If state changes, then it flows input event → model method → mutation → reactive
invalidation → `requestRender()` → frame; a render pass never mutates model state.

**Scope:** The whole input-to-frame loop.

**Mechanism:** OpenTUI input events call ivue model methods; a single coarse frame effect reads
the visible window and calls `requestRender()`; the renderable pulls compact data during render.

**Generates:** The one coarse invalidation effect (not effect-per-line/token/cell); render-pulls
-visible-data.

**Evidence:** The brief's data-flow diagram (OpenTUI input → ivue method → mutation →
invalidation → `requestRender`). Enforced from M1.

**Impossible if true:** A renderable that writes model state during its render pass; an
effect-per-item render graph.

**Verification:** A test asserting the editor uses one frame effect and renderables perform no
state mutation.

**Status:** provisional

**Last refined:** 2026-07-21

### The immediate layer never blocks the deferred layer

**Invariant:** If the deferred layer (LSP, ESLint, git) is slow or absent, then the immediate
layer (Tree-sitter highlighting, typing, cursor) proceeds without waiting.

**Scope:** Syntax vs semantic tokens; typing vs diagnostics; editing vs git refresh.

**Mechanism:** Stands on *Language and git tools are separate failable processes* and *An async
result can outlive the state it described*. Tree-sitter provides immediate syntax; LSP/ESLint/git
enrich asynchronously and never gate input.

**Generates:** Tree-sitter-first highlighting; async debounced git refresh; non-blocking
diagnostics; the UI never freezing on a backend.

**Evidence:** The brief's Real-Time-Syntax and Diagnostics sections (Tree-sitter first,
semantic later). Verified M2 (syntax) / M5 (LSP).

**Impossible if true:** Typing that stalls on an LSP/ESLint/git response; highlighting that
waits for semantic tokens.

**Verification:** A test with a stalled LSP/git asserting typing and highlighting latency are
unaffected.

**Status:** provisional

**Last refined:** 2026-07-21

### The render loop never wedges

**Invariant:** If a frame, input, or background handler throws, OR the terminal session state is
reset out from under the app (a hidden VS Code tab reverting termios / mouse / focus modes), then the
demand-driven render loop keeps running and the app stays responsive — one bad cycle degrades to a
logged no-op and the next event repaints; a lost terminal setup is re-asserted on focus-in. The app
NEVER freezes while alive.

**Scope:** The frame callback, the reactive paint effect, and every input/background handler
(keypress, mouse, resize, focus) in `Bootstrap.ts`; the terminal-session recovery in
`TerminalSession.ts`; the exception isolation in `HandlerGuard.ts`.

**Mechanism:** Every handler runs inside `HandlerGuard.run` — a throw is caught, logged to the FILE
(never the TTY), and a repaint is requested, so it degrades one cycle instead of stopping the pump.
On focus-in, `TerminalSession.reenterTerminalModes` (OpenTUI suspend/resume) re-applies termios raw +
mouse + focus reporting + a full repaint, so a tab-return never leaves the app frozen or input-dead.

**Generates:** the freeze-resilience of the demand-driven loop; the tab-defocus recovery; the
product guarantee that the app is never a black box the user must kill.

**Evidence:** `src/modules/app/HandlerGuard.ts` (`run`); `src/modules/app/TerminalSession.ts`
(`reenterTerminalModes`); `src/modules/app/Bootstrap.ts` (guarded frame/paint/keypress/mouse/resize/
focus handlers, focus-in recovery); the `focus-recovery` behavioral contract (focus-out→focus-in
emits a fresh frame and the app stays responsive).

**Impossible if true:** a thrown handler stopping the render loop so the app freezes while the
process is alive; a tab defocus→refocus leaving the screen stale or the mouse dead with no recovery.

**Verification:** the `focus-recovery` contract in `scripts/behavioral-contracts.sh` +
`terminal-session.test.ts` (a guarded throw is isolated and recovery still runs).

**Status:** provisional

**Last refined:** 2026-07-21

### Async results are revision-stamped and stale results discarded

**Invariant:** If an async result (parse, LSP, git, ESLint) is applied, then it carries the
buffer/document revision it was computed against, and a result older than current state is
discarded, never applied.

**Scope:** Highlight spans, semantic tokens, diagnostics, definition results, git refreshes.

**Mechanism:** Stands on *An async result can outlive the state it described*. Every result
carries a revision/version; on completion it is applied only if it matches the latest revision.

**Generates:** Buffer-revision stamping; stale-drop on parse/LSP/diagnostics; superseding stale
git refreshes.

**Evidence:** The brief's rule "apply only results matching the latest buffer revision" +
diagnostics staleness handling. Verified M2 / M5.

**Impossible if true:** An older parse/diagnostic overwriting highlighting/diagnostics for newer
text.

**Verification:** A test issuing rapid edits during in-flight async work, asserting only
latest-revision results are applied.

**Status:** provisional

**Last refined:** 2026-07-21

### The host canvas is complete without plugins

**Invariant:** If all contribution plugins are disabled, then the host canvas still opens
workspaces, files, editing, panes, popups, commands, and status contribution ports; shipped domain
capabilities may be default plugins but may not require host-core knowledge.

**Scope:** The workspace and application hosts, their contribution ports, and the default plugin
composition. Whether a domain capability ships enabled by default is a product-composition choice,
not a reason to couple it into the host.

**Mechanism:** Core modules own the canvas and contribution registries. `DefaultPlugins` composes
shipped domain plugins at the process edge; `Workspace` and `Bootstrap` consume only
`WorkspaceContributor`, `ApplicationContributor`, and contribution contracts.

**Refined 2026-07-26 — Markdown, language, and the file-tree view struck from the enumeration.**
All three are plugins. Generic file opening stays in the host and is reachable without the tree
through Quick Open, navigation, language jumps, and editor tabs. Markdown and the file tree ship as
default contribution plugins. Language still lives in `Workspace` because task 103 names its
provider boundary but explicitly defers the larger extraction; that placement is migration state,
not canvas authority. See `project.canvas-census.md`, extraction step 6.

**Generates:** A usable plugin-free editor canvas; default shipped capabilities without
host-to-domain imports; plugins that carry their own behavior.

**Evidence:** `src/modules/plugins/DefaultPlugins.ts` (file tree, source control, Markdown,
extensions);
`src/modules/filetree/FileTreeContributor.ts`;
`src/modules/workspace/WorkspaceContributor.interface.ts`;
`src/modules/app/ApplicationContributor.interface.ts`;
`src/modules/workspace/EditorSurfaceClaims.ts` and `src/modules/ui/EditorSurfaceContents.ts` (the
editor-column ports); the conventions gate's step-11 boundary check, whose matchers each carry a
positive control and whose shrinking allowlist is `scripts/plugin-boundary-baseline.txt`.

**Impossible if true:** Disabling plugins prevents opening or editing a file; `Workspace` or app
core importing, constructing, or typing a concrete plugin implementation.

**Verification:** `bun test && bash scripts/conventions-gate.sh`; inspect a boot with
`plugins: []` and the default boot with `DefaultPlugins.Class.create()`.

**Status:** provisional

**Last refined:** 2026-07-26

### Plugin boundaries grant one authority

**Invariant:** If a capability crosses the host boundary as a plugin, then its contract grants
exactly one authority: contributors register host projections, providers answer typed domain
questions, and hosted runtimes exchange session events or bytes with one reactive owner.

**Scope:** `ApplicationContributor`, `WorkspaceContributor`, `LanguageProvider`, `AgentBackend`, and
`TerminalBackend`. The classification applies to the boundary contract, not to private
implementation resources.

**Components:**
- *Contributors register projections* — they may attach workspace lifecycle state and register
  panes, decorations, commands, title actions, status segments, settings schema, or keybinding
  defaults; they do not answer document position queries through the plugin boundary.
- *Providers answer questions* — they accept domain inputs and return domain answers; they do not
  register or paint host surfaces.
- *Hosted runtimes exchange streams* — domain-specific `*Backend` contracts own external
  process/stream lifetimes and deliver events or bytes to one reactive owner; they do not reach into
  the reactive graph directly.

**Mechanism:** `ApplicationContributor.workspaceContributor` opts a contributor into the narrower
workspace lifecycle instead of making every application contributor fabricate it.
`ApplicationContributions` scopes settings, keybindings, and panes to the contributor activation and
unregisters them together. The host calls `LanguageProvider` for semantic answers. `AgentSession`
and `TerminalInstance` alone translate their injected backend streams into reactive state. Because
authority comes from the outward contract, `LanguageClient` may privately own an LSP process without
becoming a hosted-runtime plugin.

**Generates:** Separate contribution, provider, and hosted-runtime seams; an application-only
Extensions contributor; a language extraction path that wires `LanguageProvider` without giving it
canvas access; process backends that remain below reactive owners.

**Rejected alternatives:** One universal plugin interface — grants unused hooks and lets provider
or runtime authority leak into the canvas. Classify by private resources — misclassifies
`LanguageClient` as two kinds merely because its provider implementation owns an LSP process.
Collapse providers and hosted runtimes — erases the request-answer versus owned-session boundary.

**Evidence:** `src/modules/app/ApplicationContributor.interface.ts`;
`src/modules/workspace/WorkspaceContributor.interface.ts`;
`src/modules/lsp/LanguageProvider.interface.ts`; `src/modules/agent/AgentBackend.interface.ts`;
`src/modules/terminal/TerminalBackend.interface.ts`; `src/modules/plugins/DefaultPlugins.test.ts`.

**Impossible if true:** A provider painting or registering a pane; a contributor answering
completion or definition queries through its contribution contract; a backend mutating ivue refs
instead of delivering events or bytes to its owner; an application-only contributor implementing
empty workspace lifecycle methods.

**Verification:** `bunx tsc --noEmit && bun test src/modules/plugins/DefaultPlugins.test.ts
src/modules/git/GitPlugin.test.ts && bash scripts/conventions-gate.sh`.

**Status:** provisional

**Last refined:** 2026-07-26

### No action requires a memorized motion

**Invariant:** If an action exists, then it is reachable without memorized motions — a familiar
default binding, a command-palette entry, and a rebindable shortcut; no modal editing.

**Scope:** Every user action.

**Mechanism:** Every core action is registered as a command; the palette lists all; bindings are
configurable; defaults follow familiar (VS Code / nano) conventions.

**Generates:** Command-palette-for-everything; visible shortcut hints; rebindable keys; the
not-a-Vim-clone stance.

**Evidence:** The brief's Keyboard-and-Command-System ("every core action is a command";
not-a-Vim-clone). Verified M3.

**Impossible if true:** A core action reachable only by an unlisted, unrebindable keystroke, or
a mode the user must enter to type.

**Verification:** A test asserting every registered command has a palette entry and a rebindable
binding; no modal state gates insertion.

**Status:** provisional

**Last refined:** 2026-07-21

### Appearance is data with a capability fallback

**Invariant:** If the UI shows color or icons, then they come from swappable data (palettes,
semantic glyph slots, icon sets), never hard-coded, and each resolves through a capability
fallback ladder; changing a glyph vocabulary never changes input or projection behavior.

**Scope:** Themes, file-type icons wherever they are painted (file tree and breadcrumb popup rows
alike), syntax colors, git/diagnostic decorations, gutter, activity-bar items, and panel-heading
controls. Text content that is not an icon or control glyph — a filename, a `..` parent label — is
outside the glyph-slot rule.

**Mechanism:** Stands on *Terminal color and glyph support varies*. `theme.palettes.ts` /
`ThemeIcons.ts` are semantic-token data; `InterfaceGlyphVocabulary` gives behavior a stable slot
name while `$interfaceGlyphVocabularies` supplies the nerd→unicode→ascii values.
`TerminalCapabilities` also drives truecolor→256→16 resolution; the active theme is a reactive
selection; themes/icons are contribution-plugin extension points.

**Generates:** The `theme` module; semantic color tokens pulled by ui/editor/syntax/diagnostics;
theme/icon plugin contributions; activity and heading consumers that name slots instead of glyphs.

**Evidence:** The brief's diagnostic undercurl→underline→gutter fallback; the `theme` module
lands M2; `src/modules/theme/ThemeIcons.ts`; `src/modules/ui/ActivityBar.ts`;
`src/modules/ui/PanelHeading.ts`; `src/modules/ui/BoundedListPopup.ts`;
`src/modules/ui/BreadcrumbPicker.ts`; `src/modules/theme/ThemeIcons.test.ts`;
`scripts/harness/smoke-activitybar-harness.ts` (its expected glyph row is DERIVED from the
vocabulary, so a glyph change never edits the drive).

**Impossible if true:** A hard-coded truecolor/nerd-glyph that breaks legibility on a limited
terminal; a component that colors itself without going through the theme; changing an activity or
control glyph requiring a behavior edit or changing a hit target.

**Verification:** `bun test src/modules/theme/ThemeIcons.test.ts
src/modules/ui/PanelHeading.test.ts && bun scripts/harness/smoke-activitybar-harness.ts`; grep for
hard-coded colors/glyphs outside `theme`.

**Status:** provisional

**Last refined:** 2026-07-26

### Completion is proven not declared

**Invariant:** If a milestone or the project is called done, then a set of green evidence
artifacts says so — never the builder's self-assessment; the final sign-off comes from
independent reviewers told to refute.

**Scope:** Every milestone gate and the final Definition of Done.

**Mechanism:** The completion gate (implementation-plan §5.1): traceability matrix, invariant
checker, resource-lifecycle audit, recorded benchmarks, an independent subagent panel, and a
completeness critic dry twice — each a checkable artifact.

**Generates:** The layered verification model; the subagent cross-check; the completion gate;
`project.verification-results.md` and the traceability matrix.

**Evidence:** `project.implementation-plan.md` §5 (the completion gate + layered verification + subagent
panel). Enforced at every gate.

**Impossible if true:** A milestone declared done because "it works"; the author certifying
their own work at the gate; a requirement with no verification procedure counting as covered.

**Verification:** The gate itself — the six artifacts are green, and the panel carries no
unresolved critical/high finding.

**Status:** provisional

**Last refined:** 2026-07-21

### Core modules are contract-governed

**Invariant:** If a module is on the governed list below, then it carries a colocated
`<module>.invariants.md` contract and changes to it are reviewed against that contract.

**Scope:** The modules under `src/modules/`. Governed set (contract bootstrapped at its
milestone, hardest-first):

- M1: `app`, `kernel`, `system`
- M2: `workspace`, `storage`, `editor`, `syntax`, `theme`
- M3: `editor` (editing), `storage` (piece table / undo)
- M4: `git`, `diff`
- M5: `lsp`, `diagnostics`
- M6: `markdown`
- M7: `kernel` (composition), `commands`, `keybindings`
- Added canvas plugins: `filetree`

**Mechanism:** The `/invariants` skill derives review scope from colocated contracts; a contract
next to the module makes changes to it implicate its rules. Module contracts are bootstrapped
per milestone (grounded, not vacuous), never all up front.

**Generates:** The per-module bootstrap queue; the milestone invariant-loop cadence; the review
gate on every governed diff.

**Evidence:** This governance record + the module tree under `src/modules/`; both project
contracts pass `check_invariants.mjs`.

**Impossible if true:** A governed module with no contract file; a module silently dropped from
this list without a recorded decision.

**Verification:** For each governed entry at/after its milestone, the contract file exists and
the checker passes; `--refs` resolves its annotations.

**Status:** provisional

**Last refined:** 2026-07-21

### A pane is a self-contained scrollable viewport

**Invariant:** A pane is a scrollable viewport whose scroll extent (max-scroll) and offset are a
function of ITS OWN content and ITS OWN live rendered height ALONE — independent of any sibling pane.
No pane reads or mutates another pane's geometry (height, width, scroll). Composing panes — a split, a
diff, a preview beside an editor — adds panes; it NEVER alters an existing pane's geometry.

**Scope:** The editor, the side-by-side diff (two panes), and any future split-pane / preview layout.
Every region a user scrolls independently is a pane.

**Components:**
- *Own live height* — a pane derives max-scroll = max(0, totalRows − liveHeight) from its OWN
  rendered height, read post-layout each frame (never a stale, captured, or sibling height).
- *Own content extent* — totalRows is the pane's own content: document.lineCount (wrap off) or
  EditorWrap.totalVisualRows (wrap on). Never a sibling's or a pre-wrap count.
- *No sibling mutation* — mounting/unmounting a pane must not remove, resize, or reparent another
  pane's container. Panes sit side by side (or stacked) as peers; none is a mutable singleton others swap.

**Mechanism:** Each pane owns its container renderable + its Viewport (scrollTop/height/width →
extent + momentum). The editor is ONE pane; the diff is TWO panes plus a SEPARABLE aligned-row sync
layer (DiffAlignment) driving both from one coordinate — strip the sync and two independent working
panes remain. Layout composition (flex/split) gives each pane its own live box; no pane's code touches
another's box.

**Generates:** The editor viewport; the split-pane substrate; the side-by-side diff (2 panes + sync);
future preview/outline-beside-editor layouts.

**Evidence:** `src/modules/ui/RootView.ts` (`syncDiffView` swaps editorArea↔diffContainer by add/remove
in editorColumn; each pane owns its own container + Viewport); the `pane-independence` driven contract
in `scripts/behavioral-contracts.sh` — reach the editor's true last line, open a change diff (Ctrl+G →
`o`), close it, and assert the editor still reaches the SAME true last line at the SAME max-scroll
(the diff mount does not corrupt the editor pane). Drive-verified: editorScrollTop 85 before and after,
PLINE-119 rendered both times.

**Impossible if true:** Opening or closing a sibling pane changing another pane's max-scroll or offset;
a pane that can't reach its true last row because a sibling's mount corrupted its height (the DiffView
editorArea-swap regression, fae9349 — reverted d01873f); one pane reading another's height for its own
scroll math; a shared mutable container that panes swap in and out.

**Verification:** A gated behavioral contract — open a second pane (diff/split) and assert the first
pane's max-scroll and offset are UNCHANGED; close it and the first pane still reaches its true last line
(wrap on AND off); scroll pane A and pane B does not move (independence before sync); with sync on, both
diff panes track one aligned-row index while each underlying pane stays independently valid.

**Status:** provisional

**Last refined:** 2026-07-21

### Coverage may fall but never silently

**Invariant:** If the assertion or wait coverage of any test or harness smoke changes relative to
the merge base, then every count decrease is declared with exact before and after counts or the gate
fails, and every assertion-text replacement is reported for review.

**Scope:** Counts and normalized assertion-expression text in `*.test.ts` and
`scripts/harness/smoke-*.ts`, measured against the merge base, including whole-file removal.
Count decreases block unless the newest row for that path in `project.coverage-deltas.md` states matching
`assertions A → B, waits C → D` figures. Count-neutral assertion replacements are report-only.
Mutation probing and judging whether a declared reason is honest remain outside this instrument;
this gates disclosure, not justification.

**Mechanism:** Every other gate step answers "does the suite pass?"; none answered "is the suite still
as strong as it was?". `scripts/check-coverage-ratchet.ts` walks the TypeScript AST of every
`*.test.ts` and `scripts/harness/smoke-*.ts` at both HEAD and the merge base, counts calls that prove
(`requireCondition`, `expect`, `pass`, `assertContentInvariantAcrossAction`) and calls that wait for an
observed condition (`awaitStatus`, `awaitGridCondition`, `awaitSnapshot`, `it`, `test`), and fails on
any decrease whose newest `project.coverage-deltas.md` row is absent, malformed, or numerically stale. It
also compares normalized assertion-expression token sets and prints disappeared and appeared texts
as an informational census. A known-count positive-control fixture must count correctly before the
comparison, and inspecting zero coverage-bearing files fails. Growth needs no bookkeeping. Counting
walks the AST rather than matching text so a mention in a comment or a string can never inflate a
floor that honest code then cannot meet. This is a ratchet with an auditable unlock, not a
prohibition: removal stays possible — assertions do become unsound and features do get deleted — but
it becomes a diff to a file named for exactly that purpose.

**Generates:** A visible record of every claim the suite has ever given up, with its reason; a gate
that resists the one cheap move available to an agent under pressure to go green; symmetric detection
of the opposite failure, where a builder's fixes never land and the assertion count silently drops.

**Evidence:** `scripts/check-coverage-ratchet.ts`;
`scripts/fixtures/coverage-ratchet-positive-control.ts.fixture`;
`scripts/check-coverage-ratchet.test.ts` (counting through the namespace seam, comments and strings
excluded, every occurrence counted rather than every distinct name, exact declaration figures,
normalized replacement census, positive control); the gate's `coverage ratchet` step.
Drive-verified 2026-07-25 with negative controls in both directions: deleting one
`requireCondition` from the git-blame smoke failed with
`7 assertions / 10 waits -> 6 assertions / 10 waits`; removing `RelativeTime.test.ts` entirely failed
with `(FILE REMOVED) 14 assertions / 8 waits -> 0 assertions / 0 waits`; declaring either in
`project.coverage-deltas.md` passed; a clean tree passed. Re-verified 2026-07-26 with a temporary committed
real assertion deletion and a wrong-numbered declaration; the checker rejected the declared figures
against the actual figures.

**Impossible if true:** An agent turning a red gate green by deleting the failing assertion; a smoke
whose fixes were never committed passing review because the gate ran a dirtier worktree; a whole test
file disappearing in a refactor with no record; a removed claim whose reason exists only in a commit
message nobody re-reads; a stale path-only or wrong-numbered declaration authorizing a later decrease;
a count-neutral assertion replacement remaining invisible; the checker reporting success after its
positive control fails or after it inspects zero files.

**Verification:** `bun scripts/check-coverage-ratchet.ts` on a clean tree exits 0; delete any single
assertion and it exits 1 naming the file and count delta; add matching figures to
`project.coverage-deltas.md` and it exits 0; make either figure stale and it exits 1 naming declared and
actual figures. Replace an assertion without changing the count and inspect the informational census.
Remove or corrupt the positive-control fixture, or supply a base with zero coverage files, and the
checker exits 1. `bun test scripts/check-coverage-ratchet.test.ts` covers the counter itself.

**Status:** provisional

**Last refined:** 2026-07-26
