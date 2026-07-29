# 222 — the classification: which capability namespaces are effectful

Analysis only. No production code changed. Every count below is reproducible by the exact
commands quoted.

## The criterion, stated once

A capability namespace is **EFFECTFUL** when its own module reaches an ambient capability. That
means one of two structural facts:

1. it imports a `node:*` builtin, or
2. it reads or constructs one of the ambient capability globals `process`, `Bun`, `Date`,
   `performance`, `globalThis`,

or it imports a sibling namespace that is already effectful by 1 or 2.

Everything else is **PURE**. A pure namespace turns arguments into results. Two callers that pass
the same arguments get the same answer, on any machine, in any order.

The folder does not decide. The effect decides. `src/modules/storage/` holds one pure namespace,
and `src/modules/system/` holds two.

The criterion is deliberately syntactic. It is a question a parser can answer, so the same
question can run in the gate. A criterion that needs judgement is a criterion that drifts.

## How the census was taken

The tool is `bun scripts/ast-query.ts` for the ready questions. Two questions the ready modes do
not cover were run from `census-222.ts`, a one-off census in this task folder that uses the
three-move pattern from [.claude/skills/ast-query/SKILL.md](../../../../.claude/skills/ast-query/SKILL.md). Copy it to the repository root to
run it. It needs `typescript` to resolve, so run it from inside the repository.

```sh
# per-namespace external users (this is the number quoted as "22 files" and friends)
bun scripts/ast-query.ts identifiers Files

# the classification, applied uniformly by the criterion above
bun census-222.ts classify src/modules/system src/modules/storage

# who already wraps what
bun census-222.ts getters

# per-file direct versus getter-wrapped use
bun census-222.ts uses Files

# where each bare site sits: instance member, static member, or module level
bun census-222.ts sites Files
```

## The classification

`bun census-222.ts classify src/modules/system src/modules/storage`:

| namespace | verdict | what the criterion saw |
| --- | --- | --- |
| `src/modules/system/Clipboard.ts` | EFFECTFUL | `import node:crypto`, and `Processes` |
| `src/modules/system/Clock.ts` | EFFECTFUL | `Date.now` |
| `src/modules/system/Environment.ts` | EFFECTFUL | `process.cwd`, `process.stdout`, `process.env` |
| `src/modules/system/Files.ts` | EFFECTFUL | `import node:fs`, `node:path`, `node:os` |
| `src/modules/system/FrameProbe.ts` | EFFECTFUL | `import node:fs`, `process.env` |
| `src/modules/system/Logging.ts` | EFFECTFUL | `import node:fs`, `node:path`, `new Date()` |
| `src/modules/system/Momentum.ts` | EFFECTFUL AT THE EDGE | `performance.now` |
| `src/modules/system/Processes.ts` | EFFECTFUL | `Bun.spawn`, `process.env` |
| `src/modules/system/StatusChannel.ts` | EFFECTFUL | `import node:fs`, `process.env` |
| `src/modules/system/TextSegmentation.ts` | PURE | no ambient capability |
| `src/modules/storage/UndoStore.ts` | PURE | no ambient capability |

Nine effectful, two pure, out of eleven.

### The brief said Momentum is pure. It is not, and the finding is small and real.

`src/modules/system/Momentum.ts:69` and `:121` read `performance.now()` as a DEFAULT PARAMETER
value:

```ts
static queueImpulse(
  momentum: ScrollMomentum,
  deltaRows: number,
  currentTimestampMilliseconds = performance.now(),
): void
```

The physics are pure. The default argument is not. And the default is live in production: all 14
production calls to `queueImpulse` pass two arguments, so `performance.now()` fires at every one
of them.

```sh
bun scripts/ast-query.ts named-calls queueImpulse   # 14 sites, none passes a timestamp
```
Checked by reading the call sites: `src/modules/ui/ScrollableTextViewport.ts:156` and `:166`,
`src/modules/workspace/Workspace.ts:500` and `:508`, and the rest in `DiffView`, `GitWorkspace`,
`FileTreeWorkspace`, `MarkdownSplitView`, `TerminalPaneContent`.

The honest repair is NOT a getter. It is to make the caller supply the frame timestamp it already
has, which turns Momentum fully pure and removes a second clock from the app. That is one
argument at 14 sites. It is a separate concern from the provider seam, so it is filed as bycatch,
not folded into #223.

