# READY — ivue 2.2.1 static-cache migration

Branch: `refactor-ivue-statics-221`

Commit: `f124d44d110feb0d2eb2f90c71ffb4c4b356c805`

Worktree: clean

## Outcome

- Pinned `ivue` to `^2.2.1` and refreshed `bun.lock`.
- Moved `Static()` to the immutable `$Class` anchor for every production
  class declaring static members.
- Removed all 55 hand-rolled `Object.defineProperty(this, ...)`
  self-replacement blocks from 37 files.
- Deleted and unwrapped the `cache()` / `cachedSet()` helpers in
  `ThemePalettes`, `ThemeIcons`, `CompletionItemKinds`, and `Settings`.
- Kept every downstream specialization on `extends X.$Class`.
- Added a runtime contract for all current `$` static caches and a source
  ratchet forbidding `extends X.Class`.
- Updated the namespace grammar checker and active project documentation for
  the 2.2.1 anchor contract.

This is optional mechanism cleanup, not a fix for a live recomputation defect:
all 36 cache owners already self-replaced their getters before this change.

## Census

The requested starting census agreed with the task's cache-site table:

| Population | Before | After |
| --- | ---: | ---: |
| Classes declaring `$` static getters | 36 | 36 |
| `$` static getter properties | 67 | 67 |
| `Class = Static(...)` cache owners | 22 | 0 |
| `Class = Reactive(...)` cache owners | 9 | 9, now `Reactive($Class)` |
| Bare cache owners | 5 | 5, now `Class = $Class` |
| `Object.defineProperty(this, ...)` blocks/files | 55 / 37 | 0 / 0 |
| `extends X.Class` | 0 | 0 |
| `extends X.$Class` textual occurrences | 63 | 63 |

The 63 anchor-extends occurrences are 61 executable AST sites plus two
executable child-source fixture strings in `OpenPty.test.ts`.

The authoritative anchor brief is broader than the 36 cache-owner table. An
AST census found 142 production classes declaring static members, and all
142 now publish `$Class = Static($X)`; raw statics-bearing anchors are zero.

## Runtime contract

`src/modules/system/StaticCacheContract.test.ts` explicitly covers all 36
classes and inspects every one of their 67 own `$` descriptors. It:

- fails if the class list is empty;
- fails a class with zero inspected cache properties;
- requires a get-only accessor, so a setter or static field cannot hide;
- fails primitive values, whose identity comparison would be vacuous;
- reads each published property twice and requires `Object.is` identity.

For the 12 multi-getter classes, the sibling assertions are redundant today.
They are deliberate insurance against the specific one-property regressions
caused by adding a setter or changing one accessor to a field.

Positive controls, both exit 1:

```text
RawPositiveControl.$value did not preserve identity across two reads
ReactivePositiveControl.$value did not preserve identity across two reads
```

`AppLoader.test.ts` remained unchanged: `$Failing` and `$NoExit` still extend
`AppLoader.$Class` and install bare. With `AppLoader.$Class` now anchored,
their passing assertions exercise ivue 2.2.1's per-receiver method binding.

## Source ratchets and positive controls

The conventions gate rejects the mutable selection slot in an extends clause.
The planted violation exited 1 with:

```text
CONVENTIONS FAIL: extends uses a mutable Class slot — extend the immutable $Class anchor:
src/modules/app/AppLoader.test.ts:72:  class MutableAnchorPositiveControl extends AppLoader.Class {}
```

The existing static-getter naming checker was also planted as requested. It
exited 1 with:

```text
src/modules/system/Momentum.ts:18:24 literal-valued static getter 'namingPositiveControl' must use SCREAMING_SNAKE_CASE
static-getter-naming: FAIL (1 violation(s))
```

All plants were removed before the final pass.

## Measured behavior

- `EditorWrap`: fold-projection rebuilds collapsed from 40,001 to 1.
- `DiffView`: indexed change-block reads collapsed from 2,110 to exactly
  1,055; the second projection added zero reads.
- Default PTY boot: ready.
- Settings drive: `settingsOpen=true`, 38 fields published, and 23 field
  labels visible at 120x40, including Glyph mode, Graphics tier, Theme,
  Word wrap, TypeScript server, and Agent engine.
- Large-scale PTY drive: the generated 100,000-line fixture booted settled and
  ready; the latest frame reported 65 document-line reads, 33 fold-projection
  lookups, two wrap-projection lookups, and one layout computation.

## Construction-cost assessment

The nine constructed cache-owner classes named by the task still each have
one direct production construction site: `Settings`, `SettingsPanel`,
`LanguageClient`, `HoverCard`, `ShortcutHelp`, `AgentSpinner`,
`MarkdownPreview`, `MarkdownDocument`, and `DiffView`.

Because the authoritative anchor rule applies to all static declarations, I
also measured the broader tree: 45 of the 142 statics-bearing classes are
directly constructed at 59 production sites. Zero construction expressions
are syntactically inside a loop. The sites are bootstrap, factory,
singleton/workspace, pane, document, terminal, or surface-lifetime
construction; none is per-frame or per-line. The measured 6.0 ns to 12.3 ns
wrapper delta therefore remains off the scaling paths.

## Tracked-document conflicts

The task brief won wherever tracked text disagreed:

- `project.ivue-statics-migration.md` claimed its 2.2.0 frozen-cache contract
  was authoritative and described the old raw anchor. It now records the
  2.2.1 no-freeze contract, anchor rule, and known two-receiver/two-cache
  shape.
- `project.conventions.md` claimed cached values were shallow-frozen. It now
  promises stable identity without freezing.
- `AGENTS.md`, `project.requirements.md`, the lower ivue section of
  `project.handoff.md`, `project.brief.md`, and
  `src/modules/system/system.invariants.md` encoded `Class = Static($X)` or a
  vendored `Static`. They now describe `Static()` from `ivue/extras` on the
  immutable `$Class` anchor.
- `project.ivue-reference.md`, `project.architecture.md`, and
  `project.invariants.md` were updated to the same active contract.
- Tracked `TASK.md` is an older historical brief and still says extending
  `X.Class` is safe/recommended. `/tmp/TASK-ivue-221-migration.md` explicitly
  supersedes it; I did not follow that stale instruction.

## Final verification against the committed tree

| Check | Exit | Result |
| --- | ---: | --- |
| `bunx tsc --noEmit` | 0 | clean |
| `bun test` | 0 | 1,668 pass, 0 fail, 67,508 expectations |
| `bash scripts/conventions-gate.sh` | 0 | PASS |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` | 0 | 883 annotations, 67 links, 0 problems |
| `bun scripts/check-coverage-ratchet.ts` | 0 | 310 files, no undeclared decrease |
| `bun scripts/check-static-getter-naming.ts` | 0 | 578 files inspected |
| Settings PTY drive | 0 | booted, opened, fields visible |
| `bun run drive --size 100000` | 0 | settled 100,000-line fixture |

The full merge gate and `behavioral-contracts.sh` were not run, as directed.
Nothing was pushed, merged, tagged, or deleted.

## Invariant assessment

The change strengthens **Public classes use the namespace pattern**: the
inheritance anchor is now immutable and owns the static transformation, while
the mutable `Class` slot remains only the selected construction seam. It also
upholds the scale/cost invariants: no newly wrapped construction is in a loop,
and both default and 100,000-line real-app paths were driven successfully.

## Bycatch

None.
