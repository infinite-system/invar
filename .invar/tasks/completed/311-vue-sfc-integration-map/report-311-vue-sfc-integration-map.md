# READY — Vue SFC integration map (#311)

State: READY

Branch: `fleet/311-vue-sfc-integration-map`

Commit: `937dc2b8b9fbe40b27990806778caaaed4262a23`

Worktree: clean

## Result

The
[Vue SFC integration map](project-vue-integration-map.md)
is complete. It contains 844 lines of driven evidence, current seam analysis,
upstream citations, a plugin attachment map, five implementation phases, phase
acceptance drives, and explicit boundaries.

No product code or invariant record changed. The branch contains one new task
record.

The map recommends one Vue application plugin. It owns Vue parsing, the Vue
language-server process, the TypeScript bridge, settings, and notices. Generic
hosts own language routing, syntax routing, lifecycle, edits, folding, and
rendering.

The first shippable slice is block-aware highlighting through a new generic
syntax-source port. The semantic work starts only after a protocol spike proves
the current Vue language server and TypeScript bridge.

## Driven baseline

I opened a 30-line Vue SFC through the real PTY harness at default settings.
The file contained:

- `<script setup lang="ts">`;
- a deliberate TypeScript assignment error;
- a template with directives, interpolation, and an unknown component;
- scoped CSS.

The settled frame showed Vue tag and template colors. Script and style content
used the default foreground. The same observation published:

```text
diagnosticsCount=0
subprocessPids=[]
structureRequests=0
structureRows=0
```

I then opened the Structure dock. The settled frame said:

```text
No structure available.

No installed source
answers for this file
type.
```

The state was:

```text
structureNotice="No installed source answers for this file type."
structureRequests=0
structureRows=0
structureStatus="unavailable"
subprocessPids=[]
```

A pointer probe over the deliberate script error produced no hover card. The
map labels this as a negative observation, not a latency contract.

## Architecture findings

Three current seams are ready:

- application and per-workspace plugin lifecycle;
- gutter diagnostic contribution;
- plural per-document Structure sources.

Four generic seams are missing:

- a registered document syntax source;
- plural document language services behind one host router;
- document formatting;
- LSP folding ranges.

The present language client owns one process and one selected server provider.
The provider registry also resolves one newest `language` provider. A Vue
provider would therefore shadow TypeScript, or it would need to reimplement
TypeScript delegation. The map rejects both forms.

The current Vue language-server documentation also makes the TypeScript bridge
load-bearing. It uses custom `tsserver/request` and `tsserver/response`
notifications. Invar does not handle that bridge today. The map makes a real
protocol spike a blocking phase.

## Proposed phases

1. Add generic syntax and plural language-service routing.
2. Ship block-aware Vue highlighting, including true SCSS support.
3. Prove Vue server launch, hybrid TypeScript communication, lifecycle, and
   failure notices.
4. Add diagnostics, hover, completion, definition, references, and Structure.
5. Add atomic document formatting and revision-cached LSP folding.

Each phase has default-setting drives, small and large fixtures, lifecycle
checks, and positive-control requirements.

## Ranked open questions

1. **Meaning of full LSP support.** The map recommends diagnostics, hover,
   completion, definition, references, document symbols, formatting, folding,
   correct Vue document routing, and TypeScript coexistence. Optional upstream
   protocol features stay out unless the user adds them.
2. **Current hybrid bridge.** The pinned Vue server must complete its TypeScript
   requests through `typescript-language-server` before product wiring starts.
3. **`tsgo` compatibility.** If it cannot host or bridge the Vue TypeScript
   plugin, Invar needs a visible compatibility policy.
4. **Supported Vue Language Tools version.** The first release must pin one
   tested version and record its TypeScript range.
5. **SCSS timing.** The map recommends true SCSS in the first highlighting
   slice because the user named it.
6. **Tokenizer or Tree-sitter.** The map recommends the existing tokenizers
   behind the new region source first. OpenTUI Tree-sitter injection remains an
   internal upgrade.
7. **Document-symbol shape.** The pinned server response must define the driven
   Structure expectation.
8. **Vue version scope.** The map recommends Vue 3 only.

The user should review the first five questions before a Vue implementation
task is created.

## Boundaries

The map keeps the
[Vue 3.6 RC-2 runtime upgrade (#283)](../../active/283-vue-3-6-rc2-upgrade/task-283-vue-3-6-rc2-upgrade.md)
separate. The only overlap is the recommended `vue/compiler-sfc` parser, which
tracks the application Vue version.

The future implementation excludes bundler integration, preview, server
downloads, takeover mode by default, Pug, Less, PostCSS, custom-block grammars,
format-on-save, symbol breadcrumbs, task generation, and optional LSP features
not listed in the accepted full-feature definition.

## Verification

- `bun run drive --open /tmp/311-vue-sfc-current-state.vue --geometry 110x34`
  — current editor, diagnostic, process, and Structure baseline captured.
- Structure dock drive with
  `--wait-for-status 'structureStatus="unavailable"'` — passed.
- PTY foreground-run probe — current outer Vue and embedded-language colors
  captured.
- `bun scripts/tasks/lint-task-links.ts` on the map — passed.
- flavored STE lint on the map — passed.
- invariant checker on the tracked branch state — 1,149 annotations and 220
  lattice links resolved, zero problems.
- `git diff --check` — passed.
- Record-only commit used `SKIP_GATE=1`, as the
  [task brief](brief-311-1-vue-sfc-integration-map.md) requires.

The first invariant-checker run also scanned the ignored
[injected root task brief](../../../../TASK.md). It reported that file’s
unanchored plugin-record link. I temporarily
moved only that untracked file, ran the checker against the branch state, and
restored it. The tracked branch check is green.

## Bycatch

- **Contract-layer gap:** [the syntax module](../../../../src/modules/syntax)
  has no domain invariant record. It has a registry, highlighter, and tests, but
  no domain record or lattice for syntax-source selection and embedded
  languages. A directory census confirmed the gap twice. Not fixed.
- **Comment drift:** the
  [language registry](../../../../src/modules/syntax/LanguageRegistry.ts)
  calls itself the place where a Tree-sitter provider would register, but it
  exposes only a static extension map and no registration port. Structural
  inspection confirmed the disagreement. Not fixed.
- **Task-state drift:** the
  [task record](task-311-vue-sfc-integration-map.md) says `Status: active` while
  it lives under `in-progress`. The folder and tracker state disagree with the
  prose field. Not fixed.
- **Injected-link defect:** the
  [injected root task brief](../../../../TASK.md) links the plugin invariant
  file without a heading anchor. The invariant checker reproduced this once as
  its only problem. The file is ignored and absent from `HEAD`, so it was not
  changed or committed.
