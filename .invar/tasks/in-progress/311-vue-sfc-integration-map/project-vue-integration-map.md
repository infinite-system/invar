# Vue SFC integration map

Date: 2026-07-29

Task: [Vue SFC integration map (#311)](task-311-vue-sfc-integration-map.md)

Status: research complete. No product code changed.

## Decision

Vue support must be one application plugin. It must attach through general host
ports. It must not add `.vue` branches to editor, workspace, or structure code.

The future Vue SFC implementation task has five ordered parts:

1. Add the missing syntax-source and plural language-service seams.
2. Ship block-aware highlighting as the first user-visible slice.
3. Prove the current Vue language-server and TypeScript bridge in a protocol
   spike.
4. Route the complete agreed language feature set through the generic language
   host.
5. Add Structure, formatting, and folding through consumer-owned ports.

The Vue plugin owns Vue-specific parsing, process selection, settings, and
notices. Generic hosts own routing, lifecycle, edits, and rendering.

“Full LSP support” needs a closed definition before implementation starts. This
map recommends the following required end state:

- diagnostics from script and template expressions;
- hover;
- completion;
- definition;
- references;
- document symbols;
- document formatting;
- folding ranges;
- correct `vue` document identifiers and current-document routing;
- clean coexistence with TypeScript and JavaScript files in the same workspace;
- server failure, file-size, suspend, uninstall, and workspace-disposal behavior
  equal to the existing language provider.

Rename, code actions, semantic tokens, inlay hints, document links, document
colors, call hierarchy, and workspace symbols are not in that definition. Invar
has no generic host surface for them today. The user should either accept this
definition or name the extra features before the implementation task exists.

## 1. Current driven behavior

### Fixture

I drove the default app against this 30-line SFC:

```vue
<script setup lang="ts">
import { computed, ref } from "vue";

interface UserCard {
  name: string;
  visits: number;
}

const user = ref<UserCard>({ name: "Ada", visits: 2 });
const greeting = computed(() => `Hello ${user.value.name}`);
const brokenNumber: number = "not a number";
</script>

<template>
  <main class="profile-card">
    <h1>{{ greeting }}</h1>
    <button @click="user.visits++">
      Visits: {{ user.visits }}
    </button>
    <UnknownWidget :person="user" />
  </main>
</template>

<style scoped>
.profile-card {
  display: grid;
  color: rebeccapurple;
}
</style>
```

The baseline command was:

```sh
bun run drive \
  --open /tmp/311-vue-sfc-current-state.vue \
  --geometry 110x34
```

The settled editor frame showed the SFC as ordinary source text:

```text
06 │ ... │ │  1 ▏<script setup lang="ts">                                    ││
07 │ ... │ │  2  import { computed, ref } from "vue";                        ││
09 │ ... │ │  4⌄ interface UserCard {                                        ││
14 │ ... │ │  9  const user = ref<UserCard>({ name: "Ada", visits: 2 });     ││
15 │ ... │ │ 10  const greeting = computed(() => `Hello ${user.value.name}`);││
16 │ ... │ │ 11  const brokenNumber: number = "not a number";                ││
```

The same settled observation published:

```text
diagnosticsCount=0
subprocessPids=[]
structureRequests=0
structureRows=0
```

This proves that the intentional TypeScript assignment error and the unknown
template component produced no semantic result. It also proves that opening the
file did not start a language-server process.

### Highlighting

I inspected foreground runs in the settled PTY frame. The outer SFC tags and
Vue template syntax had distinct colors:

```text
<                         0x89ddff
script                    0xbb9af7
"ts"                      0x9ece6a

<                         0x89ddff
UnknownWidget             0xbb9af7
:person                   0xbb9af7
"user"                    0x9ece6a
/>                        0x89ddff
```

The embedded script and style content each had one default foreground run:

```text
import { computed, ref } from "vue";     0xa9b1d6
color: rebeccapurple;                    0xa9b1d6
```

The current display therefore recognizes SFC and template markup. It does not
select TypeScript or CSS highlighting inside their blocks.

The measured cause matches the implementation. The
[language registry](../../../../src/modules/syntax/LanguageRegistry.ts) maps
`.vue` to one whole-file `vue` identifier. The
[highlighter](../../../../src/modules/syntax/Highlighter.ts) then selects the
Vue-aware HTML tokenizer for every line. It has no document state, region map,
or injection query. The
[editor renderer](../../../../src/modules/editor/EditorPaneRenderer.ts) calls
that whole-file highlighter for each visible logical line.

### Structure

I opened the Structure dock with:

```sh
bun run drive \
  --open /tmp/311-vue-sfc-current-state.vue \
  --geometry 110x34 \
  --click 2,8 \
  --wait-for-status 'structureStatus="unavailable"'
```

The settled frame said:

```text
03 │ ... │ 1/1  ╭─Structure────────────────╮
04 │ ... │      │ ⌕                     ⛭ 1│
05 │ ... │      │ No structure available.  │
07 │ ... │      │ No installed source      │
08 │ ... │      │ answers for this file    │
09 │ ... │      │ type.                    │
```

The state was:

```text
structureNotice="No installed source answers for this file type."
structureRequests=0
structureRows=0
structureStatus="unavailable"
subprocessPids=[]
```

The pane did not send a symbol request because no installed source claimed the
Vue document.

### Hover

I also sent a pointer move to `brokenNumber` through
[PtyTestDriver](../../../../scripts/harness/PtyTestDriver.ts). The source frame
stayed visible. No bordered hover card appeared. The probe did not observe an
active hover result before its five-second condition timeout. This is a negative
observation, not a hover latency contract. The same observation still had no
language-server process and no diagnostics:

```text
subprocessPids=[]
diagnosticsCount=0
```

This behavior follows the governed
[hover-card contract](../../../../src/modules/ui/ui.invariants.md#a-hover-card-reflects-the-language-server-type-at-the-pointed-symbol):
the card can only display a language provider response. The driven Vue document
had no such provider.

## 2. Block-aware highlighting

### SFC facts

The Vue SFC specification says an SFC has top-level `template`, `script`, and
`style` blocks, plus optional custom blocks. It also permits multiple style
blocks. It says the `lang` attribute can apply to any block, including
TypeScript, SCSS, and Pug examples. These are format rules, not Invar policy.
[Vue SFC syntax specification](https://vuejs.org/api/sfc-spec.html)

The first implementation must recognize:

| SFC region | Required language |
| --- | --- |
| `<script>` and `<script setup>` without `lang` | JavaScript |
| `<script lang="js">` | JavaScript |
| `<script lang="ts">` | TypeScript |
| `<script lang="jsx">` | JavaScript with the present JavaScript fallback |
| `<script lang="tsx">` | TypeScript with the present TypeScript fallback |
| `<template>` | Vue HTML |
| `<style>` and `<style lang="css">` | CSS |
| `<style lang="scss">` | SCSS |
| opening and closing block tags | Vue HTML |
| unknown or custom blocks | plain text with Vue HTML tags |

Pug, Less, Sass indented syntax, PostCSS, custom-block grammars, and external
`src` blocks stay outside the first implementation. The host must still preserve
the region identity so another plugin can add those languages later.

### Present limitation

The current syntax path has no injection mechanism:

```text
path
  -> LanguageRegistry.forPath(path)
  -> one LangId
  -> Highlighter.highlightLine(line, LangId)
  -> visible spans
```

The same static highlighter also supplies lexical roles to
[code folding](../../../../src/modules/editor/CodeFolding.ts),
[bracket matching](../../../../src/modules/editor/BracketMatch.ts), the
[diff view](../../../../src/modules/diff/DiffView.ts), and the
[hover card](../../../../src/modules/ui/HoverCard.ts). Adding a `.vue` branch
inside each consumer would create five copies of one block-selection rule.

OpenTUI already exposes a Tree-sitter client. Its documentation says
`queries.injections` highlights embedded languages and provides node and
language-label mappings. Invar depends on `web-tree-sitter`, but its present
source renderer does not use this client.
[OpenTUI Tree-sitter documentation](https://opentui.com/docs/reference/tree-sitter/)

The Tree-sitter parser list names a maintained Vue parser. That makes a
Tree-sitter Vue grammar possible, but it does not make it part of Invar’s
current highlighter.
[Tree-sitter parser list](https://github.com/tree-sitter/tree-sitter/wiki/List-of-parsers)

### Required general seam

Add a consumer-owned `DocumentSyntaxSource` port and a host registry. The port
should answer these questions:

- Does this source support this document?
- What syntax regions exist at this document revision?
- What spans cover a requested logical line or visible window?
- What lexical roles should bracket and folding consumers use?
- Why can the source not answer?

Registration must return a disposer. Resolution must select the newest source
that supports the document. The existing highlighter remains the fallback
source for ordinary files. The registry must be available to source editing,
diff rendering, folding, and bracket matching so every consumer uses the same
region generator.

The Vue plugin registers one Vue syntax source through this port. No generic
consumer names Vue or checks `.vue`.

### Region generator

Use `parse` from `vue/compiler-sfc` to create the region map. Do not parse block
tags with a regular expression. Vue describes `@vue/compiler-sfc` as a
low-level tool for SFC tooling and recommends the `vue/compiler-sfc` deep import
so its version stays aligned with Vue. Its workflow starts by parsing source
into a descriptor.
[Vue compiler SFC documentation](https://github.com/vuejs/core/tree/main/packages/compiler-sfc)

Cache the descriptor and normalized regions by document identity and revision.
The source must:

- translate compiler UTF-16 offsets through
  [text coordinates](../../../../src/modules/text/TextCoordinates.ts);
- preserve malformed or incomplete blocks while the user types;
- return plain spans when parsing cannot identify a safe region;
- avoid a whole-document parse on every visible row;
- invalidate only on document revision;
- keep the same result at 10 lines and 100,000 lines apart from the changed
  region cost.

The first slice may reuse the current JavaScript, TypeScript, Vue HTML, and CSS
tokenizers inside the regions. Genuine SCSS support needs a distinct language
identifier and grammar. It must not silently call the CSS tokenizer “SCSS.”

Tree-sitter injection is a later quality option. It should replace the source’s
internal span generator behind the same port. It must not change the host
attachment or cause every editor consumer to learn Tree-sitter.

## 3. Vue language server and TypeScript coexistence

### Upstream components

Vue Language Tools calls `@vue/language-server` “The language server itself,”
calls `@vue/typescript-plugin` the TypeScript language-service plugin, and says
`@vue/language-core` performs SFC parsing and virtual-code generation.
[Vue Language Tools README](https://github.com/vuejs/language-tools)

The current language-server README gives these installation and launch forms:

```text
npm install @vue/language-server
vue-language-server --stdio
vue-language-server --stdio --tsdk=/path/to/typescript/lib
```

The `--tsdk` path must point to TypeScript’s `lib` directory.
[@vue/language-server README](https://github.com/vuejs/language-tools/blob/master/packages/language-server/README.md)

The same README says the server communicates with
`@vue/typescript-plugin` through custom `tsserver/request` and
`tsserver/response` notifications. This is load-bearing. Starting the executable
alone does not prove TypeScript features inside the SFC.
[@vue/language-server TypeScript collaboration](https://github.com/vuejs/language-tools/blob/master/packages/language-server/README.md#collaboration-with-typescript-plugin)

### Hybrid and takeover

The Vue Language Tools maintainer describes takeover mode as disabling the
ordinary TypeScript service and making Vue Language Server own `.ts` files.
The same note describes hybrid mode this way: TypeScript features for Vue files
come from the TypeScript server and Vue plugin, while CSS, HTML, and JSON
features come from Vue Language Server.
[Volar 2.0 architecture note](https://gist.github.com/johnsoncodehk/62580d04cb86e576e0e8d6bf1cb44e73)

Invar should target hybrid coexistence:

- the existing TypeScript service keeps `.ts`, `.tsx`, `.js`, and `.jsx`;
- the Vue service claims `.vue`;
- Vue TypeScript requests cross a bridge to a compatible TypeScript service;
- an ordinary TypeScript file never changes owners because a Vue file is open.

Takeover is a fallback experiment only. It would make the Vue stack own
ordinary TypeScript files and would replace the existing server preference. It
also turns Vue installation into a workspace-wide language-owner switch. That
is not clean plugin coexistence.

### Current Invar limits

The existing
[LSP workspace provider](../../../../src/modules/lsp/LspWorkspaceProvider.ts)
is one workspace contribution. It supplies the one public `language` provider,
one Structure source, gutter diagnostics, and inline rewrite registration. It
creates one [language client](../../../../src/modules/lsp/LanguageClient.ts).

That client has a construction-time list of server providers, but the default
list contains only
[TypeScriptProvider](../../../../src/modules/lsp/TypeScriptProvider.ts). The
client owns one process, one transport, and one selected provider. It cannot
keep a TypeScript server and a Vue server alive at the same time.

The public
[LanguageProvider interface](../../../../src/modules/workspace/LanguageProvider.interface.ts)
has no `supportsDocument` method. The
[provider registry](../../../../src/modules/plugins/ProviderRegistry.ts)
returns only the newest `language` registration through `resolve`. A second
language plugin would shadow the first one for every file.

The language client also has these Vue blockers:

- unknown file extensions are sent as `languageId: "typescript"`, not `vue`;
- provider resolution returns only a command and arguments;
- initialize options are not provider-owned;
- `workspace/configuration` returns `null` for every setting;
- notifications other than diagnostics are ignored;
- the custom Vue `tsserver/request` bridge is absent;
- one selected process cannot route mixed open documents to two servers.

These are generic multi-language defects. Do not solve them in a Vue subclass.

### Required general seam

Keep one host-facing `LanguageProviderRouter` registered as `language`. It
should resolve all registered `DocumentLanguageService` contributions and
select the newest service that supports the subject document. Each service owns
its server client or clients.

The service port needs:

- a cheap `supportsDocument`;
- document language identifier selection;
- definition, references, hover, completion, diagnostics, and symbols;
- formatting and folding when their host ports exist;
- status and install notices;
- open, change, close, suspend, resume, and dispose lifecycle;
- provider-owned initialize options and configuration;
- provider-owned custom notification and request handling.

The host router owns selection and neutral fallback values. It must never copy
Vue protocol rules.

The Vue workspace contribution then owns:

- one Vue language-server client;
- its Vue-to-TypeScript bridge;
- the `.vue` support predicate;
- `languageId: "vue"`;
- server executable and TypeScript SDK resolution;
- Vue settings and notices;
- registration with language, Structure, formatting, folding, and diagnostic
  hosts;
- symmetric withdrawal and process disposal.

### TypeScript bridge spike

The implementation must start with a protocol spike before product wiring.
Use the exact package version intended for the product. Capture every
initialize capability and custom message.

The installed `typescript-language-server` exposes the
`typescript.tsserverRequest` workspace command for raw tsserver requests.
[typescript-language-server command documentation](https://github.com/typescript-language-server/typescript-language-server#send-tsserver-command)

The spike must answer:

1. Can the selected Vue server use that command as its hybrid bridge?
2. How is `@vue/typescript-plugin` loaded and configured?
3. Does the project-local TypeScript SDK work through `--tsdk`?
4. Does the bridge work with the current `typescript-language-server` version?
5. Can `tsgo` host the required Vue TypeScript plugin or bridge?
6. Which side owns cancellation and failure when one of the two servers exits?
7. Which configuration sections does the Vue server request?

If `tsgo` cannot provide the bridge, the Vue plugin must publish an honest
notice and use a declared compatibility policy. The likely policy is to require
`typescript-language-server` for Vue workspaces while leaving `tsgo` available
for workspaces without Vue. The spike decides this. The implementation must not
quietly override the user’s server setting.

### Install and runtime policy

Resolve in this order:

1. project-local `node_modules/.bin/vue-language-server`;
2. PATH `vue-language-server`;
3. a user-configured executable path, if the product adds that setting.

Do not bundle or download a server on first use. A missing executable returns a
Vue-owned status notice with the upstream install command. The application
must remain usable.

Resolve TypeScript from the workspace before the application dependency. Pass
its `lib` directory through `--tsdk`. Record the exact resolved server and SDK
in diagnostics status so mixed-version failures can be reproduced.

## 4. Structure pane

The Structure host already has the correct attachment shape. Its
[StructureSource interface](../../../../src/modules/structure/StructureSource.interface.ts)
asks whether a source supports one document, requests symbols, and asks for an
honest notice. The
[Structure outline](../../../../src/modules/structure/StructureOutline.ts)
uses `resolveAll("structure")` and selects the newest supporting source. Vue can
coexist with Markdown and TypeScript without a core branch.

An upstream Vue Language Tools trace shows `textDocument/documentSymbol`
returning a `template` symbol with a `div` child and a separate `script setup`
symbol for a small SFC. This is a captured version-specific result, not a stable
schema promise.
[Vue Language Tools document-symbol trace](https://github.com/vuejs/language-tools/issues/5387)

The implementation spike must capture symbols from the pinned server for a
fixture with:

- named script bindings;
- a nested template;
- one component element;
- one CSS block;
- one scoped SCSS block;
- both ordinary script and script setup;
- a malformed block.

Do not invent missing script-binding or style rows in Invar. The Vue server is
the analyzer. The pane may project only the symbols that the server returns.
If upstream returns only block and template-element symbols, record that result
and keep the UI honest.

The existing
[TypeScript structure analyzer](../../../../src/modules/lsp/TypeScriptStructureAnalyzer.ts)
refines only TypeScript and JavaScript paths. It will leave Vue symbols intact.
That is the correct first behavior. Vue-specific cleanup belongs in a
Vue-owned analyzer only if a driven outline proves upstream noise.

The Structure phase needs no new core attachment seam. It needs the plural
language client, a Vue source registration, and a real server response.

## 5. Other surfaces

### Diagnostics

The current LSP provider already contributes gutter decorations and exposes
diagnostics to the hover card. Once the language router selects the Vue service,
the same generic storage and revision guards can render Vue diagnostics.

Acceptance must include:

- a TypeScript assignment error in script setup;
- an unknown template property under strict template checking;
- an error that moves after an edit;
- a stale response that arrives after the document revision changes;
- a file above the LSP size limit;
- a Vue server exit while the document stays open.

The Vue project controls strict template behavior through
`vueCompilerOptions` in `tsconfig.json`. Vue Language Tools documents
`strictTemplates` there.
[Vue Language Tools compiler options](https://github.com/vuejs/language-tools#vuecompileroptions)

### Completion, hover, definition, and references

These already have protocol implementations in the language client. The new
router must preserve their neutral results and revision guards. Acceptance must
cover positions in script setup and template expressions, plus a cross-file
definition from a `.ts` file to a `.vue` component and back.

References exist in the client but have no present workspace command or UI.
The implementation must add a provider-neutral consumer before it can claim
user-visible reference support.

### Formatting

There is no formatting method or consumer port in Invar today. Vue’s official
tooling guide says the Vue extension formats SFCs and that Prettier also
supports Vue SFC formatting.
[Vue tooling formatting guide](https://vuejs.org/guide/scaling-up/tooling.html#formatting)

Add a generic document-formatting source. It requests
`textDocument/formatting`, converts UTF-16 ranges through the shared coordinate
seam, and applies all returned edits as one atomic editor transaction. The Vue
plugin only supplies the service. The host owns edit application and undo.

Formatting must be explicit user action in the first release. Format-on-save is
outside this task.

### Folding

The current
[code folding](../../../../src/modules/editor/CodeFolding.ts) derives delimiter
and indentation ranges from the one whole-file highlighter. It has no LSP
folding-range path.

An upstream Vue trace shows `textDocument/foldingRange` returning separate
ranges for the script and template blocks in a small SFC. The exact ranges are
server-version output.
[Vue Language Tools folding trace](https://github.com/vuejs/language-tools/issues/5387)

Add a generic folding source. Cache its whole-document result by document
revision. Request it only while a document is observed. Keep the current local
fold generator as fallback while the server is unavailable. Vue block parsing
must not create a second fold policy beside the server and local fallback.

### Breadcrumbs

Invar’s [breadcrumb](../../../../src/modules/ui/Breadcrumb.ts) is a filesystem
path. Its
[breadcrumb picker](../../../../src/modules/ui/BreadcrumbPicker.ts) browses
directories. It has no symbol or cursor-scope breadcrumb.

“Breadcrumbs within blocks” would be a new product feature for every language,
not Vue integration wiring. It needs a generic cursor-to-symbol-path source and
a UI contract. It is outside the future Vue implementation task. The Structure
pane supplies block and symbol navigation in this scope.

### Tasks

The Tasks dashboard discovers and runs workspace tasks. It does not consume
file language. Vue editing adds no task attachment. The acceptance workspace
may include a `vue-tsc --noEmit` task, but the Vue plugin must not synthesize or
own it.

Vue Language Tools documents `vue-tsc` plus TypeScript as the command-line
type-checking path.
[Vue Language Tools command-line type checking](https://github.com/vuejs/language-tools#command-line-type-checking)

## 6. Pluggability map

The governing
[plugin records](../../../../src/modules/plugins/plugins.invariants.md)
require host-carried provider rendezvous and independent plugin lifetimes. The
[application contribution port](../../../../src/modules/app/ApplicationContributor.interface.ts)
already supports settings, keybindings, and a workspace contributor. The
[workspace contribution port](../../../../src/modules/workspace/WorkspaceContributor.interface.ts)
already supplies open, suspend, resume, and dispose lifecycle.

The completed
[per-workspace terminal worlds task (#296)](../../completed/296-per-workspace-terminal-worlds/report-296-per-workspace-terminal-worlds.md)
proved that runtime withdrawal must remove a contribution from every workspace
world, including inactive worlds. Vue owns no pane runtime, but it needs the
same application-to-workspace withdrawal discipline for syntax and language
registrations.

| Capability | Clean attachment | Present state | Required pre-work |
| --- | --- | --- | --- |
| Application identity and settings | `ApplicationContributor` | Available | None |
| Per-workspace lifecycle | `WorkspaceContributor` | Available | None |
| Vue syntax | `DocumentSyntaxSource` | Missing | Add registry and disposer |
| Language requests | host `LanguageProviderRouter` plus plural document services | Single newest provider | Add router and service registry |
| Vue server process | Vue-owned service client | One client owns one process | Allow independent clients per service |
| Vue TypeScript bridge | provider protocol adapter | Missing | Add custom message and execute-command bridge |
| Language identifier | service launch descriptor | Hardcoded fallback to TypeScript | Make provider-owned |
| Initialize options | service launch descriptor | Host-owned fixed object | Make provider-extensible |
| Workspace configuration | service configuration port | All values are `null` | Route requested sections |
| Diagnostics | gutter contribution and language service | Available | Route Vue service |
| Structure | `StructureSource` through `resolveAll` | Available | Register Vue source |
| Formatting | document-formatting source | Missing | Add consumer-owned port and atomic edit path |
| Folding | folding source | Missing | Add consumer-owned port and revision cache |
| Breadcrumb symbols | cursor symbol-path source | Missing | Out of scope |
| Runtime withdrawal | scoped disposers | Available in contribution framework | Apply to every new registration |

Any implementation that does one of the following is a core hack and must stop:

- adds `.vue` to `Workspace`;
- adds Vue imports to `LspPlugin` or `LanguageClient`;
- appends Vue to `LanguageClient.createProviders`;
- changes `languageIdFor` to another hardcoded extension switch;
- makes Vue shadow the TypeScript `language` provider;
- delegates TypeScript requests by reimplementing the TypeScript service inside
  the Vue plugin;
- adds Vue branches to editor rendering, folding, bracket matching, diff, or
  Structure;
- keeps a Vue process alive after workspace suspend, close, or plugin uninstall;
- reports a server as active when the TypeScript bridge is absent.

## 7. Ordered implementation phases

Every phase starts with the default settings. Every behavioral phase drives the
same small and large fixtures. Each new check gets a positive control before it
is trusted.

### Phase 0 — generic host seams

Build:

- `DocumentSyntaxSource` registry and fallback source;
- `LanguageProviderRouter` and plural `DocumentLanguageService` registry;
- provider-owned document language identifiers, launch options, configuration,
  and custom protocol handling;
- independent client lifecycle per registered language service;
- generic formatting and folding source ports, if the accepted “full” feature
  definition includes them.

Do not register Vue yet.

Acceptance drives:

- TypeScript hover, completion, definition, diagnostics, and Structure remain
  unchanged at default settings;
- a Markdown Structure source and TypeScript source still coexist;
- a planted second test language service answers only its extension and cannot
  shadow TypeScript;
- plugin withdrawal removes its service from active and inactive workspaces;
- 10-line and 100,000-line TypeScript files have the same interaction shape.

Main risk: a router that adds a linear scan to every visible row. Syntax source
selection must cache by document and registry revision.

### Phase 1 — smallest shippable Vue slice

Build one Vue plugin and one Vue syntax source. Parse SFC regions through
`vue/compiler-sfc`. Reuse the current TypeScript, JavaScript, Vue HTML, and CSS
tokenizers. Add genuine SCSS support or state an honest “SCSS grammar
unavailable” notice; do not disguise CSS as SCSS.

No Vue server starts in this phase.

Acceptance drives:

- script setup TypeScript keywords, types, strings, and comments have the same
  colors as a `.ts` file;
- template tags, directives, attributes, and interpolation delimiters keep Vue
  HTML colors;
- CSS properties, values, colors, and comments match a `.css` file;
- SCSS variables and nesting use the SCSS source;
- changing `lang="ts"` to `lang="js"` changes only the script region;
- an incomplete closing tag degrades to honest plain or outer Vue spans without
  a crash;
- uninstalling the Vue plugin restores the current whole-file fallback;
- the 30-line fixture and a shared 100,000-line scale fixture settle with the
  same visible-row cost shape.

Out of this phase: template type checking, semantic hover, completion,
diagnostics, Structure, formatting, and LSP folding.

### Phase 2 — protocol spike and server lifecycle

Create a bounded task-folder instrument. Launch the pinned
`vue-language-server --stdio` against a real Vue workspace and connect the
TypeScript bridge. Capture initialize capabilities and all custom messages.

Acceptance drives:

- a `.vue` `didOpen` carries `languageId: "vue"`;
- the Vue and TypeScript processes coexist;
- a `.ts` hover still comes from the TypeScript service;
- a script-setup hover comes from the Vue hybrid path;
- suspend releases both workspace-owned processes;
- resume starts only on semantic demand;
- uninstall removes Vue support and keeps TypeScript support;
- a missing executable and missing bridge each publish different honest
  notices;
- a forced process exit stays contained.

The phase fails if the selected server version cannot complete the bridge. Do
not work around that result with takeover or a pinned old server without user
review.

### Phase 3 — semantic Vue feature set

Wire diagnostics, hover, completion, definition, and references through the
generic language router. Preserve all current size, revision, UTF-16, failure,
and bounded-storage contracts.

Acceptance drives:

- script assignment and template property errors appear and clear after edits;
- hover works in script setup and a template expression;
- completion works after `user.` in both regions;
- definition jumps from template use to script binding;
- definition crosses from a TypeScript import to a Vue component;
- references return positions from `.vue` and `.ts` files;
- a stale diagnostic and stale hover response cannot paint;
- TypeScript-only and mixed Vue/TypeScript workspaces behave the same at small
  and large scale.

### Phase 4 — Structure

Register the Vue service as a `StructureSource`. Use the raw server symbol tree
first.

Acceptance drives:

- the Structure dock changes from `unavailable` to `ready`;
- the pinned fixture shows the exact captured server blocks and children;
- selecting a template child and script block jumps to their source anchors;
- filter, depth, truncation, edit refresh, and switch refresh keep the current
  Structure contracts;
- switching among Vue, TypeScript, and Markdown chooses the correct source;
- a server decline shows a notice and never blanks the pane.

### Phase 5 — formatting and folding

Add provider-neutral document formatting and folding-range consumers. Route Vue
through them.

Acceptance drives:

- format document changes script, template, and style as one undoable edit;
- undo restores the exact pre-format SFC;
- formatting a stale revision is rejected;
- server folding exposes the SFC blocks;
- local fallback folding remains available while the server is absent;
- fold toggles preserve viewport anchors;
- formatting and fold refresh have the same behavior on small and large
  fixtures.

## 8. Explicit boundaries

The future Vue implementation task does not include:

- the
  [Vue 3.6 RC-2 runtime upgrade (#283)](../../active/283-vue-3-6-rc2-upgrade/task-283-vue-3-6-rc2-upgrade.md);
- Vue runtime, compiler, or application build integration;
- bundler support, hot-module replacement, preview, or execution of an SFC;
- automatic installation or download of language servers;
- takeover mode as the default architecture;
- Pug templates;
- Less, Sass indented syntax, PostCSS, or custom-block grammars;
- external block `src` resolution in the syntax source;
- template type checking in the highlighting phase;
- semantic tokens;
- rename;
- code actions and quick fixes;
- inlay hints;
- document links and colors;
- workspace symbols, call hierarchy, or type hierarchy;
- format-on-save;
- symbol breadcrumbs;
- generation of `vue-tsc`, lint, build, or test tasks;
- Vue-specific branches in generic hosts.

There is one true overlap with the Vue runtime upgrade. The recommended region
parser is the `vue/compiler-sfc` deep import, so it follows the application Vue
version. The runtime-upgrade task may change that parser version. The two tasks
remain distinct. The Vue implementation must record the parser version it
drives after the runtime dependency settles.

## 9. Ranked open questions

1. **What does “full LSP support” include?** Recommended answer: accept the
   closed feature list in this map and keep the named optional protocol features
   out.
2. **Can the pinned current Vue server complete hybrid requests through
   `typescript-language-server`?** The protocol spike must answer before product
   work.
3. **Can `tsgo` participate in that bridge?** If not, the product needs a visible
   compatibility policy, not a silent server override.
4. **Which Vue Language Tools version is supported?** Pin one version for the
   first release. Record its TypeScript compatibility and symbol shape.
5. **Does phase 1 require true SCSS on day one?** Recommended answer: yes,
   because the task names SCSS. Pug and other preprocessors remain out.
6. **Should the first syntax source use current tokenizers or OpenTUI
   Tree-sitter injection?** Recommended answer: use the region source with
   current tokenizers first. Keep Tree-sitter as an internal upgrade behind the
   same port.
7. **What symbol tree does the pinned server return for the acceptance SFC?**
   Capture it. Do not specify rows from a different server version.
8. **Must Vue 2 work?** Recommended answer: no. The first release targets Vue 3
   and says so in its install notice.

## Review gate

Do not create or dispatch the Vue implementation task until the user reviews:

- the full-feature definition;
- the hybrid compatibility policy;
- the SCSS decision;
- the optional protocol boundary;
- the five implementation phases.
