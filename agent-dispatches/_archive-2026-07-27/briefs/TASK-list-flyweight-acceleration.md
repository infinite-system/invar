# TASK — A dropdown must cost the same at 10 items and 10,000; and a held key must accelerate

You are a builder on the Invar terminal IDE. Work ONLY in this worktree. Do NOT run
`scripts/merge-gate.sh`, do NOT push, merge, tag, or delete branches — the conductor does that.
Commit to this branch when done and report.

## The user's report (verbatim, trimmed)

> "the search for a ts autocomplete in editor when you do `process.exit(` … popups the list with
> hundreds of items, the movement with keyboard is slow has no acceleration -> maybe we add that the
> same way we have it in the editor movement with arrows, is that possible for all our dropdowns …
> but right now it's not fully gonna work because when i scroll the list down it chokes a bit and
> becomes slow, seems it's not flyweight, can we make dropdowns for thousands of items be 'virtual',
> flyweight, so that both scrolling will be fast and keyboard acceleration can work there and anywhere
> the dropdown selectable list is used?"

Two deliverables: (1) list interaction cost independent of item count, (2) held-key acceleration for
list movement, shared with the editor and anywhere else it belongs.

## What is ALREADY measured — do not re-derive, and do not assume it is the cause

Conductor measurements on this machine (bun, arm64), so you start from facts:

```
                                                    200 items   1000 items   5000 items
CompletionPopup.filterItems  (per keystroke)          0.134 ms     0.612 ms     3.275 ms
BoundedListPopup.filterItems (per keystroke)          0.027 ms     0.084 ms     0.283 ms
width scan over every label  (per refilter)           0.026 ms     0.248 ms     1.014 ms
```

So at 1000 items the whole per-keystroke O(n) budget is about **1 ms**. That cannot explain a choke.

Also already established by reading the code:

- **Painting is already windowed.** `BoundedListPopup.update()` does
  `matches.slice(geometry.firstVisible, geometry.firstVisible + geometry.listRows)` and renders only
  those rows. "Make it virtual" is, for the paint path, already true.
- `maximumItemWidthValue` is cached in `recomputeMatches()`, not recomputed per frame — though it is
  recomputed on every refilter even though it does not depend on the query, and it allocates one
  object per item purely to call a width helper. Wasteful, but 0.25 ms at 1000 items.
- **Held-key acceleration ALREADY EXISTS and is already a generator.** `ScrollPhysics.Class.keyAcceleration(run)`
  turns a repeat-run length into a step size, and `ScrollPhysics.Class.KEY_RUN_WINDOW_MS` is the window
  that decides whether the next repeat continues the run or resets it. It is wired in
  `src/modules/app/Bootstrap.ts` around lines 1093-1117 (`movementRun` / `movementAcceleration`) and used
  for editor caret movement and markdown split movement. There is an invariant recorded for it in
  `project.invariants.md` whose Impossible-if-true is "acceleration logic that depends on a real key-up
  event to reset" — because terminals report key REPEAT, never key-up.
  So this part of the task is ROUTING, not invention. Do not build a second ramp.

## Part 1 — REPRODUCE AND MEASURE FIRST. Do not fix anything before this.

The cause is not yet known. Find it before touching it.

Drive the REAL app through the PTY harness (`scripts/harness/PtyTestDriver.ts`) with a completion list
of ~1000 and ~5000 items — synthesise the items through the `LanguageProvider` contract rather than
depending on a real tsserver, so the measurement is deterministic. Then measure, at the PTY:

1. **Per-keypress latency** for Down/Up while the popup is open: time from the keystroke reaching the
   PTY to the frame that shows the new selection. Compare against the same measurement with 10 items.
   The delta as a function of item count is the number that matters.
2. **Per-wheel-event latency** for scrolling the list, same comparison.
3. **Where the time goes.** Instrument the real path rather than guessing between these candidates:
   - the frame path (is a keystroke repainting the whole screen, editor included?)
   - the wheel-to-scroll wiring (does the popup go through the momentum/`ScrollPhysics` generator that
     the terminal and overlays use, or does it scroll a row per event with a repaint each?)
   - an LSP round-trip per interaction (does moving the selection, or scrolling, re-request or
     re-narrow completions? it must not)
   - anything else the measurement names.

Report the numbers BEFORE the fix, in the report file. If the measurement shows the cost is already
independent of item count and the choke is elsewhere, SAY THAT — a wrong attribution here is worse
than no fix, and the conductor has already had to retract one overestimate this week.

## Part 2 — the invariant to establish: list cost is O(visible rows), not O(item count)

Whatever the measurement names, the end state is one property, gate-enforced:

> Every interaction with a selectable list — open, move, scroll, hover, accept — costs the same at
> 10,000 items as at 10. Only filtering may be O(n), and only once per query change.

Where cost is still O(n) per interaction, remove it. Known candidates from the reading above, at
minimum: recomputing the width scan on refilters where the query changed but the item set did not, and
allocating a wrapper object per item to compute a width. There may be more; the measurement decides.

