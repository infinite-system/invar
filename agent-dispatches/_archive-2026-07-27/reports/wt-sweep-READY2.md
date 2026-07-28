# File-grammar sweep phase 1 — READY

**Branch:** `refactor-file-grammar-sweep`

**Tip SHA:** `448d81e32f947170fc7925a73210dd73cf1e9ebb`

**Commits:**

- `86639d4` — AST checker, exhaustive checker tests, conventions-gate wiring, and removal of the superseded manifest-on-top assertion.
- `1384b3c58f975062f2386b643c6a9683ec116818` — syntax pilot conversion.
- `448d81e` — blame-ignore file plus the phase-2 append convention.

## Checker design

`scripts/check-file-grammar.ts` is a Bun-run TypeScript checker. It parses source with
`ts.createSourceFile()` and consumes `sourceFile.statements` in source order.

Class-file grammar:

1. imports;
2. eponymous raw `class $FileName`;
3. immediately-following `export namespace FileName` construction/type manifest;
4. type aliases and interfaces;
5. end of file.

The namespace manifest must export `$Class` bound to the eponymous raw class and `Class` selected
from the same raw form through `Static`, `Reactive`, or the honest plain-class form. Namespace
behavior is rejected.

Contract-interface grammar:

1. imports;
2. eponymous exported interface;
3. supporting type aliases and interfaces;
4. end of file.

The six exact contract-interface paths and test-pair exemptions are:

- `src/modules/agent/AgentBackend.ts`
- `src/modules/agent/AgentEvents.ts`
- `src/modules/lsp/LanguageProvider.ts`
- `src/modules/narration/TtsBackend.ts`
- `src/modules/terminal/TerminalBackend.ts`
- `src/modules/ui/PaneContent.ts`

Each exemption has an inline justification in the checker. No generated-file or entry-file
exemptions exist because the current module tree contains neither.

Enforced failures:

- missing, exported, or out-of-order eponymous raw class;
- missing or out-of-order eponymous contract interface;
- invalid or behavior-bearing namespace manifest;
- module-level function declarations;
- module-level variable statements;
- type aliases/interfaces above the eponymous declaration;
- `private` modifiers;
- `#private` members;
- arrow-function class fields;
- `new $Class` / `new Namespace.$Class` construction bypasses;
- tests or test support under `__tests__/`;
- missing colocated `Foo.test.ts` for an eponymous class.

The checker is wired as step 1 of `scripts/conventions-gate.sh`. The prior
`scripts/check-exported-capabilities.mjs` manifest-on-top/hoisted-backing-function assertion was
removed because it contradicted the new class-owned method grammar.

## Failure-path fixture proof

`bun test scripts/check-file-grammar.test.ts`:

- 16 pass, 0 fail;
- 14 malformed in-memory fixtures, one for every checker rule, each verified to produce its
  specific failure;
- one complete class grammar fixture passes;
- one complete contract-interface grammar fixture passes without a test pair.

## Syntax pilot conversion

`src/modules/syntax/` is fully green under the checker.

- `Highlighter.ts`: moved exported types below the namespace; converted every tokenizer/helper to
  a protected static class method.
- `$highlightLine` and `$sliceSpans`: the old detached `$name` functions plus static manifest
  arrow fields collapsed into the public `highlightLine` and `sliceSpans` methods themselves.
  There is no wrapper/raw split, so retaining `$name` would create a false seam.
- The TypeScript keyword set moved to the protected static `$typescriptKeywords` cached getter.
  It caches on first late-bound class access, preserving the prior singleton construction cost
  while allowing subclasses to override before first use.
- `LanguageRegistry.ts`: the extension table moved to the protected static
  `$languagesByExtension` cached getter, callers read it through `this`, and the stateless
  capability now honestly selects `Static($LanguageRegistry)`.
- The former combined `__tests__/Highlighter.test.ts` moved beside `Highlighter.ts`; registry
  assertions moved to the new colocated `LanguageRegistry.test.ts`.
