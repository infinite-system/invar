# Inline Rewrite — Invariants

Load-bearing rules for `src/modules/inline-rewrite/`, its `RewriteProvider`
seam in `src/modules/lsp/`, and the generic editor contribution boundary it
uses. Stands on `project.invariants.md`.

## Reality-based invariants

### Stale rewrites never land

**Invariant:** If a rewrite response returns after its document revision or
request generation has changed, then it is stale and produces no proposal.

**Scope:** Requests crossing from `InlineRewrite` through `RewriteProvider`
and back into proposal state.

**Mechanism:** `InlineRewrite.requestFor` captures the document revision and
request generation before awaiting the provider. It compares both values with
the live values before publishing candidates.

**Generates:** Revision stamps; request generations; stale-result discard.

**Evidence:** `InlineRewrite.ts`; `InlineRewrite.test.ts`; the stale-response
phase in `scripts/harness/smoke-inline-rewrite-harness.ts`.

**Impossible if true:** A candidate computed for revision N becoming visible
after the document has advanced to revision N+1.

**Verification:** `bun test src/modules/inline-rewrite/InlineRewrite.test.ts
-t "older document revision" && bun
scripts/harness/smoke-inline-rewrite-harness.ts`.

**Status:** established

**Last refined:** 2026-07-26

## Chosen invariants

### Only one rewrite request runs

**Invariant:** If a rewrite request starts while another rewrite request is in
flight, then the older request is cancelled before the newer request becomes
authoritative.

**Scope:** `InlineRewrite` request ownership and `CodexRewriteProvider`
child-process ownership for one editor.

**Mechanism:** `InlineRewrite.requestFor` aborts its current controller before
installing the next one. `CodexRewriteProvider.rewrite` independently
terminates its active process before spawning another, and the request
generation makes a raced promise inert.

**Generates:** One active abort controller; one active Codex child; disposal
that terminates inference.

**Evidence:** `InlineRewrite.ts`; `InlineRewrite.test.ts`;
`src/modules/lsp/CodexRewriteProvider.ts`;
`src/modules/lsp/CodexRewriteProvider.test.ts`.

**Impossible if true:** Two rewrite children owned by one editor; an older
request becoming visible after a newer request starts.

**Verification:** `bun test src/modules/inline-rewrite/InlineRewrite.test.ts
src/modules/lsp/CodexRewriteProvider.test.ts`.

**Status:** established

**Last refined:** 2026-07-26

### Proposals preserve source text

**Invariant:** If a rewrite proposal is visible and accept has not run, then
every source character remains painted and every ordinary editor edit still
mutates the document.

**Scope:** `InlineRewriteWorkspace` proposal presentation, the generic
`EditorContributions` projection, `EditorPaneRenderer`, and editor mutation
paths. Explicit accept is the only proposal action that changes source.

**Mechanism:** `EditorPaneRenderer` always paints `editor.document` and only
appends `EditorContributions.lineEndChunks` after the source row.
`InlineRewriteWorkspace.recordOrdinaryEdit` dismisses proposal state, while
typing is recorded only after the edit lands. Accept alone calls
`Editor.replaceRangeAsUndoStep`.

**Generates:** Side-by-side proposal text; typing-through behavior; one-step
accept; Tab remaining indentation.

**Evidence:** `InlineRewriteWorkspace.ts`;
`InlineRewriteWorkspace.test.ts`; `src/modules/editor/Editor.ts`;
`src/modules/ui/EditorPaneRenderer.ts`; the typed and accept phases in
`scripts/harness/smoke-inline-rewrite-harness.ts`.

**Impossible if true:** A proposal that occludes or replaces user content
outside explicit accept; a visible proposal swallowing a printable character;
Tab accepting a proposal instead of indenting.

**Verification:** `bun test
src/modules/inline-rewrite/InlineRewriteWorkspace.test.ts
src/modules/editor/Editor.test.ts && INVAR_INLINE_REWRITE_REPRO=typed bun
scripts/harness/smoke-inline-rewrite-harness.ts`.

**Status:** established

**Last refined:** 2026-07-26

### Disabled rewrites observe nothing

**Invariant:** If the contributed setting is false or the contributor is
disabled, then no rewrite controller, provider, timer, editor contribution,
or rewrite-driven frame exists.

**Scope:** `InlineRewriteContributor`, `InlineRewriteWorkspace`,
`ApplicationContributions` disable and re-enable, the contributed setting,
and the generic editor contribution registry.

**Mechanism:** The setting's `changed` callback registers the editor
contribution only when enabled. Disabling unregisters it and disposes every
controller, which aborts requests and timers; disabling the plugin also
removes commands, keybindings, guards, settings, status projection, and its
workspace contribution. The host reads only the empty generic registry.

**Generates:** Lazy provider construction; complete Extensions symmetry; a
feature-off frame graph with no rewrite refs.

**Evidence:** `InlineRewriteContributor.ts`; `InlineRewriteWorkspace.ts`;
`InlineRewriteWorkspace.test.ts`;
`src/modules/app/ApplicationContributions.ts`;
`scripts/harness/smoke-inline-rewrite-harness.ts` feature-off and
plugin-disabled modes; `scripts/harness/smoke-plugin-manifest-harness.ts`.

**Impossible if true:** A disabled setting or disabled contributor retaining
a rewrite timer, provider, reactive editor read, or command; a disabled
inline rewrite setting or disabled plugin causing a frame after the
application has settled.

**Verification:** `INVAR_INLINE_REWRITE_REPRO=disabled bun
scripts/harness/smoke-inline-rewrite-harness.ts &&
INVAR_INLINE_REWRITE_REPRO=plugin-disabled bun
scripts/harness/smoke-inline-rewrite-harness.ts && bun
scripts/harness/smoke-plugin-manifest-harness.ts`.

**Status:** established

**Last refined:** 2026-07-26

### One contributor owns rewrites

**Invariant:** If inline rewrite is installed, then its setting, commands,
keybindings, guard, triggers, presentation, status, and workspace controllers
are registered and removed by `InlineRewriteContributor`.

**Scope:** The application plugin catalog and the generic application,
workspace, editor, command, setting, keybinding, presentation, and status
contribution seams.

**Mechanism:** `DefaultPlugins.create` installs one
`InlineRewriteContributor`. Host modules expose generic contribution ports and
contain no inline-rewrite identifier; `ApplicationContributions` owns reverse
order disposal of every registration.

**Generates:** One plugin authority; host vocabulary independent of the
feature; disable and re-enable symmetry.

**Evidence:** `InlineRewriteContributor.ts`;
`src/modules/plugins/DefaultPlugins.ts`;
`src/modules/app/ApplicationContributions.ts`;
`src/modules/editor/EditorContributions.ts`.

**Impossible if true:** A host command table, canonical binding table,
settings schema, editor model, or root view naming inline rewrite; disabling
the contributor leaving one of its registrations active.

**Verification:** `bun scripts/ast-query.ts identifiers inlineRewrite --tests
--path src/modules/app && bun scripts/ast-query.ts identifiers inlineRewrite
--tests --path src/modules/editor && bun scripts/ast-query.ts identifiers
inlineRewrite --tests --path src/modules/workspace && bun
scripts/ast-query.ts identifiers inlineRewrite --tests --path src/modules/ui
&& bun scripts/ast-query.ts identifiers inlineRewrite --tests --path
src/modules/keybindings`.

**Status:** established

**Last refined:** 2026-07-26