Two things to be careful about:

- **Do not break the width contract.** The popup's box width comes from the widest label, so a
  cheaper width must produce the SAME layout. If you cache it, the cache must be keyed on the item
  set — a stale width is a visibly wrong box. Prove the layout is unchanged, do not assume it.
- **Do not introduce a lazy/paged item model unless the measurement demands it.** The items already
  arrive as an in-memory array; a virtual data source would be new machinery justified by nothing.

## Part 3 — route list movement through the acceleration generator that already exists

The user asked for dropdown movement to accelerate "the same way we have it in the editor movement with
arrows". It exists; the popups simply never got routed through it.

What to do:

- Make list movement (`BoundedListPopup.moveSelection`, and therefore the completion popup, buffer
  dropdown, branch selector, panel-add popup, layouts menu, and anything else on that seam) advance by
  `ScrollPhysics.Class.keyAcceleration(run)` steps instead of exactly one.
- **The seam is the RUN TRACKER, not just the curve.** Today `accelerationDirection` /
  `accelerationRun` / `accelerationLast` are local closure variables inside `Bootstrap`. If the popups
  re-implement that bookkeeping, we have two copies of hold-inference that will drift — the exact
  duplication the modularity rule forbids. Move the run tracker into the generator that owns the curve
  so every consumer shares one answer to "how long has this key been held, and did the run reset",
  then have Bootstrap's editor path and the list path both ask it. Do not leave a private copy behind.
- Keep the invariant's guarantee intact: a run resets on a pause with NO key-up event, and a single
  deliberate press must move exactly one row — acceleration must never make one press overshoot.
- Bound the step size. A ramp with no ceiling is unusable in a 5000-item list, and the ceiling belongs
  in the generator's data, not in a popup handler.

## Part 3b — the LSP must not recompute the list to move through it

The user was explicit: "lsp should not keep recalculating that list for the tooltip." Prove it, do not
assume it:

- Moving the selection (Up/Down, held or single) must issue ZERO language-server requests and ZERO
  re-filters. The item set has not changed; only the selected index has.
- Scrolling the list must likewise issue zero requests and zero re-filters.
- A re-filter is legitimate ONLY when the query/prefix actually changes (the user typed another
  character), and then exactly once — not once per frame and not once per candidate source.
- Assert this by counting: instrument the completion source (through the `LanguageProvider` contract)
  and assert the request count and the filter count are unchanged across a movement and a scroll drive.
  A count is the honest instrument here; a latency number can hide a duplicate request behind a cache.

## Verification — by driving, at both scales

- Per-keypress and per-wheel latency at 10 / 1000 / 5000 items, before and after, in the report. The
  after-numbers must be flat in item count.
- Hold Down through a 5000-item list and assert the selection accelerates AND stays bounded; assert a
  single press still moves exactly one row.
- The editor caret proves the same generator: hold Down in a long file, assert acceleration there too.
- `idle-quiescence` must still hold: when the key stream stops and the list settles, frames stop. An
  acceleration ramp that keeps requesting frames forever is a regression, and there is a contract that
  will catch it — run `bash scripts/behavioral-contracts.sh`.
- Every existing popup smoke green three times: bounded-list-popup, completion/autocomplete,
  panel-chrome, scrollbars, agent-search.

## Rules

- Full descriptive identifier names, no abbreviations. `.prettierrc`, 80 columns.
- `Static()`/`Reactive()` ivue conventions, `protected` floor, late-read discipline,
  file-name-follows-class, `X.interface.ts` for contracts.
- Read `src/modules/ui/ui.invariants.md` and `src/modules/system/*.invariants.md` BEFORE editing,
  including their Rejected-alternatives sections — the scroll-stability and thumb-oscillation records
  are directly adjacent to this work and were paid for twice.
- Every wait observes the condition its assertion reads. No bare sleeps, no vacuous predicates, no
  clock-based silence assertions. A LATENCY measurement is not a wait — measure by comparing two
  readings, but never gate a wait on a duration.
- Invariant records for the two new properties (cost independent of item count; held-key acceleration
  is bounded and single-press-exact), every field including **Scope**. Verify with EXIT CODES.
- Run and report exact exit codes: `bunx tsc --noEmit`, `bun test`, `bun scripts/check-file-grammar.ts`,
  both invariant checker passes, `bash scripts/conventions-gate.sh`,
  `bun scripts/check-coverage-ratchet.ts`, `bash scripts/behavioral-contracts.sh`, and every smoke you
  touch three times.
- Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <message-file>`. Leave the worktree
  clean; `git ls-files | grep '^TASK'` must return nothing.

## Report to /tmp/list-flyweight-READY.md

Before/after latency tables at all three scales; what the measurement named as the actual cause (and
which candidates it ELIMINATED); how hold and release are inferred from a terminal that has no key-up;
the ramp's ceiling and where its shape lives; whether Momentum/ScrollPhysics could be reused and why;
and anything you could not prove.
