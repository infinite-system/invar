# TUI Code Workspace — Invariant Lattice

How the project invariants hold **together**. Derived from `project.invariants.md`, never
legislative — where this disagrees with the records, the records win and the finding is against
this file.

## Dependency map — chosen stands on reality

```
The terminal shows a bounded viewport ─────┐
A referenced resource stays alive ─────────┼─► Cost tracks the actively observed set
                                            └─► (component) A resource lives only while observed

Eager circular runtime reads fail during init ─► Imported dependencies are read late

Public classes use the namespace pattern ─┬─► Subclasses extend raw namespace classes
                                         ├─► Construction goes through overridable seams
                                         └─► The app is built only after the kernel is sealed

An async result can outlive the state it described ─┬─► Async results are revision-stamped and stale results discarded
Language and git tools are separate failable processes ─┴─► The immediate layer never blocks the deferred layer

Terminal color and glyph support varies ─► Appearance is data with a capability fallback
A text position has several encodings ──► (guards editor/syntax/lsp coordinate handling)
Terminals report key repeat not key up ─► (guards arrow-acceleration in editor)
```

Import-style references (anchors are identity):

- [Cost tracks the actively observed set][cost] stands on [bounded viewport][vp] + [referenced resource stays alive][alive]
- [Imported dependencies are read late][late] stands on [eager circular reads fail][circ]
- [Public classes use the namespace pattern][namespace] supplies the live `Class`-slot component of [Construction goes through overridable seams][seam] and the selection slots finalized by [The app is built only after the kernel is sealed][seal]; the `createX()` factory component remains a separate construction rule
- [Subclasses extend raw namespace classes][raw-extends] preserves the raw
  inheritance side of [Public classes use the namespace pattern][namespace];
  construction continues through the selected `Class` side
- [The immediate layer never blocks the deferred layer][imm] + [Async results are revision-stamped and stale results discarded][rev] stand on [separate failable processes][proc] + [async outlives state][async]
- [Appearance is data with a capability fallback][appear] stands on [color and glyph support varies][glyph]

## Compositions — emergent guarantees

### Memory scales with the visible set, not the file

**Members:** [Cost tracks the actively observed set][cost] · [Derived state is a plain getter
unless caching is proven][getter] · [Data flows one way][flow] — on [bounded viewport][vp] +
[referenced resource stays alive][alive].
**Guarantee:** opening a 100k-line file or 20M-cell grid costs what a screenful costs; memory
stays flat as content grows and returns to baseline after close.
**Mechanism of conjunction:** compact columnar ground truth + a single frame effect that pulls
only the visible window + plain-getter derivation (no per-item reactive object) + explicit
eviction of cold overlays. Remove any one and cost re-couples to what exists, not what is seen.
**Breaks if:** a reactive object per cell/line/token appears; a `computed()` proliferates per
item; eviction is dropped; the render effect reads beyond the window.

### The editor never freezes on a backend

**Members:** [The immediate layer never blocks the deferred layer][imm] · [Async results are
revision-stamped and stale results discarded][rev] — on [separate failable processes][proc] +
[async outlives state][async].
**Guarantee:** typing, cursor, and Tree-sitter highlighting stay responsive and correct no
matter how slow, absent, or crash-prone LSP/git/ESLint are.
**Mechanism of conjunction:** the immediate layer proceeds without awaiting the deferred layer;
whatever the deferred layer eventually returns is applied only if it still matches the current
revision. Remove non-blocking and typing stalls; remove revision-stamping and a late result
corrupts current state.
**Breaks if:** any input path awaits a subprocess; any async result is applied without a
revision check.

### The cyclic module graph boots deterministically

**Members:** [Public classes use the namespace pattern][namespace] ·
[Subclasses extend raw namespace classes][raw-extends] · [Imported
dependencies are read late][late] · [Construction goes through overridable
seams][seam] · [The app is built only after the kernel is sealed][seal] — on
[eager circular reads fail][circ].
**Guarantee:** the entity web (panes ↔ app root ↔ workspaces) closes into cycles yet boots
under any module order, and plugins compose deterministically before any instance exists.
**Mechanism of conjunction:** the namespace gives every public class raw `$Class` and selected
`Class` forms; late reads keep cycles from breaking at load; the mutable `Class` slot lets the
kernel compose; sealing-before-construct means every instance sees the final class graph. Remove
the namespace form and the class graph loses its uniform selection seam;
extend the selected `Class` and method dispatch becomes access-order-dependent;
remove late reads and load order matters; construct before seal and instances
predate their plugins.
**Breaks if:** a `X.Class` is snapshotted at module scope; an instance is built during plugin
registration.

### Appearance degrades, never breaks

**Members:** [Appearance is data with a capability fallback][appear] — on [color and glyph
support varies][glyph].
**Guarantee:** the UI is legible on any terminal from truecolor+nerd-font down to 16-color+ascii.
**Mechanism of conjunction:** palettes/icons are data resolved through capability ladders at
render, so a weaker terminal quantizes rather than corrupts.
**Breaks if:** any component hard-codes a color or glyph outside `theme`.

### One-line text editing cannot drift

**Members:** [Editable text fields share one input model][text-input] ·
[Seams are drawn at the shared generator][shared].
**Guarantee:** every one-line field has the same grapheme-safe caret movement and deletion
vocabulary while each surface keeps its own filtering, layout, selection, and navigation.
**Mechanism of conjunction:** `TextInputModel` owns the shared editing generator and consumers wire
it in without inheriting surface-specific behavior. Remove the model and fields reimplement edits;
move filtering or layout into it and consumers must suppress core behavior.
**Breaks if:** a field stores a second caret/query and edits it locally; `TextInputModel` gains
surface-specific result lists, wrapping, or history.

