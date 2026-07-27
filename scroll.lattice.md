# Scroll — Invariant Lattice

How the records in `scroll.invariants.md` hold together. Derived, never
legislative: where this disagrees with the records, the records win and the
finding is against this file.

## Dependency map — chosen stands on chosen

```
Cost tracks the actively observed set
  └─► Scroll frame cost is document-length independent

One generator owns each scroll position
  ├─► Every wheel event becomes one impulse
  └─► Same-direction impulses accumulate to the ceiling

Live motion defines gesture continuation
  └─► Same-direction impulses accumulate to the ceiling

The glide tail is bounded and effective
  └─► Same-direction impulses accumulate to the ceiling
      (stored energy may sustain motion only inside the selected tail)

Driven scroll contracts derive their quantities
  - - constrains the verification of every behavioral record above
```

Import-style references:

- [Scroll frame cost is document-length independent][cost] is the
  scroll specialization of the root
  [Cost tracks the actively observed set][active-cost]. The exact
  65/33/2/1 fingerprint is the per-frame form of observation-priced work.
- [Every wheel event becomes one impulse][event-impulse] and
  [Same-direction impulses accumulate to the ceiling][acc] both
  stand on [One generator owns each scroll position][one-generator]. Without
  one owner, neither the preserved impulse count nor the accumulated velocity
  has one authoritative fold.
- [Live motion defines gesture continuation][continuation] supplies gesture
  identity to [acc]: the visible motion, not a timer, decides whether
  a follow-on impulse belongs to the accumulating run.
- [The glide tail is bounded and effective][bounded-tail] bounds how long
  retained ceiling energy may act. It does not authorize discarding that
  energy before the bound.
- [Driven scroll contracts derive their quantities][method] is
  methodological, not behavioral. It constrains contract authors and test
  expectations; it does not constrain production scroll code.

## The recurring ownership shape

`OverlayLayer.requestPaint` has one frame-request owner: it mutates
`paintRevision`, and the reactive projection requests the frame. A former
second direct request produced a stale-frame race.
`NarrationProjection.bargeIn` has one publication owner at the semantic
mutation boundary; it does not wait for an unrelated render frame to publish
state that changes no cells.

[One generator owns each scroll position][one-generator] is the third
instance of the same structure. Two owners of one obligation is this
repository's most frequent defect: frame request, semantic publication, and
scroll advancement all fail when two paths can independently complete the
same obligation.

## Compositions — emergent guarantees

### Lossless coalescing

**Members:** [one generator][one-generator] ·
[event preservation][event-impulse].

**Guarantee:** Trackpad-rate input can be projected at frame rate without
losing gesture energy.

**Mechanism of conjunction:** Input appends every event to the one owner's
queue; the owner drains all events once per tick. Render requests may collapse
because the queued impulses do not.

**Breaks if:** Input publishes momentum itself; a throttle wraps the impulse
path; more than one drain can consume or overwrite the queue.

### Invariable acceleration

**Members:** [one generator][one-generator] ·
[event preservation][event-impulse] · [accumulation][acc] ·
[document-length-independent frame cost][cost].

**Guarantee:** The same physical gesture has the same accumulating motion at
2,000 and 100,000 lines.

**Mechanism of conjunction:** One owner preserves and folds every impulse;
the fold accumulates toward one ceiling; each frame performs the same bounded
projection work at both document lengths.

**Breaks if:** Scale adds per-frame work, events disappear under pressure, or
another writer advances the position between ticks.

### Bounded continuation

**Members:** [motion-keyed continuation][continuation] ·
[accumulation][acc] · [bounded tail][bounded-tail].

**Guarantee:** A gesture keeps gaining while visibly alive, sustains the
ceiling under dense input, and still stops within the selected tail after the
last input.

**Mechanism of conjunction:** Live velocity retains gesture identity;
same-direction energy accumulates or replaces decay; the elapsed-since-input
bound terminates the shared motion.

**Breaks if:** A clock resets a live gesture, ceiling overflow is discarded,
or the tail is unbounded or too short to produce a visible row.

### Mechanism-derived enforcement

**Members:** [event preservation][event-impulse] ·
[document-length-independent frame cost][cost] ·
[accumulation][acc] · [derived quantities][method].

**Guarantee:** The gate fails on lost work or changed mechanism, not on host
phase.

**Mechanism of conjunction:** Events, impulses, projection work, row travel,
and attributed work are countable. Their expected relations come from queue
cardinality, exact count equality, and configured velocity integrated over
the configured tail.

**Breaks if:** A live contract promotes an observed frame count to an expected
constant, or reports a count without a planted failure proving the predicate
can go red.

## The generated system

Because one tick owns position, every event can enter a lossless queue and
render requests can coalesce independently. Because live motion preserves the
gesture and same-direction energy accumulates within a bounded tail, the
motion grows without becoming endless. Because per-frame work is
document-length independent, that same generator holds at 100,000 lines.
The methodological record then makes each clause gateable using counts
derived from those mechanisms.

[active-cost]: project.invariants.md#cost-tracks-the-actively-observed-set
[one-generator]: scroll.invariants.md#one-generator-owns-each-scroll-position
[event-impulse]: scroll.invariants.md#every-wheel-event-becomes-one-impulse
[cost]: scroll.invariants.md#scroll-frame-cost-is-document-length-independent
[continuation]: scroll.invariants.md#live-motion-defines-gesture-continuation
[acc]: scroll.invariants.md#same-direction-impulses-accumulate-to-the-ceiling
[bounded-tail]: scroll.invariants.md#the-glide-tail-is-bounded-and-effective
[method]: scroll.invariants.md#driven-scroll-contracts-derive-their-quantities