- A registry subclass test proves the protected table getter is late-bound and overridable.
- Existing public type names and behavior were preserved.

Pilot commit `1384b3c58f975062f2386b643c6a9683ec116818` is present in
`.git-blame-ignore-revs`; `git blame --ignore-revs-file .git-blame-ignore-revs` succeeds.

## Phase-2 wave map

Post-pilot whole-tree checker result: expected exit 1 with **1,662 violations**. `syntax` is green
and therefore absent from the failing output.

| Module | Violations |
| --- | ---: |
| agent | 264 |
| app | 22 |
| commands | 14 |
| diff | 73 |
| editor | 92 |
| git | 122 |
| image | 69 |
| kernel | 8 |
| keybindings | 19 |
| layout | 10 |
| lsp | 154 |
| markdown | 102 |
| narration | 48 |
| navigation | 5 |
| search | 34 |
| settings | 36 |
| storage | 8 |
| syntax | 0 |
| system | 43 |
| terminal | 53 |
| theme | 58 |
| ui | 369 |
| workspace | 59 |
| **Total** | **1,662** |

Rule totals:

| Rule | Violations |
| --- | ---: |
| arrow-function class field | 1 |
| class-file order | 132 |
| construction bypass | 1 |
| contract-interface order | 2 |
| missing eponymous class | 2 |
| missing eponymous interface | 1 |
| missing colocated test | 86 |
| module-level function | 238 |
| module-level variable | 156 |
| namespace manifest | 2 |
| private modifier | 719 |
| test colocation | 34 |
| type before eponymous | 288 |
| **Total** | **1,662** |

Full output: `/tmp/wt-sweep-file-grammar-final.out`.

## Files changed

- `.git-blame-ignore-revs`
- `project.conventions.md`
- `scripts/check-exported-capabilities.mjs`
- `scripts/check-file-grammar.test.ts`
- `scripts/check-file-grammar.ts`
- `scripts/conventions-gate.sh`
- `src/modules/syntax/Highlighter.ts`
- `src/modules/syntax/Highlighter.test.ts` (moved from `__tests__/`)
- `src/modules/syntax/LanguageRegistry.ts`
- `src/modules/syntax/LanguageRegistry.test.ts`

`TASK.md` and `TASK2.md` remain untouched and untracked task inputs.

## Verification

- Required rebase onto `origin/main`: branch already up to date.
- `bunx tsc --noEmit`: PASS.
- `bun test`: 841 pass, 0 fail, 12,850 expectations across 110 files.
- `bun scripts/check-file-grammar.ts src/modules/syntax`: PASS, 4 TypeScript files.
- Checker fixtures: 16 pass, 0 fail.
- Whole-tree checker: expected RED inventory, 1,662 violations; pilot module remains green.
- `smoke-comment-styling.sh`: ALL-PASS.
- `bun scripts/harness/smoke-comment-styling-harness.ts`: ALL-PASS.
- `bun scripts/harness/smoke-editor-harness.ts`: ALL-PASS.
- Invariant checker `--all`: all contracts PASS.
- Invariant checker `--refs`: 534 annotations and 39 lattice links resolved, 0 problems.
- `git diff --check`: PASS.
- Merge gate: not run, per task constraint.

Working tree after completion contains only the pre-existing untracked `TASK.md` and `TASK2.md`.

## Task 3 — converted-module enforcement ratchet

**New tip SHA:** `a2d8b5b24aaf1f3c63992f67f144b9f47aed4ab7`

### Ratchet design

- `scripts/check-file-grammar.ts` now owns the explicit `CONVERTED_MODULES` set, initially
  containing `syntax`.
- A violation in a listed module is enforced and exits 1. A violation in an unlisted module is
  report-only and does not affect the exit status.
- Every run prints one per-module table with `enforced` or `reported` status, so the 1,662-site
  phase-2 wave map remains visible in successful gate logs.
