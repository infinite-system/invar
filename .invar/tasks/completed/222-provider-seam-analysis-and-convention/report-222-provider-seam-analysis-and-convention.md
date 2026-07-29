# READY — #222 (provider-seam analysis and convention)

Branch `fleet/222-provider-seam-analysis-and-convention`, one commit:

- `9a36e32c` — tasks: #222 (provider-seam analysis) — classification, convention 12, gate rule,
  DataStore sketch

Analysis only, as the brief required. **No production file is committed.** The worktree is clean.
Nothing pushed, merged, tagged, or deleted.

The four documents live in the task folder ON THE BRANCH, at
`.invar/tasks/active/222-provider-seam-analysis-and-convention/`. That path is `active/` and not
`in-progress/` because the branch was cut before the conductor moved the folder on main. This
report is the only file written outside the worktree.

## The deliverables

| file | what it settles |
| --- | --- |
| [analysis-222-classification.md](analysis-222-classification.md) | the criterion, the 11 namespaces, the getter census, the site census |
| [analysis-222-convention.md](analysis-222-convention.md) | convention 12 text, gate rule 1.58 with five positive controls, the cost table |
| [analysis-222-datastore-interface.md](analysis-222-datastore-interface.md) | the `DataStore` seam, five invariant records, four honesty risks |
| [analysis-222-minimal-conversion-set.md](analysis-222-minimal-conversion-set.md) | three existing files, not 51 |
| `proposed-222-check-effect-seams.ts` | the checker, written and run, NOT merged |
| `proposed-222-effect-seam-baseline.txt` | its 71-row shrinking baseline, NOT merged |
| `census-222.ts`, `census-222-classes.ts` | the one-off censuses, so every number is reproducible |

## The criterion, stated once

A capability namespace is EFFECTFUL when its own module imports a `node:*` builtin, or reads or
constructs one of `process`, `Bun`, `Date`, `performance`, `globalThis`, or imports a sibling that
already is. Everything else is PURE. The criterion is syntactic on purpose. A parser can answer
it, so the same question runs in the gate. A criterion that needs judgement drifts.

Result: **9 effectful, 2 pure, out of 11.** `TextSegmentation` and `UndoStore` are pure. The
folder does not decide.

## Reproducing the census

Run from the repository root. Copy `census-222.ts` and `census-222-classes.ts` there first, since
they need `typescript` to resolve.

```sh
bun scripts/ast-query.ts identifiers Files                       # external users per namespace
bun census-222.ts classify src/modules/system src/modules/storage  # the classification
bun census-222.ts getters                                        # who already wraps what
bun census-222.ts uses Files                                     # direct versus getter-wrapped
bun census-222.ts sites Files                                    # instance / static / module level
bun census-222-classes.ts Files Processes Clock                  # getters owed
bun scripts/check-effect-seams.ts                                # the proposed gate rule
```

Headline numbers:

- **42** seam getters in production, not the ~65 the task file estimated. 42 is the exact count
  under the exact criterion `return X.Class`. The gap is a text count against a parse.
- **254** bare sites across **51** files and **71** file/namespace pairs.
- **Zero** bare sites at module level, for every namespace. Every one already sits inside a class
  member, so every one can read a getter on `this` with no restructuring.
- The task file's shallow figures are confirmed: Files 22 files, Logging 11, Clipboard 8,
  Environment 4, Clock 2. Processes reads 7 here because
  `src/modules/system/Clipboard.ts` sits inside the capability layer. Six consumers are outside
  it, matching the task file's 6.

## Two corrections to the brief, both measured

**1. Momentum is not pure.** `src/modules/system/Momentum.ts:69` and `:121` read
`performance.now()` as a DEFAULT PARAMETER, and all 14 production calls to `queueImpulse` pass
two arguments, so the ambient read fires at every one of them
(`bun scripts/ast-query.ts named-calls queueImpulse`). The physics are pure. The edge is not.

