# Task #73 — dropped reactive signals: audit, census, and the one honest tell

Worktree `/tmp/conductor-reactive`, branch `fix-reactive-signal-audit`, based on `72dca35`.
No `src/modules/**` code was changed: the audit found no defect there to fix. What landed is an
instrument (`scripts/check-reactive-observation.ts`), its positive control, its own tests, and a
report-only gate step.

## 0. The rule this audit enforces (quoted, before any analysis)

`project.ivue-reference.md` §2:

> **Plain getter** = the DEFAULT for cheap derived/conditional state. Lives once on the prototype
> (0 bytes/instance) and is **fully reactive because the reading effect subscribes to the leaf refs
> underneath, at any depth.**

…and §7 (late dependency binding):

> Move every cross-module read into a getter/method body … **NEVER top-level `new B.Class()`,
> `const C = B.Class`** …

`project.conventions.md`:

> Reactive state = ref-returning getters; cheap derived state = PLAIN getters … Cross-module deps
> are read **LATE** (getters/method bodies) — **never top-level `new`/snapshot.**

The load-bearing half is the clause "the **reading effect** subscribes to the leaf refs underneath".
Reactivity is a property of **where the read happens**, not of the value. Move the read earlier —
into a constructor, a module binding, a snapshot object that is then reused — and the value is
correct exactly once. Nothing about the code looks different afterwards, which is why this class
needs an instrument rather than a convention.

## 1. The specimen, mechanically (task step 2)

The three fields the probe checks do **not** reach it by three paths. `viewportRows`, `totalRows`
and `scrollTop` are all `scroll.viewportSize` / `scroll.scrollSize` / `scroll.scrollPosition` of the
**same** `applyBarGeometry` call, printed by the **same** `Logging.Class.info` line under
`TUI_DEBUG_BARS=1` (`src/modules/ui/ScrollbarSync.ts:273-276`, fed live per frame from
`syncScrollbars()` at `:386-397`, where `scrollPosition: editor.viewport.scrollTop.value` is a real
`Ref` read inside the coarse frame effect). The probe parses that one line
(`scripts/harness/smoke-scrollbars-harness.ts:652-680`) and takes **`matchingLines.at(-1)`** of
`artifacts/tui.log`.

So on this code path *one field cannot freeze while its siblings stay live* — there is one supplier
and one record. What can happen, and did, is that the **whole record froze and only one assertion
could see it**: `viewportRows` and `totalRows` are asserted **constant** (`distinctX.length === 1`),
and a frozen read satisfies a constancy assertion vacuously, while `scrollTop` is the only field
asserted to **move** (`> 10`). The corroboration was never corroboration.

The freeze itself is git-verifiable, and it is a supplier deletion, not a lost subscription:

