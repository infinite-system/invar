# List flyweight and held-key acceleration — READY

## Result

Selectable popup interaction now has no item-count-dependent work after an item set and query are
prepared. The same stateful `ScrollPhysics` run tracker drives editor and `BoundedListPopup`
movement. A deliberate press moves one item, a held arrow accelerates, and the plain-arrow step is
capped at 50.

The deterministic PTY drive did **not** reproduce an end-to-end latency increase proportional to
item count before the fix. It did find one real O(n)-per-frame defect inside the popup: the
`ScrollableTextViewport.extent` callback rescanned every label for maximum width during every key and
wheel frame. Removing that scan made popup update time flat. The remaining wheel latency is
item-count-independent and belongs to the existing momentum gesture timing.

## Measurement boundary and fixture

`scripts/harness/measure-completion-list-latency.ts` launches the unmodified app entrypoint through
`PtyTestDriver`, with `completion-mock-provider-preload.ts` replacing the `LanguageProvider` client.
The provider returns exactly 10, 1,000, or 5,000 in-memory completion items.

Latency is measured from writing the key or wheel escape sequence to the PTY master to arrival of the
DEC 2026 end marker for the first completed frame whose emulator grid visibly shows the new selected
row or list window. Each table is eight samples per scale. The same drive records:

- completed frames to the visual condition;
- terminal bytes emitted;
- time spent in `CompletionPopup`'s `BoundedListPopup.update`;
- completion request and popup match-preparation counts.

All key and wheel samples reached the visual condition in one completed frame. Key frames emitted a
median 173 bytes and wheel frames 257 bytes at every scale, before and after.

## Before

Times are milliseconds, p50 / p95. `Popup update` is the median measured inside the completion
popup's real update path.

| Items | Key latency | Key popup update | Wheel latency | Wheel popup update |
| ---: | ---: | ---: | ---: | ---: |
| 10 | 14.483 / 16.173 | 0.079 | 87.717 / 89.362 | 0.106 |
| 1,000 | 14.986 / 17.664 | 0.336 | 85.857 / 91.126 | 0.335 |
| 5,000 | 15.661 / 16.856 | 1.030 | 88.994 / 93.891 | 1.065 |

Request delta across movement plus wheel: 0 at every scale.

Refilter/match-preparation delta across movement plus wheel: 0 at every scale.

## After

| Items | Key latency | Key popup update | Wheel latency | Wheel popup update |
| ---: | ---: | ---: | ---: | ---: |
| 10 | 14.886 / 16.841 | 0.076 | 82.915 / 84.339 | 0.109 |
| 1,000 | 14.529 / 16.276 | 0.068 | 84.106 / 87.940 | 0.113 |
| 5,000 | 14.496 / 15.364 | 0.062 | 83.525 / 86.300 | 0.085 |

Request delta across movement plus wheel: 0 at every scale.

Refilter/match-preparation delta across movement plus wheel: 0 at every scale.

The after result is flat in item count at both the PTY frame boundary and inside popup update.

## What the measurement named

The count-dependent defect was in the viewport extent callback:

`BoundedListPopup.update` → `ScrollableTextViewport` extent →
`maximumItemWidth(this.filteredMatches)`.

That walked every match and measured every label on every movement and momentum frame. At 5,000
items it consumed about 1 ms per frame in this fixture. This was not the width scan in
`recomputeMatches` alone; it was a second, previously unnoticed hot-frame scan.

The fix:

- computes exact width directly from `BoundedListPopupItem.label`, with no wrapper object per item;
- caches it in a `WeakMap` keyed by immutable item-array identity;
- supplies the cached number to viewport extent;
- rebuilds width only for a previously unseen item-set identity;
- precomputes enabled-item navigation during match preparation, so disabled rows cannot turn a move
  into an O(n) scan;
- paints only the existing visible slice;
- marks completion items as source-filtered, avoiding a second fuzzy filter;
- ignores a `setQuery`/`narrow` call when the prefix is unchanged.

The width contract is unchanged: `itemSetMaximumWidth` still takes the maximum exact terminal display
width of `" " + label`. A unit test covers a wide glyph. The cache key is the immutable item-array
identity, so a different item set cannot inherit stale width.

## Candidates eliminated

- **Whole-screen repaint as an item-count cost:** eliminated. Key and wheel frame byte counts were
  constant at every scale, and were small incremental frames (173 and 257 bytes).
