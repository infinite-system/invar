# READY — the dirty marker is content-derived on EVERY edit (#92)

Worktree `/tmp/conductor-dirty`, branch `fix-content-derived-dirty`, commit
`90e43f1` on base `f5cb6da`. Worktree clean; `git ls-files | grep '^TASK'` returns
nothing.

## The defect, confirmed before touching it

`TextDocument.matchesSaved()` was correct and consulted at exactly two call sites —
`Editor.performUndo()` and `Editor.performRedo()` — under a comment stating its own
false premise ("A normal edit always dirties eagerly; only undo/redo can return to
the clean baseline"). Every other mutator set `dirty.value = true` and never
reconsidered. Reproduced by the negative control below: type `X`, press Backspace,
the buffer is byte-identical to disk and `●` stays lit.

## Option A, chosen on measurement

**Option A — lazy signature, cheap rejects, revision-keyed memo.** The baseline is
three facts checked cheapest-first: line count, then Σ line UTF-16 length, then the
order-sensitive FNV-1a signature. Σ length is maintained incrementally inside
`replaceLineRange` (O(edited lines) — the cost the edit already pays), and rescanned
only on wholesale line-array assignment (load / `replaceAll` / `restore` / baseline
capture).

Measurements that decided it (20,000 lines, 1,477,779 characters, Bun 1.3.14, this
machine):

| Quantity | Measured |
| --- | --- |
| One full FNV signature over the document | **1.73–1.78 ms** |
| Full Σ-length rescan (what incremental maintenance avoids) | 26 µs |
| Two-integer cheap reject | 0.6 ns |
| **Warm per-frame `dirty` read** (unchanged keys) | **13.0 ns** |
| Cold read whose length differs, including its edit (every keystroke while typing) | **0.41 µs** |
| Flip-moment edit + read (line count AND length match → one hash) | 1.77 ms |
| **Held backspace through a 200-char region**, query after each deletion | **mean 1.19 µs, worst 18.1 µs — zero hashes** |
| Held backspace ACROSS the baseline length (200 deletions) | mean 15.6 µs; exactly one deletion (#99, the one landing on the baseline length) paid 2.92 ms cold; the other 199 ≈ 1.2 µs |

Option B (per-line hash array + positional fold) was **not** built. It would only
improve the single baseline-crossing edit, which at 1.8–2.9 ms still fits inside a
frame and cannot recur without the user alternating across the crossing; against
that it costs a 20,000-entry hash array, an invalidation protocol, and the
order-sensitivity trap (XOR or a plain sum calls two swapped lines clean). A
20k-entry array to speed up a query that runs at most once per edit is the wrong
trade. Recorded as rejected alternative (4) in the invariant record, with the
measurement.

## Exact cost of a dirty query

- **Common case (per frame, no edit since the last read):** two integer comparisons
  against the memo keys → 13 ns.
- **Common case (first read after an edit while typing/deleting anywhere off the
  baseline length):** two more integer comparisons (line count, Σ length) → the edit
  plus the read measured 0.41 µs together, no characters touched.
- **Worst case:** one FNV pass over the document — 1.77 ms on 1.48 MB — reachable
  only on an edit that lands on the baseline's line count AND length, i.e. the one
  moment the answer can flip to clean. Never per frame: the result is memoized before
  any second reader sees it.

## How the cache is keyed, and why it cannot go stale

The memo is keyed on the **pair** `(revision, savedBaselineVersion)`, and those are
also the only two reactive refs `get dirty()` reads — so the cache key and the
reactive dependency set are the same thing by construction.

- Content can only change through a mutator, and every mutator bumps `revision`
  (existing invariant *Every document mutation bumps the revision exactly once*).
- The baseline can only move through `captureSavedBaseline()` (load + save), which
  bumps `savedBaselineVersion`.
- Nothing else can change the answer, so no third input can silently invalidate it.

`markSaved()` deliberately does **not** bump `revision`: revision semantics are the
async stale-drop contract (`project.invariants.md` → *Async results are
revision-stamped and stale results discarded*), and a save changes no text. Keying
the memo on `revision` alone would have reported the pre-save answer forever — that
is rejected alternative (5). A test asserts `markSaved()` leaves `revision`
unchanged while flipping the answer.

Because the memo lives in plain (non-reactive) fields on a `Reactive()` instance,
writing it inside the frame effect that reads `dirty` creates no feedback loop, and
the read still subscribes the frame effect to both refs — so a save repaints the tab
with no keystroke.

Drift is bounded in the safe direction and detected: a drifted Σ length can only make
a clean buffer report *dirty* (a mismatch always falls through to a real comparison,
never to a false "clean"), `captureSavedBaseline()` resyncs it at every load and save,
and a 400-step test over every mutator asserts the derived answer equals the naive
`text !== savedText` answer at each step. Positive control: injecting `+ 1` into the
length delta fails that test plus three others.

## The driven backspace proof

`scripts/harness/smoke-dirty-marker-harness.ts` (new, registered in
`scripts/merge-gate.sh` next to the editor harness), real PTY, temp workspace, temp
HOME:

```
== harness dirty-marker: open a clean document ==
  PASS  a freshly loaded document publishes no unsaved edits
  PASS  the clean tab paints a blank marker cell
== harness dirty-marker: a typed character dirties, BACKSPACE clears it (no undo) ==
  PASS  typing paints the dirty marker
  PASS  backspacing the typed character published the buffer as clean
  PASS  backspacing back to the on-disk content CLEARED the dirty marker with no undo
== harness dirty-marker: delete a whole line and retype it identically ==
  PASS  deleting the line content published the buffer as dirty
  PASS  retyping the line identically published the buffer as clean
  PASS  a deleted-and-retyped line clears the dirty marker
== harness dirty-marker: a mid-session save moves the baseline ==
  PASS  Control+s wrote the edited content to disk
  PASS  saving published the buffer as clean
  PASS  the buffer now differs from the SAVED file, so the marker is correctly lit
  PASS  the ORIGINAL loaded content reads as dirty once a later state has been saved
  PASS  typing back to the SAVED content clears the marker (the baseline rebaselined)
smoke-dirty-marker: ALL-PASS
```

- **No `Ctrl+Z` appears anywhere in the smoke.**
- Every post-action wait carries the revision the action bumped
  (`bufferRevision > revisionAfterTyping && dirty === false`), so no predicate can be
  satisfied by the pre-action state; content waits read `editorLines`, the save waits
  on the **disk** content, and no wait observes frame production or a clock.
- The marker is addressed by **geometry** — the single cell after the tab's ` label `
  run, per `TabBarRenderer` — never by searching `●` as text. That helper moved to
  `HarnessSmokeSupport.activeTabHasDirtyMarker` and `smoke-editor-harness.ts` now
  imports it (one geometry, two consumers).
- **Negative control (the instrument fails loudly):** with `TextDocument.ts`,
  `Editor.ts`, and `AppStatusProjection.ts` restored to `f5cb6da` (the eager flag) and
  nothing else changed, the smoke exits 1 at exactly the backspace step —
  `Timed out waiting for the backspaced buffer publishes a higher revision and NO
  unsaved edits`. Files restored from backup afterwards; no git refs were touched.

Flat per-frame cost is also asserted structurally in `bun test`, which cannot flake
under gate load: on a 20,000-line document a counting subclass proves 10,000
per-frame reads while typing perform **zero** content hashes, and the read that lands
back on the baseline length performs **exactly one**. Positive control: the count does
move from 0 to 1, so the instrument can fail.

## Invariant record

`src/modules/editor/editor.invariants.md` → **"The dirty marker is derived from
content, never asserted"** — all fields present including **Scope** (the
`TextDocument` dirty surface and its mutators, `Editor.dirty`/`title`,
`OpenBufferSet.tabs().dirty` and the never-dehydrate rule, `TabBarRenderer`'s marker
cell, the published `dirty` field; per open document; git's HEAD-relative gutter
markers explicitly out of scope), Mechanism, Generates, Evidence, five Rejected
alternatives, Verification (unit + driven + negative control), Status, Last refined.

**Impossible if true:** *a buffer byte-identical to the file on disk that displays the
dirty marker* (or refuses to dehydrate); a marker that depends on HOW the content was
reached — undo depth, edit count, or which mutator ran; a per-frame marker read that
costs a document hash.

Annotations added to `TextDocument.ts` and `Editor.ts`; both checker passes verified
by **exit code**, not by log tail.

## Exit codes

| Check | Exit |
| --- | --- |
| `bunx tsc --noEmit` | **0** |
| `bun test` (1389 tests, 16139 assertions, 0 fail) | **0** |
| `bun scripts/check-file-grammar.ts` | **0** |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all` | **0** |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` (722 annotations resolved, 0 problems) | **0** |
| `bash scripts/conventions-gate.sh` | **0** |
| `bun scripts/check-coverage-ratchet.ts` | **0** |
| `bun scripts/check-reactive-observation.ts` (0 candidates, positive control flagged) | **0** |
| `bash scripts/behavioral-contracts.sh` | **0** |
| `bun scripts/harness/smoke-dirty-marker-harness.ts` × 3 (new) | **0, 0, 0** |
| `bun scripts/harness/smoke-editor-harness.ts` × 3 (touched: shared marker helper) | **0, 0, 0** |
| `bun scripts/check-harness-wait-observation.ts` (0 candidates in the new smoke) | **0** |

Coverage moved UP only, so `coverage-deltas.md` needs no entry:
`src/modules/editor/TextDocument.test.ts` assertions 22 → 43, waits 6 → 11;
`src/modules/editor/Editor.test.ts` assertions 48 → 54, waits 15 → 17;
`scripts/harness/smoke-editor-harness.ts` unchanged counts (two assertion texts
renamed `activeTabHasDirtyDot` → `activeTabHasDirtyMarker`, reported as informational
replacements). No decreases anywhere; the ratchet exits 0 against `f5cb6da`.

`scripts/merge-gate.sh` was **not** run, and nothing was pushed, merged, tagged, or
deleted.