| revision | `TUI_DEBUG_BARS` emission in `src/` |
| --- | --- |
| `67f5cb7` "Invert Git into the plugin canvas" (#34) | `DiffView.ts` only — **`ScrollbarSync.ts` gone** |
| `af51321` "Restore live plugin canvas observations" (the other builder, tonight) | `DiffView.ts` + `ScrollbarSync.ts` |
| `72dca35` (my base, main) | `DiffView.ts` + `ScrollbarSync.ts` |

`artifacts/tui.log` is **append-only and gitignored**, so a developer checkout always carries
history. With the supplier deleted, every one of the 172 frames re-read the same leftover line from
an earlier run. Demonstration (no app, no defect — only an absent supplier and a captured record):

```
$ bun demonstrate-stale-bar-observation.ts
frames observed: 172; every frame parsed a record: true
PASS  wrap-off viewportRows stays exact and constant (20)
PASS  wrap-off totalRows stays exact and constant (502)
FAIL  wrap-off scrollTop moves through 1 observed positions
```

That is the reported quartet byte-for-byte, including `20` and `502`.

**The search pattern this yields** (two clauses, and the second is the one that generalises):

1. *App side:* one field can only freeze beside live siblings when the fields have **different
   suppliers** — a `Ref` read (live) next to a plain field or a captured value (frozen). The frame
   effect keeps re-running because of the live siblings, which is what makes the frozen field look
   observed: the observation pass really does re-execute, it just re-reads something that can no
   longer change.
2. *Instrument side:* an observation channel that **yields a value even when the producer wrote
   nothing this run** cannot distinguish "frozen field" from "no data at all"; and constancy
   assertions over that channel provide false corroboration.

## 2. Census (task step 3)

Type-aware (`typescript` program + checker, exactly the shape of `check-exported-capabilities.mjs`),
over `src/**/*.ts` minus tests:

| inspected | count |
| --- | --- |
| source files | 191 |
| live `Ref`/`ShallowRef`/`ComputedRef` `.value` reads (type-resolved, writes excluded) | 1309 |
| `shallowRef` payload reads | 243 |
| `Reactive()` classes | 54 |
| getter-published mutable plain fields on `Reactive()` classes (standing hazard inventory) | 14 |
| object literals scanned for mixed live/captured members (exploratory pass) | 1756 |
| locals seeded by a reactive read and read inside a closure (exploratory pass) | 43 |

**Candidates found, by shape:**

| shape | hits | verdict |
| --- | --- | --- |
| in-place mutation of a `Ref`/`shallowRef` payload | **0** (cross-checked by grep: no `.value.push(`/`splice(`/`set(`/… anywhere in `src/modules`) | clean |
| `Ref` read captured into a `this` field at construction and read later | **0** | clean |
| `Ref` read at module scope | **0** | clean |
| field holding a live-selected owner (`this.x = workspaceSet.active…`) — the "two owners" shape | **0** | clean |
| getter publishing a mutable plain field on a `Reactive()` class | 14 | hazard inventory, all compensated — see below |
| object literal mixing live thunks with direct `.value` reads | 10 | all benign (per-call literals / seeds beside live thunks) |
| primitive local seeded by a reactive read, read in a closure | 43 | all benign (per-call locals, last-applied mount mirrors) |

**Verified defects in `src/modules`: none.** I could not make any repository site report a stale
value, so nothing goes in the "verified" list and nothing was fixed there (task step 5's honest
outcome, not a skipped step).

### The 14-site hazard inventory, and why each is not a defect

Each is a getter over a mutable plain field — a read that subscribes to nothing — and each is
published through an explicit version signal at its write sites. Checked individually, *reached per
frame* noted, because a captured value read once is not a defect:

| site | reached per frame? | compensation |
| --- | --- | --- |
| `ui/ScrollableTextViewport.ts:99,102,109` (`scrollTop`, `scrollLeft`, `stuckToBottom`) | yes (status projection + pane windows) | `setScrollTop`/`setScrollLeft` call the **required** `deps.onScroll()` (`:224,:236`; the dep is non-optional at `:408`), and every host wires it to a paint bump — `RootView.ts:515`, `HoverCard.ts:199`, `BoundedListPopup.ts:163`. The seam makes the bump structural instead of a thing to remember. |
| `editor/TextDocument.ts:77,91,99` (`maximumLineWidth`, `lines`, `eol`) | yes (`ScrollbarSync` horizontal extent, renderers) | every mutator bumps `revision` (`:47,:58,:70,:108,:115,:123,:134`), which the frame effect observes explicitly (`Bootstrap.ts:765`). |
| `agent/AgentSession.ts:80` (`activeEngine`) | yes (pane title/greeting) | `swapBackend` bumps `renderRevision` (`:185`). |
| `terminal/TerminalPaneContent.ts:220` → `TerminalInstance.ts:211` (`scrollTop`) | yes (`terminalScrollTop` in the status snapshot) | `scrollToLine` bumps `renderRevision` (`TerminalInstance.ts:236`). |
| `ui/BoundedListPopup.ts:112,116`, `ui/CompletionPopup.ts:54` | yes | `paintRevision` bump + per-frame relayout. |
| `ui/EditorContentMount.ts:29,33` (`diffView`, `markdownSplitView`) | yes | reconciled inside the per-frame `sync()`; swaps ride `showingDiff` / `markdownPreviewPaths` refs. |
| `app/App.ts:86` (`isStarted`) | no | written once at boot. |
| `ui/ScrollbarSync.ts:190` (`applyingGeometry`) | no | read only inside bar `onChange` handlers, never by an observer. |

The one weak edge I found and deliberately did not touch: `ScrollableTextViewport.reset()` (`:253`)
and the `followBottomActive` branch of `reconcileExtent()` (`:266`) write without `onScroll()`.
Both are immediately followed by a content load or a resize that repaints, so I could not make
either report a stale value — it goes in "unverified suspicion", not in the census of defects.

### Unverified suspicions (not padded into the census)

1. `ScrollableTextViewport.reset()` / `reconcileExtent()`'s tail-anchor branch skip `deps.onScroll()`
   (above). Would show as a one-frame-stale `stuckToBottom` / published scroll offset after a resize.
2. `scripts/harness/smoke-scrollbars-harness.ts:652` has **no provenance guard**: it accepts any
   `bar <id>:` line in an append-only, never-truncated log. This is the *actual* mechanism of the
   reported failure and, by the recorded lesson *An instrument must fail loudly*, the highest-value
   follow-up: truncate `artifacts/tui.log` at driver start, or require the parsed line to be newer
   than the run's start stamp, so "no record this run" fails as itself instead of impersonating a
   frozen field. **I did not fix it** — it is harness code, outside the `src/modules` fix scope I was
   given, and `smoke-scrollbars-harness.ts` sits next to the plugin-canvas builder's work.
3. The conductor's "second instance" (popup anchor returning a stale rectangle) is, on the evidence
   in `af51321`, **not** a captured-value defect: the diff passes `context.screenColumn/screenRow`
   where pane-local `column/row` had been passed (`git/GitPaneContent.ts` `openLogBranchMenu`). That
   is a coordinate-space defect. I mention it because treating it as the same class would have sent
   this audit hunting the wrong shape.

## 3. Does an honest mechanical tell exist? (task step 6)

Partly — and the honest answer for the biggest category is **no**.

**Rejected as dishonest tells** (measured, then discarded):

- *A getter publishing a mutable plain field on a `Reactive()` class.* 14 hits, **0** defects. The
  compensation is a version-signal bump that sometimes lives one call level above the assignment
  (`TextDocument.recomputeMaximumLineWidth` is bumped by its callers), so syntax cannot separate a
  bumped write from an unbumped one without a call graph. Flagging this is the confident false
  positive the recorded lesson warns about; it is now a **census number** instead.
- *An object literal mixing live thunks with direct `.value` reads.* 10 hits, 0 defects: the
  distinction is the literal's **lifetime** (rebuilt per call vs. built once at boot), which is not
  syntactically decidable.
- *A primitive local seeded by a reactive read and used inside a closure.* 43 hits, 0 defects.

**Shipped:** `scripts/check-reactive-observation.ts` — type-aware, report-only for repository code,
three categories that admit **no legitimate exception**:

1. `construction-captured-reactive-read` — a type-resolved `Ref` read in a constructor or property
   initializer, stored **directly** into a `this` field, and read from a method later. Delegation is
   excluded: a read handed to a `new`/object/array/closure is that consumer's business (this is what
   makes `PaneSplitters`' `initialSize:` beside `currentSize: () => …` correctly clean).
2. `module-scope-captured-reactive-read` — a `Ref` read in a module-level binding.
3. `shallow-payload-mutation` — an in-place mutation of a `shallowRef` payload (`ShallowRef` only:
   `ref()` returns a deep proxy where the same write *does* notify, and flagging it would be exactly
   the false positive that gets a checker deleted).

Current output: **0 candidates in repository code, 3 in the fixture.** It is a ratchet, and it says
so; the census proves it looked.

**Positive control.** The checker refuses to inspect repository code until it has flagged every
category in `scripts/fixtures/reactive-observation-positive-control.ts.fixture` (compiled from
memory at a repository path, so `vue`/`ivue` resolve exactly as for real sources), and refuses to
pass if it inspected zero files. Both failure paths verified **by exit code**:

```
neutered fixture (one bad case made live)  -> FAIL … did not flag shallow-payload-mutation ; exit 1
fixture removed                            -> FAIL … positive-control fixture is missing   ; exit 1
restored                                   -> exit 0
```

`scripts/check-reactive-observation.test.ts` (8 tests) drives it from both sides: each known-bad
shape is flagged, and the **live** form of the same code is not (live getter read, wholesale
`shallowRef` replacement, deep-`ref` payload mutation, construction seed beside a live thunk,
module-scope `Ref` binding read inside a function).

**Gate wiring** (report-only findings, gated instrument), after the coverage ratchet in
`scripts/merge-gate.sh`:

```
step "dropped reactive observations (report-only findings, gated instrument)" bun scripts/check-reactive-observation.ts
```

I did not run `scripts/merge-gate.sh`.

## 4. Deliberately not done

- **No fix for the specimen** — another builder owns it (`af51321` on `refactor-plugin-canvas-git`
  already restores the supplier).
- **No fix in `workspace/`, `git/`, `theme/`, or breadcrumb/popup UI** — nothing verified there, and
  the plugin-canvas builder is in `git/` and `ui/Sidebar.ts` right now.
- **No harness fix** for the missing provenance guard (suspicion 2) — out of the given fix scope;
  recommended as the next task, since it is the defect that actually produced tonight's red.
- **No new invariant record.** `project.invariants.md` is a shared hot file and a contract edit is
  propose-only. Proposed text, if the conductor wants it recorded: *A per-frame observation reads its
  source live* — **Invariant:** if a value is read by a per-frame observer, then the read happens
  inside the observer, or the value's writes bump a version signal the observer subscribes to.
  **Scope:** every read reached by the coarse frame effect, `RootView.update()`, or
  `AppStatusProjection.snapshot()`. **Mechanism:** effects subscribe to the leaf refs they touch at
  read time; a read moved into a constructor or module binding subscribes to nothing. **Generates:**
  the `deps.onScroll()` required-callback seam; `renderRevision`/`paintRevision`/`revision` bumps
  beside every plain-field write. **Rejected alternatives:** a runtime `markLive()` wrapper or debug
  proxy (task #73 forbids a new idiom); a syntactic lint over `.value` (produces confident false
  positives in a reactive codebase). **Evidence:** `scripts/check-reactive-observation.ts` census (0
  candidates over 1309 typed reads) + its positive control; `af51321` restoring the deleted supplier.
  **Impossible if true:** a status field or a scrollbar input that stops changing while the state it
  names keeps moving. **Verification:** `bun scripts/check-reactive-observation.ts` (exit 0, positive
  control flagged) + `bun test scripts/check-reactive-observation.test.ts`. **Status:** provisional.

## 5. Exit codes (all run in `/tmp/conductor-reactive`)

| command | exit |
| --- | --- |
| `bunx tsc --noEmit` | **0** |
| `bun test` | **0** (1379 pass, 0 fail, 16096 expect calls, 207 files) |
| `bun scripts/check-file-grammar.ts` | **0** (389 files, 0 violations) |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all` | **0** |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` | **0** (715 annotations, 42 lattice links, 0 problems) |
| `bash scripts/conventions-gate.sh` | **0** |
| `bun scripts/check-coverage-ratchet.ts` | **0** (260 files; no undeclared decrease against `72dca35`) |
| `bun scripts/check-reactive-observation.ts` | **0** (positive control flagged; 0 repository candidates) |
| `bunx prettier --check` on the new files | **0** |

No assertion or wait count decreased (the branch only adds 8 tests / 9 expect calls), so
`coverage-deltas.md` needed no declaration.

## 6. Files (commit `298673d`, branch `fix-reactive-signal-audit`, worktree clean)

- `scripts/check-reactive-observation.ts` (new)
- `scripts/check-reactive-observation.test.ts` (new, 8 tests)
- `scripts/fixtures/reactive-observation-positive-control.ts.fixture` (new)
- `scripts/merge-gate.sh` (one report-only step + why it blocks only on a broken instrument)
