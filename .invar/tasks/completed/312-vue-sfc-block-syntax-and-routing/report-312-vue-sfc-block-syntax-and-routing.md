# READY: Vue SFC block syntax and routing

Task:
[Vue SFC integration implementation (#312)](../../active/312-vue-sfc-integration-implement/task-312-vue-sfc-integration-implement.md)

Accepted design:
[Vue SFC integration map (#311)](../../completed/311-vue-sfc-integration-map/project-vue-integration-map.md)

Status: READY

## Result

The dispatched generic-host and Vue-highlighting phases are complete.

- The workspace now owns one cached
  [document syntax reader](../../../../src/modules/syntax/DocumentSyntax.ts).
  Syntax plugins register the consumer-owned
  [document syntax source port](../../../../src/modules/syntax/DocumentSyntaxSource.interface.ts)
  through the existing workspace provider registry.
- Rendering, diff projection, folding, bracket matching, hover lexical roles, and inline rewrite
  language selection use that shared reader. They do not parse embedded formats themselves.
- The workspace now exposes one
  [language provider router](../../../../src/modules/workspace/LanguageProviderRouter.ts).
  It selects the newest supporting
  [document language service](../../../../src/modules/workspace/DocumentLanguageService.interface.ts).
  A later service for another extension cannot shadow TypeScript.
- The existing LSP workspace contribution now registers as a document language service. Current
  TypeScript behavior and lifecycle remain behind the same host-facing language provider.
- The removable [Vue plugin](../../../../src/modules/vue/VuePlugin.ts) registers one
  [Vue syntax source](../../../../src/modules/vue/VueSyntaxSource.ts). It uses
  `vue/compiler-sfc` for block ranges and caches one descriptor and normalized region map per
  document revision.
- Script and script-setup blocks select JavaScript or TypeScript from `lang`. Template content
  selects Vue HTML. Style content selects CSS or genuine SCSS. Unsupported and custom-block
  content stays plain. Outer block tags stay Vue HTML.
- SCSS has its own identifier and tokenizer path. Variables, interpolation, nesting, and line
  comments do not pass through the CSS path.
- The stale [language registry](../../../../src/modules/syntax/LanguageRegistry.ts) comment now
  describes its real role as the ordinary-file fallback. The registry has no `.vue` entry.
- The missing
  [syntax module record](../../../../.invar/worktrees/312-vue-sfc-block-syntax-and-routing/src/modules/syntax/syntax.invariants.md)
  now
  governs regions, removal, selection caching, and visible-line cost. The
  [Vue record](../../../../.invar/worktrees/312-vue-sfc-block-syntax-and-routing/src/modules/vue/vue.invariants.md)
  governs compiler-owned parsing and plugin withdrawal.

Phases for the Vue server spike, semantics, Structure, formatting, and server folding remain
outside this dispatch, as required by the brief.

## Commits

- `d4e8c587`: Add generic document syntax and language routers for Vue SFC integration.
- `39a81bc4`: Add removable block-aware Vue SFC syntax highlighting.
- `df39b2c8`: Normalize metadata for unknown task-variable pass-through task #305. This is the
  separate bycatch commit described below.

## Driven evidence

I reproduced the baseline first with:

```sh
bun run drive --open /tmp/312-vue-sfc-small.vue --geometry 110x40
```

Before the change, the 39-line SFC used one whole-file Vue stream. Embedded script and style text
had the default foreground. The settled frame reported 31 document-line reads, 16 fold projection
lookups, two wrap projection lookups, and one layout computation.

After the change, the extended real-PTY
[comment styling contract](../../../../scripts/harness/smoke-comment-styling-harness.ts) observed
these theme-derived foregrounds through emulator cells:

- script-setup TypeScript keyword and comment colors;
- Vue template directive color;
- CSS property, color literal, and comment colors;
- SCSS nesting operator and line-comment colors.

The same live contract disabled Vue in Extensions. The active `.vue` file repainted as plain text.
It then reinstalled Vue and observed the same script, template, CSS, and SCSS colors again. No Vue
server started.

For scale parity, I generated the shared 100,000-line TypeScript fixture with
[the scale workspace generator](../../../../scripts/make-scale-workspace.ts), wrapped it in an SFC
script block, and added template, CSS, and SCSS blocks. The resulting document had 100,006 lines.
This drive:

```sh
bun run drive --open /tmp/312-vue-scale-100000-4pWLpj/huge.vue --geometry 110x40
```

settled with the same visible-frame fingerprint as the 39-line fixture: 31 document-line reads,
16 fold projection lookups, two wrap projection lookups, and one layout computation. The large
drive also published `subprocessPids=[]`.

Focused document tests also changed `lang="ts"` to `lang="js"` in one revision and observed only
the script region change language. They covered incomplete closing input, custom blocks, multiple
style languages, lossless spans, compiler UTF-16 offsets crossing to grapheme positions, and one
SFC parse per revision.

## Verification

- The enforcing hook completed the full merge gate for both product commits with
  `GATE_EXIT=0`. No gate bypass was used.
- The final hook passed TypeScript checks, file conventions, formatting, invariant structure,
  invariant references, coverage, the full unit suite, behavioral contracts, and the input-flush
  gate.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` reported zero
  problems.
- Focused syntax, Vue, workspace-router, editor, diff, LSP, provider-registry, and completion tests
  passed.
- The new PTY contract had a positive control. I deliberately routed SCSS blocks through CSS. The
  contract exited 1 at `SCSS nesting and line comments use the SCSS source`. I restored SCSS
  routing, and the same contract passed.
- Structural queries found `VueSyntaxSource` only in the Vue module. `VuePlugin` appears only in
  the Vue module and the default plugin manifest. A production-source search found no `.vue`
  literal outside the Vue module.
- `git status --porcelain` is empty.

## Bycatch

- FIXED:
  [the completed metadata for unknown task-variable pass-through task
  #305](../../completed/305-unknown-task-variables-pass-through/meta.json) lacked its final newline,
  so the repository-wide Prettier gate blocked every commit. Commit `df39b2c8` adds only that
  newline.
- The panel-split contract timed out while waiting for the reordered `agent,terminal` status in
  two hook runs that overlapped several other worktree gates. Both built-in retries timed out. The
  isolated command `bun scripts/harness/smoke-panel-split-harness.ts` then passed every arm, and
  the later enforcing hooks passed. I did not change its condition or timeout.
- The 100,006-line drive showed the built-in Claude task exit with
  `/bin/bash: line 1: claude: command not found` twice in its panel output. I did not recheck this
  outside that drive.
- Plain nonsense: [Bootstrap](../../../../src/modules/app/Bootstrap.ts) imports
  `LanguageRegistry`, but the structural identifier query finds only the import and no use in that
  file. I left it unchanged because it is outside this task.
