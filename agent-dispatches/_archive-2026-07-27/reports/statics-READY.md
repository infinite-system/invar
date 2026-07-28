# BLOCKED — ivue 2.2.0 cached-statics migration

Branch: `refactor-ivue-statics`

Commit: `ad3bd66` (`Migrate cached statics to ivue 2.2.0`)

Tree: clean.

The requested mechanical migration and naming gate are committed, but the
migration is not behaviorally ready. The shipped `Static()` cache semantics do
not cover every class/test topology that previously used the hand-rolled
getter cache, and unconditional shallow freezing makes the existing
`StatusChannel.$state` mutation crash application startup.

## Delivered

- Bumped `ivue` from `^2.1.0` to `^2.2.0` in `package.json` and `bun.lock`;
  installed version is 2.2.0.
- Removed all 56 `Object.defineProperty(this, ...)` self-replacements from 37
  source files. After: zero matches (`rg` exit 1, zero output).
- Removed four private cache helpers (`cache` in `ThemePalettes`,
  `ThemeIcons`, and `CompletionItemKinds`; `cachedSet` in `Settings`) and
  unwrapped their 33 uses.
- Added `scripts/check-static-getter-naming.ts`, its seven-test checker suite,
  and a conventions-gate step. The checker scans static getters in `src` and
  `scripts`, ignores instance getters, rejects lowercase single-return literal
  getters, rejects uppercase derived getters, and always rejects
  `$SCREAMING_SNAKE_CASE`. It fails if it inspects zero files.
- Documented both independent axes in `project.conventions.md`: `$` means
  cached versus uncached; case means literal versus derived.
- Renamed 150 static getter declarations and their references:
  132 ordinary literal-static renames plus the 18 Pass A/Pass B disagreements
  listed below. Removed the redundant public `ThemePalettes.dark` and
  `ThemePalettes.light` delegates and published `DARK` / `LIGHT` directly.
- Added a regression test proving that a parent-first cached read does not
  shadow an override when the raw subclass is itself passed through
  `Static()`. It also checks stable identity and shallow freezing.

The commit hook reformatted the staged TypeScript. Post-commit checks of the
exact committed bytes passed TypeScript, conventions, the checker suite, and
the zero-self-replacement acceptance check.

## Blocking findings

### 1. `$` caching is absent outside `Static()` wrappers

`Static()` installs the new getter caches only on the selected class that it
creates. Removing the hand-rolled caches therefore makes a `$` getter
fresh-per-read when its namespace is published with `Reactive(...)`, as a raw
class, or when a test directly uses `class TestDouble extends X.$Class`
without wrapping that subclass in `Static()`.

A runtime probe produced:

```json
{"reactiveStaticStable":false,"staticWrappedStable":true}
```

The following 29 intended cached getters, across 14 non-`Static()` classes, are
now outside the shipped cache mechanism:

- `LanguageClient.$noCapabilities`
- `JsonRpc.$headerEnd`
- `TypeScriptProvider.$typescriptExtensions`
- `TypeScriptProvider.$serverCandidates`
- `TypeScriptProvider.$defaultOrder`
- `OpenPty.$openPtyLibrary`
- `OpenPty.$terminalControlLibrary`
- `Settings.$allowedScrollModifiers`
- `Settings.$allowedGlyphModes`
- `Settings.$allowedWorkspaceTabPositions`
- `Settings.$allowedSidebarPositions`
- `Settings.$allowedPanelAlignments`
- `Settings.$allowedDockVerticalSpans`
- `Settings.$allowedTypeScriptServers`
- `Settings.$allowedAgentProviders`
- `Settings.$allowedAgentTerminalFollowModes`
- `SettingsPanel.$settingDescriptors`
- `ShortcutHelp.$mergedShortcutContexts`
- `ShortcutHelp.$categoryByActionPrefix`
- `ShortcutHelp.$fallbackTitleByActionIdentifier`
- `HoverCard.$fenceLanguage`
- `OverlayCoordinator.$exclusiveOverlayNames`
- `AgentSpinner.$defaultScheduler`
- `DiffView.$overviewKindsByAlignment`
- `MarkdownDocument.$emptyBlocks`
- `MarkdownPreview.$emptyBlocks`
- `MarkdownParser.$inlineStyles`
- `MarkdownParser.$emptyNumbers`
- `MarkdownParser.$emptyStrings`

The full unit run proves two concrete consequences:

- `EditorWrap.test.ts`: a direct subclass of `EditorWrap.$Class` rebuilds its
  fold projection 40,001 times instead of once, then times out.
- `DiffView.test.ts`: the Reactive class recomputes its overview projection;
  indexed reads double from 1,055 to 2,110.

I did not wrap stateful classes in `Static()`, re-roll a local cache, or change
namespace forms. Those would violate the task and the repository's honest
namespace rule.

### 2. Frozen mutable state crashes startup

`StatusChannel.$state` is a plain object cached through `Static()`. ivue 2.2.0
shallow-freezes it unconditionally. The first application update executes
`Object.assign(this.$state, patch)` and throws:

```text
fatal: TypeError: Attempted to assign to readonly property.
    at update (src/modules/system/StatusChannel.ts:61:12)
    at attach (src/modules/app/App.ts:61:25)
    at boot (src/modules/app/Bootstrap.ts:100:9)
```

Per the task, I did not clone the state, drop `$`, or reimplement caching.

### 3. ivue 2.2.0 method binding still has the order hole

`node_modules/ivue/lib/Static.ts:55` still binds a method and defines it on
`this` without an `Object.hasOwn` guard. A parent-first runtime probe followed
by a subclass call produced:

