# File-grammar sweep checkpoint

**Status:** CHECKPOINT

**Branch:** `refactor-file-grammar-sweep`

**Tip SHA:** `7d77862`

The inventory exceeds the task's approximately 40-site stop threshold, so no source,
convention, checker, gate, or test files were changed.

## Inventory scope and method

The inventory parsed TypeScript source through TypeScript 5.9.3's compiler API and inspected
`SourceFile.statements` in source order.

- Included: 163 production `.ts` files under `src/modules/`.
- Explicitly excluded from the production count: `*.test.ts` and files below `__tests__/`.
  A future checker should encode those test paths as explicit exemptions rather than silently
  filtering them.
- Generated files found: none.
- Entry files under `src/modules/` found: none.
- Existing `types.ts` barrels found: 0.

Eight production files have no eponymous class and need either an explicit checker exemption or
an owner-class conversion:

- `src/modules/lsp/LanguageProvider.ts`
- `src/modules/ui/PaneContent.ts`
- `src/modules/agent/AgentEvents.ts`
- `src/modules/agent/AgentBackend.ts`
- `src/modules/keybindings/keybindings.defaults.ts`
- `src/modules/keybindings/keybindings.mac.ts`
- `src/modules/narration/TtsBackend.ts`
- `src/modules/terminal/TerminalBackend.ts`

The six classless PascalCase files are type/seam owners; the two lowercase keybinding files are
role-data collections. Their treatment must be explicit in the future AST checker.

## Counts before conversion

| Rule | Violation sites | Files |
| --- | ---: | ---: |
| No detached helpers/data | 247 module-level function declarations + 158 module-level variable statements = **405** | 70 with functions; 65 with variables |
| Class-first layout | **131** class-bearing files do not begin with the expected `$FileName` class after imports | 131 of 155 class-bearing production files |
| Types below class | **288** type aliases/interfaces occur above the eponymous class | 116 |
| `types.ts` barrels | **0** | 0 |
| Aggregate rule-site observations | **824** | Overlapping by design |

The aggregate is a count of AST sites/files per rule, not a count of unique files. It is still
well above the stop threshold under the narrowest useful interpretation: rule 1 alone has 405
sites.

## Counts by module

`Detached` is module-level functions plus variable statements. `Class-first` is failing files.
`Types-above` is individual type/interface declarations above the class.

| Module | Production files | Detached | Class-first | Types-above | Classless |
| --- | ---: | ---: | ---: | ---: | ---: |
| agent | 25 | 72 | 19 | 29 | 2 |
| app | 6 | 3 | 3 | 5 | 0 |
| commands | 3 | 2 | 3 | 2 | 0 |
| diff | 3 | 14 | 3 | 11 | 0 |
| editor | 9 | 47 | 5 | 9 | 0 |
| git | 12 | 31 | 12 | 29 | 0 |
| image | 10 | 35 | 8 | 12 | 0 |
| kernel | 1 | 0 | 1 | 1 | 0 |
| keybindings | 3 | 4 | 1 | 5 | 2 |
| layout | 1 | 0 | 1 | 3 | 0 |
| lsp | 6 | 7 | 5 | 30 | 1 |
| markdown | 5 | 4 | 5 | 17 | 0 |
| narration | 7 | 21 | 4 | 5 | 1 |
| navigation | 1 | 1 | 1 | 1 | 0 |
| search | 3 | 5 | 3 | 11 | 0 |
| settings | 2 | 11 | 2 | 12 | 0 |
| storage | 1 | 2 | 1 | 2 | 0 |
| syntax | 2 | 11 | 2 | 3 | 0 |
| system | 9 | 14 | 8 | 13 | 0 |
| terminal | 10 | 20 | 5 | 3 | 1 |
| theme | 4 | 37 | 3 | 11 | 0 |
| ui | 35 | 60 | 31 | 61 | 1 |
| workspace | 5 | 4 | 5 | 13 | 0 |
| **Total** | **163** | **405** | **131** | **288** | **8** |

Representative sites:

- Detached helper: `src/modules/search/FindInBuffer.ts:22`
  (`escapeRegularExpression`)
- Detached data/state: `src/modules/editor/EditorCoordinates.ts:13`
  (`segmenter`)
