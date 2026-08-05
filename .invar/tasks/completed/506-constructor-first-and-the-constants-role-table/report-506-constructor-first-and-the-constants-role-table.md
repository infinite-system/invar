## In plain words

Many classes hid their constructor below fields and getters. I put every static member first, then
the constructor, and added a check that stops the old order from returning. The terminal panel now
looks and scrolls exactly as it did before, for both a small workspace and a 100,000-line file.

## Result

READY. The current tree has 126 production classes with constructors. No constructor follows an
instance member, and no static member follows a constructor.

The filed counts had drifted. The [task](task-506-constructor-first-and-the-constants-role-table.md)
said 85 of 113 constructors violated. The current AST found 89 constructors below instance members
and 45 late static members across 20 classes. The sweep changed 95 files and reduced both violation
counts to zero.

The new rule lives in
[check-file-grammar.ts](../../../../scripts/check-file-grammar.ts). Its planted fixture rejects an
instance getter before a constructor. A second fixture rejects a static member after a constructor.
The valid fixture accepts static members followed by the constructor.

The constants role table now lives in
[project.conventions.md](../../../../project.conventions.md) and the
[ivue skill](../../../../.claude/skills/ivue/SKILL.md). Both documents state the mechanism. Getter
and prototype method overrides dispatch during a parent constructor. A subclass field initializer
runs only after `super()` returns.

The tree contains 24 uppercase `static readonly` hot-path fields. All 24 now have a local comment
that names the hot path. The other two static readonly fields are lowercase database identity data.

## Invariant scope and verdicts

The changed root grammar and constants vocabulary implicate
[project.invariants.md](../../../../project.invariants.md) by content and annotations. The terminal
and layout source paths also implicate their local contracts. No terminal or layout record requires
class-member order.

| Record | Verdict | Evidence |
| --- | --- | --- |
| Public classes use the namespace pattern | upheld | The sweep did not change any `$Class`, `Class`, `Static`, or `Reactive` selection. The conventions gate passed. |
| Construction goes through overridable seams | upheld | The role table requires prototype `createX()` methods for construction. It also explains why a subclass field cannot control parent construction. |
| Live static reads follow the receiving class | upheld | The role table requires the receiving-class ladder. The final static-self-read census kept 0 static-body violations. |
| Size changes flow through the onSizeChange seam | upheld | [SplitterModel](../../../../src/modules/layout/SplitterModel.ts) still uses the same constructor callback and overridable method. This task did not change that file. |
| Terminal bytes cross exactly one backend seam | upheld | The `TerminalInstance` constructor body and byte wiring are byte-identical. Only its member position changed. |
| The emulator is the single source of terminal screen state | upheld | The `TerminalEmulator` parser code is unchanged. Five fixed protocol fields gained comments and moved with the static block. |

Invariant verdict: PASS. No record was stressed, violated, refined, discovered, or stale.

## Constructor proof

The committed tools make the sweep repeatable:

- [506-move-constructors-first.ts](506-move-constructors-first.ts) reports `would change 0 file(s)`.
- [506-constructor-order-census.ts](506-constructor-order-census.ts) reports 126 constructors,
  0 instance members before constructors, and 0 static members after constructors.
- [506-terminal-static-readonly-census.ts](506-terminal-static-readonly-census.ts) reports 24
  uppercase hot-path fields and 24 hot-path comments.
- [506-plain-scalar-field-census.ts](506-plain-scalar-field-census.ts) records the scalar-field
  evidence below.

## Plain scalar field triage

The [task](task-506-constructor-first-and-the-constants-role-table.md) promised a 13-field list but
did not include it. A fresh AST census found 18 current fields with no direct assignment. Every
field changes through `++` or `--`, which the direct-assignment census missed. All 18 remain mutable.
None can become readonly, and none is dead.