- **LSP round trips during selection or scroll:** eliminated by count. Both actions caused zero
  provider requests at all three scales.
- **Refiltering during selection or scroll:** eliminated by count. Both actions caused zero source
  filters and zero popup match preparations.
- **Non-windowed painting:** eliminated by code and drive. The popup paints
  `matches.slice(firstVisible, firstVisible + listRows)`, and the status geometry always reports fewer
  visible rows than items.
- **Wheel bypassing shared scroll physics:** eliminated. Popup wheel input already calls
  `ScrollableTextViewport.handleWheel`, which feeds `Momentum` and requests the first frame.

The deterministic drive did not establish why the original interactive session felt worse at larger
counts: end-to-end latency was already flat before the fix. It did establish and remove the internal
O(n) frame work. The roughly 83–89 ms wheel-to-visible-window timing is flat and appears to be the
product's momentum response, not list materialization. No claim is made that this timing matches the
user's preferred wheel feel.

## Held-key inference and shared curve

Terminals supply repeated key events, not key-up. `ScrollPhysics.keyRunLength` therefore infers a
hold from event cadence:

- same scoped direction within `KEY_RUN_WINDOW_MS` (150 ms): continue the run;
- pause of 150 ms or more: reset;
- direction or consumer-scope change: reset;
- no key-up event is read or required.

The first event has run length 0 and moves exactly one unit. The plain-arrow curve keeps the first
events at one, then uses the existing quadratic:

`floor(1 + 0.4 * (run - start + 1)^2)`

and clamps through `KEY_ACCEL_CAP_ROWS = 50`. The curve constants and run tracker now live together
in the stateful `ScrollPhysics` generator. Bootstrap's editor/Markdown routes and every
`BoundedListPopup` route ask the same instance. The separate Ctrl-arrow jump curve remains capped at
120.

The completion smoke drives 14 repeated Down events through a 5,000-item list and 12 through a
600-line editor. It observes acceleration in both, rejects any step above 50, and asserts the first
list and editor press moves exactly one.

## LSP and filtering counts

The driven 5,000-item completion case proves:

- selection hold: zero `LanguageProvider.completion` calls, zero source filters, zero popup match
  preparations;
- wheel scroll: the same zero deltas;
- typing four prefix characters against a complete completion list: zero new language requests,
  exactly four source filters, and exactly four match preparations;
- acceptance still applies the provider's exact edit, extending its end to the locally narrowed
  prefix only when the provider edit range exactly matched the original prefix.

An incomplete completion list still requests a refreshed provider result on a query change; that is
the LSP contract's explicit incomplete-list case, not movement recomputation.

## Momentum reuse

Momentum/`ScrollableTextViewport` was reused because it was already the popup's wheel generator and
already satisfies one-writer, contrary-direction, scrollbar, and first-frame obligations. Replacing
it with direct row-per-wheel steps would duplicate the gesture regime and violate the adjacent
scroll invariants. Key acceleration is not momentum: it consumes terminal repeat cadence and
produces a bounded discrete selection step, so it correctly remains in `ScrollPhysics`.

## Verification and exact exit codes

- `bunx tsc --noEmit`: 0
- `bun test`: first run 1 due one `OpenPty F_SETFL errno 9` infrastructure failure after 1,362
  passes; quiet retry 0 with 1,363 pass / 0 fail
- `bun scripts/check-file-grammar.ts`: 0
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all`: 0
- `node .claude/skills/invariants/scripts/check_invariants.mjs --refs`: 0
- `bash scripts/conventions-gate.sh`: 0
- `bun scripts/check-coverage-ratchet.ts`: 0
- `bash scripts/behavioral-contracts.sh`: 0

Repeated driven smokes:

| Smoke | Run 1 | Run 2 | Run 3 |
| --- | ---: | ---: | ---: |
| `smoke-bounded-list-popup-harness.ts` | 0 | 0 | 0 |
| `smoke-completion-harness.ts` | 0 | 0 | 0 |
| `smoke-panel-chrome-harness.ts` | 0 | 0 | 0 |
| `smoke-scrollbars-harness.ts` | 0 | 0 | 0 |
| `smoke-agent-search-harness.ts` | 0 | 0 | 0 |

The completion smoke includes the autocomplete, LSP-count, list-hold, editor-hold, single-step,
ceiling, wheel, exact acceptance, and real-tsgo paths. Behavioral contracts include
`idle-quiescence`; it remained green after the key stream and momentum settled.