Momentum keeps the verdict EFFECTFUL AT THE EDGE, PURE IN THE GENERATOR. The gate rule below
counts it as effectful, because the criterion is uniform and the reading is true today.

### TextSegmentation is pure, with one named caveat

`src/modules/system/TextSegmentation.ts:4` and `:11` build `new Intl.Segmenter(undefined, …)`.
The `undefined` locale reads the host default locale, which is ambient. The criterion does not
catch it and should not: the granularity used is `grapheme` and `word`, the result does not vary
across the locales this app runs in, and no consumer needs to inject one. Recorded here so a
later reader does not mistake the silence for an oversight. This is a hypothesis about locale
stability, not a measured claim.

## The seams that already exist

`bun census-222.ts getters` finds **42** accessors in production whose whole body is
`return X.Class` or `return X.$Class`. The task file estimated about 65. The 42 is the exact
count under the exact criterion. The gap is the difference between a shallow text count and a
parse.

The 42 by namespace:

| namespace wrapped | getters | namespace wrapped | getters |
| --- | ---: | --- | ---: |
| `TextCoordinates` | 5 | `SolidThumbScrollBar` | 1 |
| `Files` | 4 | `SplitterModel` | 1 |
| `Processes` | 3 | `PngDecoder` | 1 |
| `ImageResample` | 3 | `JpegDecoder` | 1 |
| `DiffAlignment` | 2 | `ImageDecoders` | 1 |
| `Highlighter` | 2 | `HalfBlockRenderer` | 1 |
| `GitCommands` | 2 | `KittyGraphics` | 1 |
| `LanguageRegistry` | 1 | `SixelEncoder` | 1 |
| `Momentum` | 1 | `Environment` | 1 |
| `ReadOnlyTextBuffer` | 1 | `Logging` | 1 |
| `ScrollbarGeometry` | 1 | `StatusChannel` | 1 |
| `SelectableText` | 1 | `SpeakableText` | 1 |
| `SelectionDragBehavior` | 1 | `VoiceDiscovery` | 1 |
| | | `MockTtsBackend` | 1 |
| | | `SystemTtsBackend` | 1 |

Two facts stand out.

**The pattern was invented at effect boundaries.** `Processes` (3), `Files` (4), `GitCommands`
(2), `Environment`, `Logging`, `StatusChannel`, `VoiceDiscovery`, and the two TTS backends are
all effectful. Nobody wrote the rule down. Agents reached for the getter when a test had to stop
a real process, a real disk, or a real voice.

**One file already holds the complete pattern.** `src/modules/lsp/LanguageClient.ts:104` to
`:121` declares five seam getters in a row: `TextCoordinates`, `Environment`, `Files`, `Logging`,
`StatusChannel`. Four of the five are effectful. The convention proposed in
[analysis-222-convention.md](analysis-222-convention.md) is that file, generalised.

**And `TtsFactory` is the mature form.** `src/modules/narration/TtsFactory.ts:15` and `:19` wrap
the two backends behind getters, and `:27` reads `INVAR_TTS_BACKEND` to pick between them. That
is provider selection inside the seam, which is exactly what a per-connection `DataStore` needs.
`src/modules/narration/TtsFactory.test.ts:20` and `:24` override both getters.

### The seam getter is exercised, not decorative

19 test classes override a getter (`grep -rn "override get " --include='*.test.ts' src/modules`).
The capability-seam ones:

- `src/modules/image/ImagePreview.test.ts:20` overrides `get Files` with a fake filesystem.
- `src/modules/lsp/LspProcess.test.ts:6` overrides `get Processes` with a missing executable.
- `src/modules/narration/SystemTtsBackend.test.ts:93` overrides `get Processes`.
- `src/modules/git/GitRepository.test.ts:22` and `src/modules/git/GitWorkspace.races.test.ts:17`
  override `get GitCommands`.
- `src/modules/narration/TtsFactory.test.ts:20` and `:24` override both backend getters.

The alternative path is not used. The whole tree has **zero** `mock.module` or `spyOn` calls
(`grep -rn "mock.module\|spyOn" --include='*.test.ts' src/modules` returns 0). And the mutable
`Class` slot is assigned in exactly two test files, neither of them a capability
(`src/modules/app/AppLoader.test.ts`, `src/modules/app/IvueStaticGetterCapability.test.ts`).

So the getter is how this repo actually substitutes a capability. The convention writes down what
the tests already do.