The repair is NOT a getter. It is to pass the frame timestamp the callers already hold, which
makes Momentum fully pure and removes a second clock from the app. `UndoStore` already has that
shape at `src/modules/storage/UndoStore.ts:45`. Filed as bycatch, not folded into #223.

**2. Processes is not in the minimal set.** The task file guessed "likely Files + Processes +
Clock". `bun:sqlite` runs in process and `Bun.sql` opens a socket, so neither database provider
spawns a tool. The guess was reasonable and the evidence does not support it.

## The convention, in one line each

- EFFECTFUL capability: reach it through `protected get Files() { return Files.Class; }` and read
  `this.Files`.
- PURE generator: call `TextSegmentation.Class.graphemes(text)` directly. A getter around a pure
  function buys nothing and costs a lookup.
- The mutable `Class` slot stays the GLOBAL default. The getter selects per region, the slot
  selects for the process. Both, not either. Two live database connections on two engines is the
  case that needs both.
- INTERFACE HONESTY: if a provider must suppress the seam's core to fit, the interface is wrong.
  Split the seam. Do not add a capability flag, which turns every consumer into a branch.

The convention adds no new mechanism. It names one that four modules invented separately under
test pressure. `src/modules/lsp/LanguageClient.ts:104` to `:121` already holds the complete
pattern: five seam getters in a row, four of them effectful.

The pattern is exercised, not decorative. 19 test classes override a getter.
`src/modules/image/ImagePreview.test.ts:20` substitutes a filesystem,
`src/modules/lsp/LspProcess.test.ts:6` substitutes a process launcher. The tree has **zero**
`mock.module` and `spyOn` calls, and the `Class` slot is assigned in exactly two test files,
neither of them a capability.

## The gate rule, and its five positive controls

Rule 1.58 in `scripts/conventions-gate.sh`, backed by `scripts/check-effect-seams.ts`. Both are
written, run, and quoted in [analysis-222-convention.md](analysis-222-convention.md). Neither is committed to production.

Two properties it obeys deliberately:

- **It discovers its population.** The effectful set is computed by parsing the capability roots
  and applying the criterion. There is no list of effectful namespaces in the script, so a
  capability added tomorrow is governed on the day it is added.
- **It is a shrinking baseline, not a zero.** 254 sites exist. `--require-zero` would fail on day
  one and be switched off. The baseline uses the mechanism
  `scripts/plugin-boundary-baseline.txt` already uses: a pair with NO row fails on its first bare
  site, so new coupling blocks today while known sites convert by attrition.

Controls, each planted, run, quoted, and removed. Green was confirmed before each plant and after
each removal.

| control | plant | result |
| --- | --- | --- |
| 1. new coupling | `Files.Class.exists('/tmp')` in `src/modules/ui/HoverCard.ts`, which has no `Files` row | `CONVENTIONS FAIL: effect seam — Files is EFFECTFUL … with no baseline row`, exit 1 |
| 2. a pair grows | a second bare `Clipboard` site in the same file | `rose to 2 bare site(s), above its baseline of 1`, exit 1 |
| 3. discovery under-finds | `capabilityRoots` cut to `['src/modules/storage']` | `found no effectful capability among 1 files — the criterion cannot be right`, exit 1 |
| 4. must NOT fire on pure | bare `TextSegmentation.Class.graphemes` added | exit 0, count unchanged |
| 5. conversion is rewarded | the bare `Clipboard` site converted to a getter | `is tightenable — 0 bare site(s), baseline 1`, total fell 254 → 253, exit 0 |

Control 3 is the one that matters most. It guards against the failure this rule is designed to
avoid: a discovery that silently finds nothing and reports green. Control 4 proves the rule is
about effects and not about everything.

## The `DataStore` seam for #223

Derived from two consumers, with no engine feature list read while writing it.

The schema tree asks four questions, and `src/modules/filetree/FileTree.ts` already answers the
same four for files: roots, children on expand, what to paint, and may-this-have-children. It
never asks for the whole schema. A database with 4,000 tables must cost what one with 4 costs.

The query pane's load-bearing question is the third one: give me the rows for the range I am
painting. **The seam is a cursor, not an array.** That single decision makes the design either
honest or useless at scale.

