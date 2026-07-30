# Syntax — Module Invariants

The immediate lexical syntax layer. It turns a document into language regions and lossless
role spans without blocking editor paint. This contract governs `src/modules/syntax/`. It stands
on `project.invariants.md`, especially *The immediate layer never blocks the deferred layer*,
*Cost tracks the actively observed set*, *Plugin boundaries grant one authority*, and *Seams are
drawn at the shared generator*.

## Reality-based invariants

### Embedded documents have more than one syntax language

**Invariant:** If one document embeds languages, then its syntax is a set of source-defined
regions, not one language inferred from the path.

**Scope:** Document syntax selection for rendering, diff projection, folding, bracket matching,
hover code roles, and rewrite requests. Ordinary single-language files use one fallback region.

**Renegotiable at:** The supported document formats. This invariant disappears only if Invar
stops supporting embedded-language documents.

**Mechanism:** A file extension identifies the outer format only. An embedded block can use a
different lexer, and two blocks in the same file can declare different languages.

**Generates:** `DocumentSyntaxSource`, normalized regions, `languageAtLine`, and shared line spans.

**Evidence:** `src/modules/syntax/DocumentSyntaxSource.interface.ts`;
`src/modules/syntax/DocumentSyntax.ts`; `src/modules/vue/VueSyntaxSource.ts`;
`src/modules/vue/VueSyntaxSource.test.ts`.

**Impossible if true:** Every line in an embedded document being tokenized with the outer
language, or each syntax consumer implementing its own block parser.

**Verification:** `bun test src/modules/vue/VueSyntaxSource.test.ts`.

**Status:** provisional

**Last refined:** 2026-07-29

## Chosen invariants

### Document syntax has one removable host port

**Invariant:** If a plugin supplies document syntax, then it registers one
`document-syntax-source` provider through the workspace registry; resolution selects the newest
source that supports the document, registration changes invalidate the selection cache, and
withdrawal exposes the ordinary fallback without a concrete plugin reference in a consumer.

**Scope:** `DocumentSyntax`, `ProviderRegistry`, syntax-source workspace contributions, and every
consumer of `DocumentSyntaxReader`.

**Components:**
- *One registry* — syntax uses the workspace's existing type-blind provider registry.
- *One selection* — `DocumentSyntax` caches the supporting source by document and registry
  revision.
- *One fallback* — `LanguageRegistry` and `Highlighter` serve ordinary files and unsupported
  documents.
- *Symmetric withdrawal* — the workspace contribution's provider disposer removes every source
  registration.

**Mechanism:** The host owns provider lifetime and selection. A format plugin owns its support
predicate, region parser, and span generator. Consumers receive only the reader port.

**Generates:** `DocumentSyntax`; the `document-syntax-source` capability; the fallback mapping;
source attachment to editor views, diff projection, folding, and bracket matching.

**Rejected alternatives:** A registry inside the syntax module, which duplicates host lifetime;
format checks inside renderers, which duplicate the region generator; a permanent format entry in
`LanguageRegistry`, which survives plugin withdrawal.

**Evidence:** `src/modules/syntax/DocumentSyntax.ts`;
`src/modules/workspace/Workspace.ts`; `src/modules/plugins/ProviderRegistry.ts`;
`src/modules/editor/EditorPaneRenderer.ts`; `src/modules/editor/CodeFolding.ts`;
`src/modules/editor/BracketMatch.ts`; `src/modules/diff/DiffView.ts`;
`src/modules/vue/VueSyntaxSource.test.ts`.

**Impossible if true:** A `.vue` condition in a generic renderer; disabling a format plugin while
its regions still resolve; a later source shadowing an earlier source for documents it declines.

**Verification:** `bun test src/modules/vue/VueSyntaxSource.test.ts
src/modules/editor/BracketMatch.test.ts src/modules/editor/CodeFolding.test.ts`.

**Status:** provisional

**Last refined:** 2026-07-29

### Syntax work follows visible lines and document revisions

**Invariant:** If syntax spans are requested repeatedly, then source selection is cached by
document and registry revision, format parsing is cached by document and text revision, and line
tokenization runs only for requested lines or windows.

**Scope:** Immediate syntax rendering and format-source parsing. Whole-document semantic analysis
belongs to deferred language services.

**Mechanism:** `DocumentSyntax` memoizes source selection. Each source memoizes its normalized
region map. Renderers request only the visible logical lines, then slice lossless spans for wrap,
horizontal scroll, find, and decoration boundaries.

**Generates:** Weak document caches; source revision keys; lossless `Span` lists; no provider scan
or SFC parse per visible row.

**Rejected alternatives:** Parsing at every `spansForLine` call, which makes viewport height
multiply whole-document work; tokenizing sliced text, which loses comment and string context.

**Evidence:** `src/modules/syntax/DocumentSyntax.ts`;
`src/modules/vue/VueSyntaxSource.ts`; `src/modules/editor/EditorPaneRenderer.ts`;
`src/modules/diff/DiffView.ts`; `src/modules/vue/VueSyntaxSource.test.ts`.

**Impossible if true:** Ten visible lines causing ten SFC parses at one revision; horizontal
scroll changing the lexical role of an unchanged character.

**Verification:** `bun test src/modules/vue/VueSyntaxSource.test.ts
src/modules/syntax/Highlighter.test.ts` and
`bun scripts/harness/smoke-comment-styling-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-29
