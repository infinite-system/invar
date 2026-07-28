# READY — Scroll invariants and lattice

Commit: `c4aba64101f0607794396c3713857f1bb452739f`

Branch: `docs-scroll-invariants` (clean; ahead of `origin/main` by 1).

## Outcome

Added `scroll.invariants.md` with seven canonical chosen records:

1. `One generator owns each scroll position`
2. `Every wheel event becomes one impulse`
3. `Scroll frame cost is document-length independent`
4. `Live motion defines gesture continuation`
5. `Same-direction impulses accumulate to the ceiling`
6. `The glide tail is bounded and effective`
7. `Driven scroll contracts derive their quantities`

The first five behavioral records and the contract-method record are
established from current code plus enforcing unit/PTY contracts. The glide-tail
record is deliberately provisional: issue #146 remains its one Open question
because the selectable 100 ms minimum can swallow a one-notch gesture.

Each record has a concrete impossibility boundary and an honest Verification
field. The single-owner record declares that no standalone structural check
currently bans every possible direct offset write. The glide-tail record
declares that no check currently sweeps visible motion over every selectable
duration. The methodology record declares that future derivation remains a
review-time judgment.

Added `scroll.lattice.md` with:

- the dependency on root `Cost tracks the actively observed set`;
- the dependence of event preservation and accumulation on one ownership
  generator;
- continuation and bounded-tail dependencies;
- the methodological record placed beside, rather than inside, production
  behavior;
- the same one-obligation/one-owner shape in `OverlayLayer.requestPaint`,
  `NarrationProjection.bargeIn`, and scroll advancement;
- four emergent compositions: lossless coalescing, invariable acceleration,
  bounded continuation, and mechanism-derived enforcement.

No production source was changed.

## Current driven fingerprints

Focused real-PTY drives ran before authoring the records.

### Scale parity

The same default flat-editor gesture at 2,000 and 100,000 lines measured:

| quantity per frame | 2,000 | 100,000 |
| --- | ---: | ---: |
| document reads | 65 | 65 |
| fold lookups | 33 | 33 |
| wrap lookups | 2 | 2 |
| layout computations | 1 | 1 |

Both gestures had the same row-crossing fingerprint and travelled 28 rows.
The focused instrument exited 0.

### Event and impulse preservation

The calibrated 150-event real-rate drive measured:

| surface | lines | events | impulses | projections | rows |
| --- | ---: | ---: | ---: | ---: | ---: |
| editor | 2,000 | 150 | 150 | 59 | 412 |
| diff | 2,000 | 150 | 150 | 57 | 401 |
| editor | 100,000 | 150 | 150 | 58 | 404 |
| diff | 100,000 | 150 | 150 | 58 | 402 |

The focused input-coalescing instrument exited 0.

### Continuation

Delayed notches landed after the 150 ms cadence proxy while motion remained
live:

- 212.0 ms: boundary rows `2 -> 3`;
- 276.6 ms: boundary rows `2 -> 2`;
- 306.8 ms: boundary rows `1 -> 2`.

The focused continuation instrument exited 0.

### Accumulation and ceiling retention

Three separated flicks produced four-frame peaks:

- default 220 rows/s: `19,22,24`;
- raised 320 rows/s: `19,31,35`.

The rapid 60-notch drive ended at row 197, exactly the derived floor
`ceil(220 * 900 / 1000 - 1) = 197`. Both accumulation drives and the rapid
drive exited 0.

## Positive control

Temporarily changed the lattice's `Every wheel event becomes one impulse`
reference to `#missing-positive-control-anchor`.

`check_invariants.mjs --refs` exited 1 and reported the unresolved anchor at
all four use sites, with the correct suggested anchor. The plant was removed.
The final checker then resolved 67 lattice links with zero problems.

## Verification — exact exit codes

- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`
  — `0` (`869` annotations resolved, `67` lattice links resolved,
  `0` problems)
- `bash scripts/conventions-gate.sh` — `0`
- `bunx tsc --noEmit` — `0`
- `bun test` — `0` (`1651 pass`, `0 fail`, `249` files)
- 80-column audit for both new files — no output
- `git diff --check` — `0`

The checker reports informational reverse-annotation coverage for the seven
new consolidation records. This task intentionally made no `src/` changes;
the enforcing production sites retain their existing UI/editor contract
annotations.

`scripts/merge-gate.sh` was not run, as required. Nothing was pushed, merged,
tagged, or deleted.

## Bycatch

None observed.