| Field | Verdict | Mutation evidence |
| --- | --- | --- |
| `nextRequestId` | mutated-missed | [prefix increment at line 191](../../../../src/modules/agent/CodexAppServerBackend.ts#L191) |
| `nextDocumentIdentifier` | mutated-missed | [prefix increment at line 54](../../../../src/modules/search/FindBar.ts#L54) |
| `nextLayerSequence` | mutated-missed | [prefix increment at line 92](../../../../src/modules/keybindings/KeybindingRegistry.ts#L92) |
| `snapshotGeneration` | mutated-missed | [prefix increment at line 54](../../../../src/modules/workspace/GutterDecorations.ts#L54) |
| `completedFrameCount` | mutated-missed | [postfix increment at line 38](../../../../src/modules/text/EditorFrameAttribution.ts#L38) |
| `latestEnumerationRequestIdentifier` | mutated-missed | [increments at lines 93, 183, and 274](../../../../src/modules/search/QuickOpen.ts#L93) |
| `nextImageId` | mutated-missed | [postfix increment at line 89](../../../../src/modules/image/PixelImageMount.ts#L89) |
| `emitGeneration` | mutated-missed | [increments at lines 109 and 128](../../../../src/modules/image/PixelImageMount.ts#L109) |
| `nextTicket` | mutated-missed | [prefix increment at line 80](../../../../src/modules/git/CommitExpansion.ts#L80) |
| `diffOpenRequestGeneration` | mutated-missed | [increments at lines 586, 655, and 709](../../../../src/modules/git/GitWorkspace.ts#L586) |
| `lifecycleGeneration` | mutated-missed | [increments at lines 59 and 82](../../../../src/modules/markdown/MarkdownDocument.ts#L59) |
| `requestSequence` | mutated-missed | [increments at lines 83 and 123](../../../../src/modules/markdown/MarkdownDocument.ts#L83) |
| `generation` | mutated-missed | [increments at lines 50 and 86](../../../../src/modules/lsp/LspProcess.ts#L50) |
| `requestId` | mutated-missed | [prefix increment at line 38](../../../../src/modules/lsp/JsonRpc.ts#L38) |
| `activationGeneration` | mutated-missed | [increments at lines 499 and 559](../../../../src/modules/lsp/LanguageClient.ts#L499) |
| `requestGeneration` | mutated-missed | [increments at lines 192 and 587](../../../../src/modules/structure/StructureOutline.ts#L192) |
| `refreshGeneration` | mutated-missed | [increments at lines 135 and 352](../../../../src/modules/database/DatabaseConsumerWorkspace.ts#L135) |
| `browseGeneration` | mutated-missed | [increments at lines 136, 240, 299, and 353](../../../../src/modules/database/DatabaseConsumerWorkspace.ts#L136) |

## Drive evidence

I compared commit `683c5ca9` with this branch through the real PTY. Both runs opened the terminal
panel, typed `seq 1 100`, focused the terminal, and sent four upward wheel ticks. The settled wait
required `scrollTop=74` before `verticalMomentum.velocity=0`.

Default and 100,000-line fixtures produced the same terminal cells on both commits. Rows 36 through
58 showed terminal lines 71 through 93. Both runs reported `scrollTop=74`, `scrollContentRows=105`,
`scrollViewportRows=23`, `panelVisible=true`, and `panelActiveContentKind="terminal"`.

## Verification

- Three constructor module batches passed `bunx tsc --noEmit` and all 2386 tests.
- The final static-order batch passed TypeScript and all 2387 tests.
- Final `bunx tsc --noEmit`: exit 0.
- Final `bun test`: 2387 passed, 0 failed, 72,225 assertions.
- Final invariant checker: 1381 annotations and 266 lattice links resolved, 0 problems.
- Final `scripts/conventions-gate.sh`: PASS.
- Final grammar fixture file: 27 passed, 0 failed.
- Final `scripts/behavioral-contracts.sh`: exit 1 from one pre-existing Structure Navigator
  uninstall timeout. All other contracts completed. The exact targeted smoke also fails at base
  commit `683c5ca9`; see Bycatch.

I did not run `scripts/merge-gate.sh`.

## Commits

- `735d92227e0c108857486a9c0a1c2b17b1ef51ec` — grammar-only member-order sweep across 95 files.
  Its full hash is in `.git-blame-ignore-revs`.
- `60a9a8cf15db7ee2a842e724dc0c8e7ee8783c01` — grammar enforcement, docs, hot-path comments,
  and task censuses.

The task changes are committed. The dispatcher-created untracked fundamentals file remains
untouched.

## Bycatch

- PRE-EXISTING: `bun scripts/harness/smoke-plugin-manifest-harness.ts` times out while waiting for
  “uninstall removes the structure pane and withdraws its projection.” It failed in the full final
  pass, failed again as a targeted run, and failed at base commit `683c5ca9` with the same condition.
- TASK DRIFT: the task says 85 of 113 constructors violate, but the dispatched tree contained 126
  constructors and 89 instance-order violations. The promised 13-field list is also absent. The
  current reproducible census contains 18 fields.

## Instrument feedback

- EASY: visible text, graph paths, and the shared 100,000-line fixture made the terminal comparison
  direct and repeatable.
- CONFUSING: `scroll(...).waitFor(verticalMomentum.velocity, 0)` can pre-satisfy before queued wheel
  input changes velocity. Waiting for the changed `scrollTop` first made the settle proof honest.
- MISSING: the task file says it carries the 13-field list, but the list is not present. The checked-in
  AST census reconstructs the current population.