### Done is trustworthy

**Members:** [Completion is proven not declared][done] · [Core modules are contract-governed][gov]
· [Coverage may fall but never silently][ratchet].
**Guarantee:** "done" means independently-verified evidence, not the builder's word — across a
governed set of modules whose contracts are checked, and the evidence cannot quietly shrink to
make "done" easier to reach.
**Mechanism of conjunction:** the completion gate's six green artifacts + per-module contracts
the checker enforces + an independent refuting panel + a ratchet that fails on undeclared loss of
assertions. Remove governance and coverage is unknown; remove the panel and the author certifies
themselves; remove the ratchet and the cheapest route to green is deleting the assertion that
proves the claim — which is invisible to every other member, since a suite that asserts less still
passes.
**Breaks if:** a milestone is called done on self-assessment; a governed module lacks a contract; an
assertion disappears with no record naming it.

### Panes compose without corrupting each other

**Members:** [A pane is a self-contained scrollable viewport][pane] — on [bounded viewport][vp] +
[Data flows one way][flow].
**Guarantee:** the editor, the side-by-side diff, and any future split-pane each scroll correctly and
INDEPENDENTLY; opening or closing one pane never changes another pane's scroll extent or offset. The
diff is 2 panes + a separable aligned-row sync layer — strip the sync and two working panes remain.
**Mechanism of conjunction:** each pane owns its container + Viewport and derives max-scroll from its
OWN live post-layout height + OWN content extent; no pane's code reads or mutates a sibling's geometry.
Composition adds peer panes; it never swaps a shared mutable container.
**Breaks if:** a pane reads a sibling's height for its scroll math; a mount swaps/reparents another
pane's container (the DiffView editorArea-swap that globally corrupted editor scroll — fae9349, reverted
d01873f); the sync layer is tangled into the pane substrate instead of layered on top.

### Plugins carry domains without shrinking the host

**Members:** [The host canvas is complete without plugins][canvas] · [Construction goes through
overridable seams][seam] · [Seams are drawn at the shared generator][shared].
**Guarantee:** shipped domain capabilities can be default plugins while the workspace and
application hosts remain usable and domain-agnostic.
**Mechanism of conjunction:** the host owns complete contribution surfaces; construction injects
plugins at the process edge; seams exist only where multiple customers share a generator.
**Breaks if:** host core imports a concrete plugin; disabling plugins prevents opening or editing a
file; a one-customer abstraction replaces a domain boundary.

## The generated system

Because the **terminal shows a bounded viewport** and **cost tracks the actively observed set**
and **data flows one way**, the editor *must* be flyweight-shaped: compact ground truth, a
single frame effect, viewport-pull rendering — a per-line/per-cell object model is not a style
choice it rules out, it is a guarantee it forbids.

Because **language and git tools are separate failable processes** and **the immediate layer
never blocks the deferred layer**, the architecture *must* split an immediate syntactic layer
(Tree-sitter, synchronous, always present) from a deferred semantic layer (LSP/ESLint/git,
async, revision-stamped, optional) — the two-layer highlight/diagnostic design is derived, not
decorative.

Because **public classes use the namespace pattern**, every class has one stable domain name with
raw and selected forms whether it is reactive, static, or plain. Because **eager circular reads
fail during init**, cross-module runtime values are read late. Together with
**seal-before-construct**, those independent rules let the cyclic entity graph and plugin system
coexist.

Because **completion is proven not declared**, the build *must* carry an evidence gate and an
independent review panel — the verification model is generated by the invariant, not bolted on.

[cost]: project.invariants.md#cost-tracks-the-actively-observed-set
[getter]: project.invariants.md#derived-state-is-a-plain-getter-unless-caching-is-proven
[namespace]: project.invariants.md#public-classes-use-the-namespace-pattern
[raw-extends]: project.invariants.md#subclasses-extend-raw-namespace-classes
[late]: project.invariants.md#imported-dependencies-are-read-late
[seam]: project.invariants.md#construction-goes-through-overridable-seams
[seal]: project.invariants.md#the-app-is-built-only-after-the-kernel-is-sealed
[flow]: project.invariants.md#data-flows-one-way
[imm]: project.invariants.md#the-immediate-layer-never-blocks-the-deferred-layer
[rev]: project.invariants.md#async-results-are-revision-stamped-and-stale-results-discarded
[appear]: project.invariants.md#appearance-is-data-with-a-capability-fallback
[done]: project.invariants.md#completion-is-proven-not-declared
[gov]: project.invariants.md#core-modules-are-contract-governed
[ratchet]: project.invariants.md#coverage-may-fall-but-never-silently
[vp]: project.invariants.md#the-terminal-shows-a-bounded-viewport
[alive]: project.invariants.md#a-referenced-resource-stays-alive
[circ]: project.invariants.md#eager-circular-runtime-reads-fail-during-init
[async]: project.invariants.md#an-async-result-can-outlive-the-state-it-described
[proc]: project.invariants.md#language-and-git-tools-are-separate-failable-processes
[glyph]: project.invariants.md#terminal-color-and-glyph-support-varies
[pane]: project.invariants.md#a-pane-is-a-self-contained-scrollable-viewport
[shared]: project.invariants.md#seams-are-drawn-at-the-shared-generator
[text-input]: project.invariants.md#editable-text-fields-share-one-input-model
[canvas]: project.invariants.md#the-host-canvas-is-complete-without-plugins