- Class-first: `src/modules/commands/CommandScoring.ts` begins with
  `$fuzzyScore`, not `$CommandScoring`
- Type ordering: `src/modules/system/Files.ts:16` (`DirEntry`)

## Derived house grammar

For an ordinary class module, the new source-order grammar should be:

1. imports;
2. invariant annotations attached to the enforcement point;
3. eponymous implementation class `class $X`;
4. immediately-following public manifest `export namespace X` containing `$Class`, the honest
   `Class` binding (`Static`, `Reactive`, or raw), and applicable namespace types;
5. owner-file module type aliases/interfaces;
6. end of file.

Detached `$name` implementation functions from the previous manifest-first convention cannot
remain after the namespace: their implementations move into the class. Public capability
members remain public; supporting helpers and data become `protected` members so subclasses can
override them.

## Sample conversion

`FindInBuffer.ts` is representative because it exercises all three rules. This is a conversion
shape for conductor review, not an applied diff:

```ts
import { Reactive } from 'ivue';
import { ref, shallowRef } from 'vue';
import type { TextDocument } from '../editor/TextDocument';
import { EditorCoordinates } from '../editor/EditorCoordinates';

class $FindInBuffer {
  protected replacementContexts: MatchReplacementContext[] = [];

  constructor(public readonly document: TextDocument.Instance) {}

  // Existing state, derived getters, and public methods remain here.

  protected escapeRegularExpression(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  protected expandReplacement(
    replacement: string,
    context: MatchReplacementContext,
  ): string {
    // Existing replacement implementation, unchanged.
    return replacement.replace(/* existing arguments */);
  }

  protected createRegularExpression(): RegExp | null {
    if (this.query.value.length === 0) return null;
    const querySource = this.useRegex.value
      ? this.query.value
      : this.escapeRegularExpression(this.query.value);
    // Existing implementation continues unchanged.
  }
}

export namespace FindInBuffer {
  export const $Class = $FindInBuffer;
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
}

export interface FindInBufferMatch {
  line: number;
  startColumn: number;
  endColumn: number;
}

interface MatchReplacementContext {
  matchedText: string;
  capturedTexts: readonly (string | undefined)[];
  namedCapturedTexts: Readonly<Record<string, string | undefined>> | undefined;
  prefixText: string;
  suffixText: string;
  startUtf16Offset: number;
  endUtf16Offset: number;
}
```

Calls to the detached helpers become `this.escapeRegularExpression(...)` and
`this.expandReplacement(...)`. They are instance members because the caller is a stateful,
subclassable reactive controller; using `this` preserves the override seam. The bodies and call
order remain unchanged.

## Checker design note for the resumed sweep

The permanent checker should use the TypeScript compiler API, never regular expressions:

- Parse each in-scope file with `ts.createSourceFile`.
- Walk `sourceFile.statements` in order.
- Derive `$X` and `namespace X` from the PascalCase filename.
- Accept only the explicit grammar above for ordinary class modules.
- Reject every top-level `FunctionDeclaration`, `VariableStatement`, `EnumDeclaration`, stray
  export, or out-of-order type/interface.
- State every non-class grammar/exemption in code by exact path or explicit test/generated-file
  predicate. In particular, adjudicate the eight classless production files listed above.
- Test the failure path using a temporary malformed fixture containing a type before its class
  and a detached function; assert a non-zero checker exit. Do not place the fixture under
  `src/modules/`.
- Wire the checker into `scripts/conventions-gate.sh` only after the production sweep is green.

## Files changed

- Repository files changed by this checkpoint: **0**
- Checkpoint artifact: `/tmp/wt-sweep-READY.md`
- Existing untracked task input left untouched: `TASK.md`

## Verification transcript

- `bun install --frozen-lockfile`: PASS (dependencies materialized; no tracked file changed)
- TypeScript-AST production inventory: PASS
- Threshold decision: 824 > approximately 40, therefore CHECKPOINT and STOP
- `git status --short`: only the pre-existing untracked `TASK.md`
- `tsc`, `bun test`, grammar checker, conventions gate, tmux smoke, and harness smoke:
  **not run**, because the task explicitly requires stopping after inventory when the threshold
  is exceeded.
