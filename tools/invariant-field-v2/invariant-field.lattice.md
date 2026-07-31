# Invariance Field — Invariant Lattice

How the records in `invariant-field.invariants.md` hold together. Derived,
never legislative: where this disagrees with the records, the records win and
the finding is against this file.

## Dependency map — chosen stands on reality

```
A scanner that writes contracts measures itself
  ├─► A bounded read is the only verification the instrument runs
  └─► An idle instrument does no work

Rank depends only on the contract set and its history
  ├─► The rank weights are normalized and sum to one
  ├─► A renamed record keeps its identity
  └─► An idle instrument does no work

R is an asymptote no record reaches
  ├─► Rot moves a record outward only
  └─► Both field views place a record at the same radius

Both field views place a record at the same radius
  └─► One focus fold serves every surface

Design tokens are the only source of colour and timing
  - - constrains every surface above; it carries no data of its own
```

Import-style references:

- [A bounded read is the only verification the instrument runs][bounded-read]
  and [An idle instrument does no work][idle] are the two shapes the
  read-only reality takes: one bounds what the instrument may execute, the
  other bounds what it may do while nobody asks. Both stand on
  [A scanner that writes contracts measures itself][no-write].
- [The rank weights are normalized and sum to one][weights] and
  [A renamed record keeps its identity][identity] are what make
  [Rank depends only on the contract set and its history][pure] usable rather
  than merely true: a pure function of a drifting identity would still produce
  an unreadable timeline.
- [Rot moves a record outward only][rot] is the sign convention that
  [R is an asymptote no record reaches][asymptote] needs in order to mean
  something. Without a fixed direction of decay, distance from R would carry
  no reading.
- [One focus fold serves every surface][focus] stands on
  [Both field views place a record at the same radius][same-radius]: two
  surfaces can only share a focus if they already agree about position.
- [Design tokens are the only source of colour and timing][tokens] is
  methodological. It constrains authors of surfaces; it does not constrain the
  scanner or the rank.

## The recurring ownership shape

The repository's most frequent defect is two owners of one obligation. This
instrument met it three times:

- The record list held a private filter while the field showed every record.
  Two owners of "what is being looked at" — resolved by
  [One focus fold serves every surface][focus].
- The design folder and the tool each held a token table. Two owners of "what
  colour is a domain" — resolved by
  [Design tokens are the only source of colour and timing][tokens].
- The 2D view owned the frame — R, the shells, the sector labels — while the
  3D view drew only dots. Two owners of "where is reality", one of which
  answered "nowhere" — resolved by
  [Both field views place a record at the same radius][same-radius], which now
  requires the 3D view to name the same channels.

## Compositions — emergent guarantees

### An honest measurement

**Members:** [A scanner that writes contracts measures itself][no-write] ·
[A bounded read is the only verification the instrument runs][bounded-read] ·
[Rank depends only on the contract set and its history][pure].

**Guarantee:** What the field shows is a property of the repository, not a
property of the instrument or of the machine it runs on.

**Mechanism of conjunction:** The scanner never writes the text it reads, it
never executes anything that could change that text, and the rank folds only
parsed text and commit metadata. The three together close every path by which
the instrument's own state could reach its output.

**Breaks if:** The scanner repairs a record, a verification command gains a
pipe or a redirection, or a rank component reads a clock, a machine path, or a
random source.

### A readable history

**Members:** [Rank depends only on the contract set and its history][pure] ·
[A renamed record keeps its identity][identity] ·
[Rot moves a record outward only][rot] ·
[R is an asymptote no record reaches][asymptote].

**Guarantee:** Playing the timeline shows what actually happened to the
contract layer: strengthening as inward motion, decay as outward motion,
renames as movement rather than as death and rebirth, and no arrival at
reality.

**Mechanism of conjunction:** Determinism makes two snapshots comparable.
Stable identity makes the comparison per record. The rot sign convention makes
the direction of motion mean one thing. The asymptote keeps the scale open at
the inner end, so improvement always has somewhere to go.

**Breaks if:** Identity is keyed on the heading alone, rot is allowed to pull
inward, or the radius is rescaled per snapshot so that positions between
snapshots stop being comparable.

### One instrument, not four surfaces

**Members:** [One focus fold serves every surface][focus] ·
[Both field views place a record at the same radius][same-radius] ·
[Design tokens are the only source of colour and timing][tokens].

**Guarantee:** The rail, the field, the lens, and the timeline read as one
instrument: the same records, at the same distances, in the same language,
whatever view is open.

**Mechanism of conjunction:** One fold decides which records are in focus. One
radius decides where each record sits, in both views. One token table decides
what every surface looks like and how fast it responds. A surface can differ
only in what it is for, never in what it claims.

**Breaks if:** A surface adds a private filter, a view rescales the radius, or
a stylesheet names a literal colour or duration.

### The instrument inside its own field

**Members:** [A scanner that writes contracts measures itself][no-write] ·
[Rank depends only on the contract set and its history][pure] ·
[One focus fold serves every surface][focus].

**Guarantee:** The instrument can measure itself without corrupting the
measurement. Its own contract is scanned like any other, its own records
receive ranks by the same formula, and its own birth appears on the timeline.

**Mechanism of conjunction:** Because the scanner only reads, this contract is
data rather than a special case. Because rank is a pure function of contract
text, this contract's records are ranked by exactly the rule they describe.
Because one fold serves every surface, focusing the instrument's own contract
needs no separate view — it is the ordinary domain focus pointed at
`tools/invariant-field-v2/invariant-field.invariants.md`.

**Breaks if:** The scanner special-cases its own contract, the instrument
focus becomes a second filter path, or the rank formula treats this contract
differently from any other.

## The generated system

Because the scanner may only read, the instrument can be pointed at itself
without the measurement becoming circular. Because rank is a pure fold over
text and commits, the same repository always yields the same field, so the
timeline is evidence rather than animation. Because rot has one direction and
R is unreachable, the field's one spatial channel — distance — carries a
single, open-ended reading. Because one fold, one radius, and one token table
serve every surface, the rail, the field, the lens, and the timeline are views
of one state rather than four programs that agree by luck.

The last composition is the reason this contract exists at all: an instrument
that cannot measure itself is asking its users to trust a claim it refuses to
test.

[no-write]: invariant-field.invariants.md#a-scanner-that-writes-contracts-measures-itself
[pure]: invariant-field.invariants.md#rank-depends-only-on-the-contract-set-and-its-history
[asymptote]: invariant-field.invariants.md#r-is-an-asymptote-no-record-reaches
[weights]: invariant-field.invariants.md#the-rank-weights-are-normalized-and-sum-to-one
[rot]: invariant-field.invariants.md#rot-moves-a-record-outward-only
[focus]: invariant-field.invariants.md#one-focus-fold-serves-every-surface
[same-radius]: invariant-field.invariants.md#both-field-views-place-a-record-at-the-same-radius
[tokens]: invariant-field.invariants.md#design-tokens-are-the-only-source-of-colour-and-timing
[bounded-read]: invariant-field.invariants.md#a-bounded-read-is-the-only-verification-the-instrument-runs
[idle]: invariant-field.invariants.md#an-idle-instrument-does-no-work
[identity]: invariant-field.invariants.md#a-renamed-record-keeps-its-identity
