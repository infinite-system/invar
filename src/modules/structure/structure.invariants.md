# Structure — Module Invariants

The structure navigator: the active document's symbol outline as a primary-dock pane, fed by a
provider-registered structure source and navigable back into the editor. This contract governs
`src/modules/structure/`. It stands on the root `project.invariants.md` — in particular *Language
and git tools are separate failable processes*, *An async result can outlive the state it
described*, *Cost tracks the actively observed set*, *Plugin boundaries grant one authority*, and
*The host canvas is complete without plugins*.

Invariants are unnumbered — the name is the identifier, matched byte-for-byte by `// invariant:`
annotations. Chosen invariants stand on reality invariants, never the reverse.

## Reality-based invariants

### Symbol structure is analyzer knowledge

**Invariant:** If a document's symbol outline (functions, classes, sections) is wanted, then it
must come from a language analyzer — an external, failable source that may be absent for a file
type, refuse a document, answer slowly, answer for older text, or cap its answer; the editor's
text buffer alone cannot produce it.

**Scope:** Every consumer of outline data in `src/modules/structure/`. Not syntax highlighting,
which is a token-level concern with its own engine.

**Renegotiable at:** the language-tooling boundary — a built-in parser per language would move
the source in-process, but it would still be per-language, still failable on malformed text, and
still absent for languages nobody wired; the seam's shape would not change.

**Mechanism:** Stands on *Language and git tools are separate failable processes*. A symbol tree
is a semantic fact about a language, not a property of the character stream. Whatever produces
it (an LSP server today) runs outside the text path, can be missing or slow, and answers about
the revision it was asked about, not the one on screen when the answer lands.

**Generates:** The `StructureSource` seam with its `null`-versus-empty answer split; the stated
empty affordances; the revision-staleness guards; the `truncated` flag on capped answers.

**Evidence:** `src/modules/structure/StructureSource.interface.ts` (the contract's own doc
comment); `src/modules/lsp/LanguageClient.ts` (`documentSymbols` — guarded, revision-stamped,
capped); `src/modules/structure/StructureOutline.ts` (`refresh` discards superseded and stale
answers).

**Impossible if true:** An outline derived synchronously from the text buffer with no source
installed; a pane that assumes an answer always arrives, or that an arrived answer describes the
current text.

**Verification:** `bun test src/modules/structure/StructureOutline.test.ts` and
`bun test src/modules/lsp/LanguageClient.documentSymbols.test.ts`.

**Status:** provisional

**Last refined:** 2026-07-29

## Chosen invariants

### The structure navigator is a pane content citizen

**Invariant:** If the structure navigator is installed, then it is an ordinary contribution: a
manifest row (`structure-navigator`) registering one primary-dock pane content (`structure`),
its keybindings, its commands, and its status projection through the same
`ApplicationContributionContext` seams every citizen uses — zero host edits — and uninstalling
it withdraws all of it while a reinstall rebuilds all of it from the same context.

**Scope:** `StructurePlugin`, `StructurePaneContent`, and their registration through
`DefaultPlugins`. Install, uninstall, and reinstall of the Structure Navigator extension.

**Components:**
- *A cells citizen* — the pane returns a `StyledText` from `render`; it owns no renderable and
  declares no native surface.
- *Withdrawal is total* — `disposeApplication` releases the commands and the status projection;
  the host unregisters the pane, keybindings, and settings scoped to the activation; each
  workspace contribution disposes its outline (timers, lifecycle registration, watch effects).
- *The projection is absent, not stale* — with the plugin uninstalled the `structure*` status
  keys are gone, so nothing reports rows nobody can see.
- *Reinstall rebuilds* — a second activation registers a fresh pane and a live projection; no
  state is retained between lives.

**Mechanism:** Stands on *Plugin boundaries grant one authority* and *The host canvas is
complete without plugins*. The plugin holds every registration's disposer and calls them in
`disposeApplication`; `ApplicationContributions` reverses the host-scoped registrations; the
per-workspace outline is disposed through the workspace contribution lifecycle.