### Clock shows the shape of the hole

`src/modules/system/Clock.ts:14` publishes `freeze(timeSource)`, a test hook in production code.
Its only caller is `src/modules/system/Clock.test.ts:6` and `:9`. Nothing else in the tree calls
it.

A capability that grows its own private test hook is a capability with no seam. The two real
consumers, `src/modules/editor/Editor.ts:507` and `src/modules/git/GitRepository.ts:132`, cannot
use `freeze` without freezing time for the whole process. A getter gives each of them its own
clock and makes `freeze` deletable.

## External use, direct versus wrapped

`bun census-222.ts uses <Namespace>`. "Bare" means a `X.<member>` access that is not inside that
file's own seam getter for `X`.

| namespace | external files | files with a seam getter | files touching it bare | bare sites |
| --- | ---: | ---: | ---: | ---: |
| `Files` | 26 | 4 | 22 | 98 |
| `Momentum` | 11 | 1 | 10 | 72 |
| `StatusChannel` | 8 | 1 | 7 | 26 |
| `Environment` | 5 | 1 | 4 | 19 |
| `Logging` | 12 | 1 | 11 | 18 |
| `Clipboard` | 8 | 0 | 8 | 12 |
| `TextSegmentation` (pure) | 4 | 0 | 4 | 10 |
| `Processes` | 10 | 3 | 7 | 9 |
| `Clock` | 2 | 0 | 2 | 2 |
| `FrameProbe` | 1 | 0 | 1 | 1 |
| `UndoStore` (pure) | 1 | 0 | 1 | 1 |

The task file's shallow figures are confirmed: Files 22, Logging 11, Clipboard 8, Environment 4,
Clock 2. Processes reads 7 here and 6 there. The extra file is
`src/modules/system/Clipboard.ts`, which sits inside the capability layer itself. Six consumers
are outside it.

The four files that already wrap `Files` are `src/modules/image/ImagePreview.ts:31`,
`src/modules/lsp/LanguageClient.ts:112`, `src/modules/lsp/TypeScriptProvider.ts:56`, and
`src/modules/tasks/TaskConfiguration.ts:5`. The three that wrap `Processes` are
`src/modules/git/GitWatcher.ts:59`, `src/modules/lsp/LspProcess.ts:14`, and
`src/modules/narration/SystemTtsBackend.ts:147`.

## The conversion has no structural hazard

`bun census-222.ts sites <Namespace>` reports where each bare site sits.

| namespace | inside an instance member | inside a static member | at module level |
| --- | ---: | ---: | ---: |
| `Files` | 64 | 34 | 0 |
| `Momentum` | 71 | 1 | 0 |
| `StatusChannel` | 17 | 9 | 0 |
| `Environment` | 6 | 13 | 0 |
| `Logging` | 12 | 6 | 0 |
| `Clipboard` | 8 | 4 | 0 |
| `Processes` | 5 | 4 | 0 |
| `Clock` | 2 | 0 | 0 |
| `FrameProbe` | 0 | 1 | 0 |

**Zero module-level sites, for every namespace.** Every bare access already sits inside a class
member, so every one of them can read a getter on `this` with no restructuring. A static member
reads a `static get`, an instance member reads a plain `get`. That is why the migration cost in
[analysis-222-convention.md](analysis-222-convention.md) is a straight line and not a risk.

`bun census-222-classes.ts Files Processes Clock` counts the classes that touch each namespace:
26 for `Files`, 10 for `Processes`, 2 for `Clock`. One class per file in every case, so the
getter count equals the file count. Subtract the classes that already declare the getter and the
new getters owed are 22, 7, and 2.

`src/modules/tasks/TaskConfiguration.ts:5` shows the static form, `LanguageClient` the instance
form. Both already exist in the tree.

## The whole sweep, measured

The union of files that touch any effectful namespace bare is **51 files**, holding **254 bare
sites**. That is the sweep the user judged excessive, and the measurement agrees it is large.
Reproduce with:

```sh
bun scripts/check-effect-seams.ts   # proposed, see analysis-222-convention.md
# effect seam: 9 effectful of 11 capability namespaces; 254 bare site(s) across 71 file/namespace pair(s)
```

254 rather than 257 because the checker excludes the three `Processes` sites inside
`src/modules/system/Clipboard.ts`. A capability calling a sibling capability is inside the layer,
not a consumer of it.
