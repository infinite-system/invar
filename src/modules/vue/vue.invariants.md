# Vue — Module Invariants

The removable Vue single-file-component syntax contribution. This contract governs
`src/modules/vue/`. It stands on the syntax invariant *Embedded documents have more than one
syntax language* and the root invariants *Plugin boundaries grant one authority* and *A text
position has several encodings*.

## Reality-based invariants

### SFC block boundaries come from the SFC grammar

**Invariant:** If Vue block boundaries are needed, then a Vue SFC parser must identify them,
because tag-like text can occur inside block content and malformed input can change which closing
tag is grammatically active.

**Scope:** Discovery of script, template, style, and custom-block content ranges.

**Renegotiable at:** The Vue SFC grammar. A different conforming parser can replace
`vue/compiler-sfc`, but line patterns cannot become the grammar.

**Mechanism:** The compiler parses the whole SFC and publishes descriptor content ranges as UTF-16
offsets. The syntax source normalizes those offsets for editor consumers.

**Generates:** The compiler dependency, one descriptor parse per revision, and no regular-expression
block parser.

**Evidence:** `src/modules/vue/VueSyntaxSource.ts`; `src/modules/vue/VueSyntaxSource.test.ts`.

**Impossible if true:** A line regular expression deciding where an embedded block starts or ends.

**Verification:** `bun test src/modules/vue/VueSyntaxSource.test.ts`.

**Status:** provisional

**Last refined:** 2026-07-29

## Chosen invariants

### Vue syntax is a removable SFC contribution

**Invariant:** If Vue support is installed, then one application plugin registers one workspace
syntax source that parses SFC blocks with the installed `vue/compiler-sfc`; script, template,
style, and custom-block content receive their declared supported languages while block tags stay
Vue HTML, and uninstalling the plugin restores plain `.vue` behavior.

**Scope:** Vue SFC immediate highlighting. Vue language-server semantics, formatting, Structure,
and server folding are later contributions and are outside this invariant.

**Components:**
- *Compiler-owned parsing* — `vue/compiler-sfc` version `3.6.0-rc.1` supplies descriptor content
  offsets. No regular expression parses SFC block boundaries.
- *Normalized positions* — compiler UTF-16 offsets cross through `TextCoordinates` before regions
  publish editor grapheme positions.
- *Declared languages* — script defaults to JavaScript; `ts` and `tsx` use TypeScript; template
  defaults to Vue HTML; style defaults to CSS; `scss` uses the SCSS tokenizer; unsupported and
  custom block content stays plain.
- *Typing remains safe* — incomplete input uses whatever safe regions the compiler returns and
  otherwise keeps outer Vue or plain spans without throwing.
- *One revision cache* — descriptor and regions are built once for each document revision.

**Mechanism:** `VuePlugin` contributes `VueSyntaxSource` through the generic workspace provider
route. The source owns the `.vue` predicate and the SFC parser. Generic syntax consumers know
neither Vue nor the compiler.

**Rejected alternatives:** A `.vue` entry in `LanguageRegistry`, which survives uninstall and
flattens every block to one lexer; regular-expression block parsing, which cannot preserve SFC
grammar and malformed typing states; calling CSS support SCSS.

**Evidence:** `src/modules/vue/VuePlugin.ts`; `src/modules/vue/VueSyntaxSource.ts`;
`src/modules/syntax/Highlighter.ts`; `src/modules/vue/VueSyntaxSource.test.ts`;
`src/modules/syntax/Highlighter.test.ts`.

**Impossible if true:** Vue imports in the editor, workspace, folding, bracket, diff, or Structure
consumer; a script-setup TypeScript keyword painted as outer HTML; an SCSS line comment painted as
CSS; a `.vue` source still selected after Vue plugin withdrawal.

**Verification:** `bun test src/modules/vue/VueSyntaxSource.test.ts
src/modules/syntax/Highlighter.test.ts` and
`bun scripts/harness/smoke-comment-styling-harness.ts`.

**Status:** provisional

**Last refined:** 2026-07-29