```json
{"parentFirst":"parent","ownsParentValue":true,"ownsChildValue":false}
```

The subclass therefore receives the parent-bound method. No local ivue patch
was made.

## Cached-static mutation census

Every mutation found is listed here. ivue's freeze is shallow: direct property
writes to a cached plain object throw, but freezing a `Map` or `WeakMap` object
does not prevent `.set()` / `.delete()`, and it does not freeze values stored
inside a collection.

- `StatusChannel.ts:61,86-87`: `Object.assign` and direct `frame` /
  `renderQuiescent` writes to `$state`. These throw.
- `CodeFolding.ts:45`: `$rangesByDocument.set(...)`.
- `EditorWrap.ts:135,139,356`: `$wrapMemo.delete/set` and
  `$wrapIndexByDocument.set`; lines 419-425 also mutate the cached
  `DocumentWrapIndex` value's seven fields.
- `AgentTranscriptProjection.ts:347`: `$entryProjectionCache.set(...)`.
- `BracketMatch.ts:217`: `$snapshotByDocument.set(...)`.
- `DiffView.ts:191,226`: `$overviewKindsByAlignment.set(...)` and mutation of
  its nested map. This class is also outside `Static()`, so the getter is no
  longer cached at all.
- `EditorCoordinates.ts:64,77,177,213`: four cached maps are passed to
  `memoized`; that helper performs `cache.delete` at line 53 and `cache.set` at
  line 58.

The collection mutations currently remain possible because the freeze is
shallow. The `StatusChannel` object mutation is the observed production throw.

## Pass A / Pass B disagreements

The initial naming check found 20 cached getters whose values were syntactic
literals.

Eighteen production getters dropped `$` and became uppercase:

- `CompletionItemKinds.$symbolClassesByCompletionItemKind`
- `ThemeIcons.$symbolMarks`
- `ThemeIcons.$symbolClassesByFileExtension`
- `ThemeIcons.$actionIcons`
- `ThemeIcons.$checkboxIcons`
- `ThemeIcons.$interfaceGlyphVocabularies`
- `ThemeIcons.$settingsIcons`
- `ThemeIcons.$terminalIcons`
- `ThemeIcons.$agentIcons`
- `ThemeIcons.$rightDockIcons`
- `ThemeIcons.$findIcons`
- `ThemeIcons.$alertIcons`
- `ThemeIcons.$brailleSpinnerFrames`
- `ThemeIcons.$asciiSpinnerFrames`
- `ThemeIcons.$tabSeparators`
- `ThemePalettes.$dark`
- `ThemePalettes.$light`
- `ThemePalettes.$ansi16`

Two test-only override getters need cached identity to exercise inheritance:
the new `Momentum.$defaultOptions` override and the existing
`LanguageRegistry.$languagesByExtension` override. Each now computes through
an explicitly named local before returning, so it remains a derived
lower-camel `$` getter under the specified single-return-literal AST rule.

## Positive controls

Naming gate: temporarily planted
`static get namingPositiveControl() { return 1; }` in `Momentum`. The
conventions gate exited 1 with:

```text
src/modules/system/Momentum.ts:16:24 literal-valued static getter
'namingPositiveControl' must use SCREAMING_SNAKE_CASE
static-getter-naming: FAIL (1 violation(s))
CONVENTIONS FAIL: static getter literal/derived naming
```

The plant was removed. The clean gate then exited 0.

Cache-order regression: temporarily changed the subclass override's impulse
from 99 to 22. The focused test exited 1 with `Expected: 99, Received: 22`
(15 pass, 1 fail). The plant was removed; the focused clean run passed.

## Drive evidence

The app was driven before diagnosis and again after the migration. The
baseline and migrated launches both failed before a usable frame at
`StatusChannel.update`.

Using the shared smoothness fixture/instrument:

- Small: 2,000-line flat editor fixture, exit 1 before the awaited frame.
- Large: 100,000-line flat editor fixture, exit 1 before the awaited frame.

Both showed the same `StatusChannel` readonly-property stack. No row-crossing
fingerprint or small/large parity judgment was possible because neither run
reached a document frame.

## Verification

| Check | Exit | Result |
|---|---:|---|
| Full checker suite (`bun test scripts/check-*.test.ts`) | 0 | 49 pass, 0 fail |
| Invariant checker self-tests | 0 | 49 pass, 0 fail |
| Full `bun test` | 1 | 1,597 pass, 40 fail, 4 errors |
| `scripts/conventions-gate.sh` | 0 | PASS; 574 files inspected by naming check |
| Invariant checker `--all --refs` | 0 | 867 annotations, 45 links, 0 problems |
| Coverage ratchet | 0 | 308 files; no undeclared decrease |
| `scripts/behavioral-contracts.sh` | 1 | Ran exactly once; app-dependent contracts fail at startup |
| TypeScript `tsc --noEmit` | 0 | PASS |
| `git diff --check` | 0 | PASS |
| Self-replacement search | 1 | Expected no-match exit; zero sites |

Of the 40 unit failures, 38 are downstream of frozen
`StatusChannel.$state`; the other two are the `EditorWrap` and `DiffView`
cache-loss regressions described above. The four unhandled errors also show
the `StatusChannel` exception.

The behavioral gate was invoked once only. It exited 1 after repeated
ready-timeouts and early app exits with the same `StatusChannel` stack; later
missing-frame/depth-reference errors are cascades from the failed startup.

The invariant checker found zero contract problems. Mechanically renamed
references preserve their governed behavior, but the runtime evidence means
the migration cannot claim the system invariants “Capability classes are
stateless and Static wrapped” or “Observability never crashes the app” in the
current state.

## Bycatch

None beyond the in-scope cache/freeze findings above.