**Generates:** The manifest entry in `DefaultPlugins`; the Extensions toggle; the
uninstall/reinstall smoke arm; the `structure*` status keys.

**Rejected alternatives:** A host-mounted outline view in `RootView` — re-couples the host to a
plugin domain, the exact edit the capstone's done-test forbids.

**Evidence:** `src/modules/structure/StructurePlugin.ts`;
`src/modules/structure/StructurePaneContent.ts`; `src/modules/plugins/DefaultPlugins.ts`;
`src/modules/structure/StructurePlugin.test.ts`;
`scripts/harness/smoke-plugin-manifest-harness.ts` (the structure-navigator arm).

**Impossible if true:** A production file in `src/modules/ui`, `src/modules/app`, or
`src/modules/workspace` naming the structure module; a disabled Structure Navigator leaving a
pane, binding, command, or status key behind; a reinstall that cannot rebuild the pane.

**Verification:** `grep -rln "modules/structure/" --include='*.ts' src/modules/app
src/modules/workspace src/modules/ui | grep -v '\.test\.'` prints nothing;
`bun test src/modules/structure/StructurePlugin.test.ts`; and
`bun scripts/harness/smoke-plugin-manifest-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-29

### A structure source answers or declines, never blanks

**Invariant:** If the structure pane has no symbol rows to show, then it states why — no file
open, no source installed, no source for this file type, a source-stated refusal (a size
budget), no symbols in the document, or a truncated answer — and a source expresses "I cannot
answer" as `null` distinctly from "the document has no symbols" as an empty list. A blank
structure pane is impossible.

**Scope:** `StructureSource.interface.ts` (the answer contract), the workspace provider
registry, `StructureOutline` (the states), and `StructurePaneRenderer` (the stated
affordances). Both directions of install asymmetry: the pane without a source, and a source
without the pane.

**Components:**
- *Consumer-owned seam* — the interface lives in the consumer module. A source plugin imports
  it and registers through the type-blind workspace registry; neither plugin names the
  other's concrete class.
- *Registration is reversible* — `register` returns the disposer; the LSP provider's
  `disposed()` withdraws its source, and the pane degrades to its stated affordance; a
  re-registration restores it.
- *The host registry is reactive* — its revision signal re-resolves the pane when a source
  plugin is installed or uninstalled mid-session.

**Mechanism:** Stands on *Symbol structure is analyzer knowledge*. The outline maps each absent
answer to a named status plus a user-facing notice; the renderer paints a headline for every
rows-absent state; `null` routes through the source's own `structureNotice` so a deliberate
refusal (the LSP size budget) surfaces in the pane in the provider's own words.

**Generates:** The `no-document` / `unavailable` / `loading` / `ready` states; the notice text
the pane paints; the honest size-budget message on huge files; the truncation banner.

**Rejected alternatives:** A structure-owned source registry — duplicates the host registry's
identifier, lifetime, and reactivity generator. An empty pane for unsupported files — the
blank-lie shape the degraded-affordance precedent exists to prevent.

**Evidence:** `src/modules/structure/StructureSource.interface.ts`;
`src/modules/plugins/ProviderRegistry.ts`; `src/modules/structure/StructureOutline.ts`
(`applyEmpty` and the `null` branch of `refresh`);
`src/modules/structure/StructurePaneRenderer.ts` (`renderEmptyState`);
`src/modules/lsp/LspWorkspaceProvider.ts` (source registration and `structureNotice`).

**Impossible if true:** A structure pane painting nothing while installed; an uninstalled
Language Intelligence leaving the pane asking a disposed provider; a source forced to fake an
empty document to say "I cannot answer".

**Verification:** `bun test src/modules/structure/StructureOutline.test.ts
src/modules/structure/StructurePaneContent.test.ts
src/modules/lsp/LspWorkspaceProvider.test.ts`.

**Status:** provisional

**Last refined:** 2026-07-29

### Outline cost tracks the observed document

**Invariant:** If the structure pane is not observed (hidden dock, another dock content, an
inactive workspace), then no source request is issued at any document size; and when it is
observed, requests are issued per observed document change — debounced across rapid edits,
revision-stamped, with stale answers discarded and the request count published as a
load-invariant observable.

**Scope:** `StructureOutline.refresh` and its scheduling; the `paneIsObserved` gate injected by
`StructurePlugin`; the `structureRequests` status key. Not the source's own cost controls (the
LSP size budget), which are the provider's.

**Mechanism:** Stands on *Cost tracks the actively observed set* and *An async result can
outlive the state it described*. One fingerprint watch funnels observation, document identity,
document revision, and source installation into one debounced refresh; the refresh returns
before requesting when unobserved; responses are generation- and revision-guarded so an answer
for replaced text never paints; rendering slices only the visible window of rows.

**Generates:** The `isObserved` gate; the 30ms switch and 350ms edit debounce windows; the
`structureRequests` count a smoke asserts instead of a wall-clock; the windowed renderer.

**Rejected alternatives:** Refreshing on every edit while hidden — pays a request stream for a
pane nobody sees. Refreshing inside `render` — a paint with a side effect, and the host only
calls `render` when visible anyway.

**Evidence:** `src/modules/structure/StructureOutline.ts` (`refresh`, `refreshFingerprint`,
`scheduleRefresh`); `src/modules/structure/StructurePlugin.ts` (`paneIsObserved`);
`src/modules/structure/StructurePaneRenderer.ts` (the window slice). Driven: a 10-line and a
500,000-line unsupported file both publish `structureRequests=0` with the pane shown and the
same stated affordance; a 38 MB supported file costs one declined request and the stated size
notice.

**Impossible if true:** A hidden structure pane issuing symbol requests; an edit storm issuing
one request per keystroke; a stale answer painting over newer text; outline work that grows
with file size for a file the source declines.

**Verification:** `bun test src/modules/structure/StructureOutline.test.ts` (the unobserved and
stale-answer cases) and the scale drives recorded in
`.invar/tasks/in-progress/35-structure-navigator-plugin-pane/drive-35-structure-pane.sh`.

**Status:** provisional

**Last refined:** 2026-07-29

### Symbol selection jumps through the source-text view contract

**Invariant:** If a symbol row is activated (Enter, Space, or a click), then the editor lands on
that symbol through the existing source-text view contract — `placeCursor` on the symbol's name,
`revealCursor`, focus returned to the editor — with the departure and the landing both recorded
in the navigation history, exactly as `goToDefinition` records its jump; and with no row to
activate the gesture is a no-op, never a crash.

**Scope:** `StructureOutline.activateSelected` and the pane's Enter/Space/click paths. Not
cross-file jumps — the outline describes the active document only.

**Mechanism:** Stands on *Plugin boundaries grant one authority*: the plugin asks the workspace
to move its own cursor through public members (`recordCurrentLocation`, `editor.placeCursor`,
`editor.revealCursor`, `focusEditor`); it opens no parallel navigation path and touches no view
internals. The row's line/column are the symbol's selection anchor, converted to grapheme
columns at the LSP boundary.

**Generates:** `StructureOutline.activateSelected`; the `structure.activate` command and its
Enter/Space bindings; the pointer-down activation.

**Rejected alternatives:** A parallel cursor/reveal path in the structure module — two openers
would drift on focus and history semantics, the same reason `goToDefinition` reuses
`openFileInTab`.

**Evidence:** `src/modules/structure/StructureOutline.ts` (`activateSelected`);
`src/modules/structure/StructurePaneContent.ts` (`onPointerDown`);
`src/modules/structure/StructurePlugin.ts` (`structure.activate`);
`src/modules/structure/StructureOutline.test.ts` (the jump assertions).

**Impossible if true:** A symbol activation that moves the cursor without recording the jump for
Back/Forward; a second cursor-placement implementation in the structure module; a crash from
activating an empty outline.

**Verification:** `bun test src/modules/structure/StructureOutline.test.ts` and the driven jump
in `bun scripts/harness/smoke-plugin-manifest-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-29