- The checker header records the ratchet contract: each phase-2 wave adds its modules to
  `CONVERTED_MODULES` in the same commit that converts them. Listed modules can never regress.
- `scripts/conventions-gate.sh` now streams the checker output on both success and failure and
  describes the real converted-module mechanism.

### Fixture proof

`bun test scripts/check-file-grammar.test.ts` passes 18 tests:

- a real temporary `src/modules/syntax/Example.ts` fixture with detached module data reports
  `syntax	enforced	1` and the checker exits 1;
- the identical fixture under `src/modules/editor/` reports `editor	reported	1`, prints
  `check-file-grammar: PASS`, and exits 0.

### Verification

- `bun scripts/check-file-grammar.ts`: PASS; `syntax` remains green and all 1,662 legacy
  violations are reported by module.
- `bunx tsc --noEmit`: PASS.
- `bun test`: 843 pass, 0 fail, 12,856 expectations across 110 files.
- invariant checker `--all`: all contracts PASS.
- invariant checker `--refs`: 534 annotations and 39 lattice links resolved, 0 problems.
- `bash scripts/conventions-gate.sh`: PASS end-to-end with the phase-2 table visible.
- Commit used `SKIP_GATE=1`; no merge gate, push, deletion, or branch operation was performed.

## Task 4 — settings-applied harness bare-wait repair

**New tip SHA:** `c5e9830fa3928bf88b47b3b2444a77bea3a5d612`

### Wait converted

- `smoke-settings-applied-harness.ts` no longer marks a one-notch wheel action as requiring a
  future frame before the existing momentum-silence condition. The low-gain case can validly
  produce no new painted row, so it now sends without a frame expectation and settles by
  synchronized-output silence.
- The LSP fixture now sends the ordered `Down`, `Enter` input without an intermediate frame wait
  and independently polls for `big.ts` to be active plus the size-suppressed/diagnostics result.
- The settings port now contains zero direct `awaitQuiescence()` calls.

### Sibling sweep

All 42 harness ports registered in `scripts/merge-gate.sh`, plus `HarnessSmoke` and
`HarnessSmokeSupport`, were grepped and audited for the adjacent bare-next-frame shape. The sweep
removed 10 direct conditionless `awaitQuiescence()` sites and three stale frame expectations:

- tree movement/open sequencing now flows directly into named grid/status conditions in
  diagnostics, go-to-definition, hover, settings-applied, and tabs;
- tabs additionally polls the file-focus and tab-count conditions instead of waiting for
  intermediate frames;
- the permission prompt waits for the visible prompt-without-stray-text condition;
- Markdown release no longer expects a frame, and Escape waits for Find to disappear and the
  preview border to reappear;
- the git-watch no-crash action uses frame silence without demanding an action frame;
- the voice-picker click helper delegates completion to each caller's existing status predicate.

Post-sweep static result: zero direct `awaitNextCompletedFrame()` calls in ports/helpers, zero
`Down` → `awaitQuiescence()` → `Enter` sibling sequences, and zero direct
`awaitQuiescence()` calls in settings-applied.

### Consecutive driven runs

| Harness | Result |
| --- | ---: |
| settings-applied | 10/10 PASS |
| diagnostics | 5/5 PASS |
| goto-definition | 5/5 PASS |
| hover | 5/5 PASS |
| tabs | 5/5 PASS |
| agent-permissions | 5/5 PASS |
| git-watch | 5/5 PASS |
| markdown | 5/5 PASS |
| voice-picker | 5/5 PASS |

### Verification

- `bunx tsc --noEmit`: PASS.
- `bun test`: 843 pass, 0 fail, 12,856 expectations across 110 files.
- invariant checker `--all`: PASS.
- invariant checker `--refs`: 534 annotations and 39 lattice links resolved, 0 problems.
- `git diff --check`: PASS.
- Commit used `SKIP_GATE=1`; no merge gate, push, deletion, or branch operation was performed.