Provider selection sits **at the getter, inside a factory, exactly like
`src/modules/narration/TtsFactory.ts`** — two provider getters at `:15` and `:19`, one
`createBackend` at `:26` that chooses. `DataStoreFactory` is that object with a descriptor instead
of an environment variable. The `Class` slot holds the factory and answers "what does this process
do by default". #223 step 2 must prove the two-engine swap WITHOUT touching the slot. If it
cannot, the seam is in the wrong place.

Five records named for `src/modules/datastore/datastore.invariants.md`: a result set outgrows the
pane and may outgrow memory; schema shape is discovered lazily; a statement is a failable external
call that can outlive its pane; a column's type belongs to its engine; a connection is released
with the plugin that opened it.

### Where interface honesty will break first

Ranked, because the brief asked for it.

1. **The column type.** sqlite has dynamic per-value typing and five storage classes. pg has
   hundreds of static types plus arrays and composites. Any shared `DataType` enum forces sqlite
   to invent types it does not have, or flattens `jsonb` and `timestamptz` into `text`. Both are
   suppression. The sketch keeps the engine's own type name as free display text and reduces the
   shared fact to one boolean. Watch for the pull to "just normalise it a bit".
2. **The hierarchy depth.** pg nests database, schema, table, column. sqlite nests file, table,
   column. A fixed three-level tree makes sqlite publish a fake schema node. The sketch answers
   with recursive `children(node)`. If #223 starts adding `schemas()`, `tables(schema)`,
   `columns(table)`, stop.
3. **Cancellation.** The pane needs it at scale, so it is core, not peripheral. Verify both
   engines can cancel in step 1, before the interface promises it. An empty `cancel()` is the tell
   firing on the seam's own core.
4. **Multi-statement text.** Decide at step 1 whether `execute` takes one statement or a batch. A
   provider that produces several results against a one-result seam must drop or merge them.

Transactions are listed as a fifth, weaker one. Neither pane asks for them. Adding them because an
engine offers them is the mistake this whole method exists to avoid.

## The minimal conversion set

The fact that shrinks the problem: **new code pays one getter, not the migration.** The 254 sites
belong entirely to existing files. #223 is greenfield.

- **Tier 0.** Every new `src/modules/datastore/` file that reaches `Files` or `Clock` declares its
  own getter. About four accessors. Not a conversion.
- **Tier 1. Convert `Clock` completely: 2 files, 2 getters, 2 sites.**
  `src/modules/editor/Editor.ts:507` and `src/modules/git/GitRepository.ts:132`. It is the only
  namespace that can reach ZERO in one sitting, which is the shrinking baseline's first real
  tooth. It DELETES production code: `Clock.freeze` at `src/modules/system/Clock.ts:14` is a test
  hook whose only caller is `src/modules/system/Clock.test.ts:6` and `:9`. A capability with its
  own private test hook is a capability with no seam. And #223 uses the same capability, so the
  trial exercises what it converted.
- **Tier 2. Convert `Files` only in the files #223 touches.** If it wires "open a .db from the
  file tree", that is `src/modules/filetree/FileTree.ts`: 3 sites, 1 getter. Convert nothing else.
- **Tier 3.** `Environment`, only if the pg provider reads a variable. Prefer a registered
  setting, as `src/modules/lsp/LspPlugin.ts:29` does, and this tier disappears.

**Three existing files. Three getters. Five sites.** The other 48 files convert by attrition,
held by a gate rule that blocks every new bare site today. Every deferral carries its reason in
[analysis-222-minimal-conversion-set.md](analysis-222-minimal-conversion-set.md).

One clarification recorded there: a PROVIDER is allowed to touch its engine. The sqlite provider
imports `bun:sqlite` and the pg provider reads `Bun.sql`. The convention governs consumers
reaching PAST a seam, not the implementation behind one. The gate scopes itself to the capability
roots for that reason, and the same logic already exempts
`src/modules/terminal/OpenPtyBackend.ts` from *External tools share one launch policy*.

## Verification

No production file changed, so the gate state is unchanged from the branch point. One pass was
run anyway.

```text
bunx tsc --noEmit                      exit 0
bash scripts/conventions-gate.sh       exit 0   conventions-gate: PASS
bunx prettier --check .                exit 0   All matched files use Prettier code style
bun scripts/check-effect-seams.ts      exit 0   (proposed rule, against its own baseline)
```

The committed `.ts` artifacts were re-copied into place and re-run after the pre-commit prettier
pass, to confirm formatting did not break them. `bun test` and the smokes were not run: nothing
they cover was touched.

STE lint scores on the four documents: 1.52, 1.92, 2.60, 3.65 violations per 100 words. The two
above 2.0 are dominated by invariant-record prose, which the skill exempts, and by tables that the
linter reads as long paragraphs.

## Bycatch

- **`Momentum` reads an ambient clock through a default parameter, at every production call
  site.** `src/modules/system/Momentum.ts:69` and `:121` default
  `currentTimestampMilliseconds` to `performance.now()`. All 14 production callers of
  `queueImpulse` pass two arguments
  (`bun scripts/ast-query.ts named-calls queueImpulse`), so the default fires every time. Two
  consequences. First, the app holds two clocks: `Clock` is wall-clock `Date.now`, Momentum is
  monotonic `performance.now`, so a single `Clock` seam offering only `now()` would force Momentum
  to suppress monotonicity — the interface-honesty tell, on the smallest possible seam. Second,
  scroll physics are not reproducible from their arguments. NOT fixed. The repair is to make the
  parameter required and pass the frame timestamp the callers already hold. Reproduced by reading
  all 14 call sites, not by driving.
- **`Clock.freeze` is a production test hook with exactly one caller.**
  `src/modules/system/Clock.ts:14`, called only from `src/modules/system/Clock.test.ts:6` and
  `:9`. It exists because nothing could substitute `Clock`. Tier 1 above deletes it. Recorded
  separately because it is a live defect even if #223 never happens.
- **[src/modules/system/system.invariants.md](../../../../src/modules/system/system.invariants.md) enumerates its own population, and the list has
  rotted.** Line 3 says the layer is "(`Files`, `Clock`, `Environment`, `Logging`, `Processes`,
  `StatusChannel`)". The layer holds ten namespaces. `Clipboard`, `FrameProbe`, `Momentum`, and
  `TextSegmentation` are missing, and the record *Capability classes are stateless and Static
  wrapped* repeats the same six in its Evidence. This is the enumeration-instead-of-discovery
  failure that [project.conventions.md](../../../../project.conventions.md) names, one level up in the contract layer. NOT fixed —
  contract edits need their own task.
- **The same line cites "the vendored `Static.ts`", which no longer exists.**
  `src/modules/system/` holds no `Static.ts`, and [project.conventions.md](../../../../project.conventions.md) requires
  `import { Static } from 'ivue/extras'` and says never vendored. A stale clause in a record
  header. NOT fixed, same reason.
- **The task file's "~65 getter-wrapped" figure is 42 under a parse.** Not a defect, but the
  number is quoted in the task outline and would mislead a later reader. Recorded so it is not
  re-derived.
- No app was driven for this task, so there is no visual bycatch. Nothing in the brief required
  driving: the deliverables are documents and a source-text checker, and the checker's subject is
  source text.

## What this task says

#122 found that a rule living only in a folder name is already lost. #218 found that a rule
living only in a comment beside a cast is lost the moment the cast is convenient. This one is the
third of the same shape: **a rule that lives only in a habit is real, load-bearing, and invisible
to the measurement.**

42 seam getters exist. They cluster at effect boundaries. No convention asked for them, no gate
checks them, and no record names them. Agents invented the same shape in `lsp`, `git`, `image`,
and `narration` independently, each time under test pressure, and each time the reason was the
same: a test could not substitute a real disk, a real process, or a real voice.

The convention text in this task does not introduce a pattern. It writes down one the tree has
been voting for, and the gate rule makes the vote countable.
