# READY — #419 (Field v2: Opus synthesis — the Invariable representation instrument)

Branch `fleet/419-field-v2-opus-synthesis`, head `5ee8d524`, tree clean. Four
commits on top of the merge of `main` (which carries #420, terminal-stage stale
expanded result). v1 is untouched: `git diff 3b15a877..HEAD -- tools/invariant-field`
is empty.

## What I saw change

I drove the real app in headless Chromium against the real 388-record store,
looked at screenshots at every step, and fixed what I saw. The driver is
`tools/invariant-field-v2/BrowserDrive.ts`; the look-and-see scripts are in this
task folder.

**Before.** The page was a 38,623-pixel scrolling document at a 1057-pixel
viewport: header, timeline, field beside a 360-pixel lens, then a 377-row list
below the fold. In 3D the whole SVG frame was hidden, so the view showed grey
rings around **nothing** — no reality core, no sector labels, no selection
label. The sector labels in 2D read `SYSTEM`, `STATE`, `RISK`, `LANGUAGE`; the
dots inside them came from `src/modules/editor/editor` and friends by a hash, so
every label was a word with no relation to what sat under it. Typing in the
record list's search narrowed the list and did nothing at all to the field.

**After.** One viewport-height instrument: header, focus rail, field, lens,
timeline as the bottom edge — `documentHeight` is now exactly `viewportHeight`
(1057). The 3D view carries R, its halo, the eight sector labels and the
selected record's name, projected through the same camera. The sector labels
now name the contract domains that actually hash into each hue slot
(`PROJECT · SEARCH +3`, `LSP · EDITOR +3`, `GIT · LAYOUT +5`). Searching
`scroll` leaves 89 rail rows and lights exactly 89 field marks; the rest stay
visible at low opacity instead of vanishing.

Driven evidence, from the release gate's smoke on this commit:

```
FIELD_SMOKE snapshotIndex=308 records=388 worstRankError=0 worstRadiusError=0
  perturbedError=0.05 measuredMarks=388 worstGeometryError=1.665e-16
  focusedRowCount=89 litMarkCount=89 ownRecords=11 birthSnapshotIndex=307
  birthMarkerLeft="99.675%"
```

`worstGeometryError=1.665e-16` is the whole claim in one number: the distance of
every drawn mark from R, divided by the field radius, equals the radius the
formula produced. The picture *is* the formula, to floating point.

### The seams I found and closed

1. **Two owners of "what is being looked at."** `RecordList` held private
   `searchQuery`, `selectedKind`, `selectedDomain` and `sortOrder` cells; the
   field ignored all four and drew every record. The four cells moved to
   `InvariantFieldApp`, which folds them once into `focusedRecords`. The rail
   receives the array, the field receives the identifier set and mutes what is
   outside it, the lens follows the same selection. `RecordList` now holds no
   filter cell and carries an absence anchor saying so.
2. **The 3D view lost three channels.** `v-show` hid the SVG frame in 3D. The
   scene now builds the reality core and its halo, and a projection pass places
   HTML labels for R, the eight sectors and the selection. This became the
   record *Both field views place a record at the same radius* — a view may
   differ in what it is for, never in what it claims.
3. **Labels that lied.** `DOMAIN_NAMES` was renamed `SECTOR_PALETTE_NAMES`
   (they are hue slots, not domains) and the visible label is now built from the
   domains actually present in each sector.
4. **Dead stylesheet law.** A census (`tools/invariant-field-v2/check-stylesheet.ts`)
   found 3 unreachable class families (`.record-card`, `.record-body`,
   `.record-field*` — #415 leftovers, the v2 form of the reported dead-selector
   bycatch) and 8 top-level selectors declared twice where the later copy won
   silently (`.field-stage`, `.reality`, `.domain-sector-N`, `.timeline-control`
   among them). Both counts are now zero and the census is a release-gate step.
   Positive control: planting `.this-class-is-planted-and-unused` and a second
   `.field-stage` turns it red; removing them turns it green.
   *Removing the duplicate `.field-stage` also removed its `position: relative`,
   which threw the coordinate readout and every projected 3D label to the page
   origin. I saw it in the screenshot and restored it — worth recording because
   it is exactly the class of defect the census cannot catch.*
5. **Two token tables.** `tools/invariant-field-v2-design/tokens.css` and
   `DesignTokens.ts` both define the palette, and nothing imports the design
   one. Rather than delete a #416 deliverable or over-unify two things with
   different jobs, a parity test now compares all 28 shared roles: they may
   differ in coverage, never in value. Positive control verified by changing one
   application colour.
6. **Two literal durations** (`90ms`) still sat in `styles.css`. Removed, so the
   record *Design tokens are the only source of colour and timing* is true and
   guarded rather than aspirational.
7. **A selected record near the right rim pushed its name off the stage.** Seen
   in a screenshot; the 2D label now anchors inward and the 3D overlay label
   centres and clips.

## The release gate — one command

```sh
bash tools/invariant-field-v2/release-gate.sh
```

Documented in the v2 README. Seven steps: types, unit tests (parser parity
against the canonical checker, rank determinism and range, playout, code lens,
tokens, absence guards), the instrument's own contract structure, annotation
resolution, the stylesheet census, the planted-rot calibration, and **one**
driven Chromium smoke. It starts and stops its own server on port 4319
(`FIELD_RELEASE_GATE_PORT`). The last line is `RELEASE-GATE PASS (0 failures)`,
which is what it printed on this commit.

It is not a second merge gate: no new smoke registration, no new gate step, and
the repo's conventions gate and merge gate cover this tree unchanged.

The smoke (`tools/invariant-field-v2/smoke-field.ts`) carries its own positive
control: it re-runs the rank comparison against a weight table with `kind`
raised by 0.05 and **fails the run if that still matches**. `perturbedError=0.05`
above is that arm reporting green. The calibration step is the same idea one
level up — planted rot must move *Seams are drawn at the shared generator*
outward by a measured 0.0778.

## The instrument's own contract

```
tools/invariant-field-v2/invariant-field.invariants.md
```

3 reality-based and
8 chosen records, canonical schema, checker `PASS`, `--refs` 0 problems, and no
uncovered record: every one has an annotation at an enforcement point, with the
two absence-enforced records annotated on the tests that guard the absence.

Per record, with the rank the instrument gives itself in the current snapshot:

| rank | radius | verification | record | kind |
|---|---|---|---|---|
| 0.756 | 0.236 | executed-pass | A scanner that writes contracts measures itself | reality, absolute |
| 0.741 | 0.241 | executed-pass | R is an asymptote no record reaches | reality, absolute |
| 0.698 | 0.257 | executed-pass | A bounded read is the only verification the instrument runs | chosen |
| 0.689 | 0.261 | citation-only | Rank depends only on the contract set and its history | reality, renegotiable |
| 0.686 | 0.262 | executed-pass | One focus fold serves every surface | chosen |
| 0.667 | 0.270 | executed-pass | Both field views place a record at the same radius | chosen |
| 0.661 | 0.272 | executed-pass | A renamed record keeps its identity | chosen |
| 0.631 | 0.286 | citation-only | Design tokens are the only source of colour and timing | chosen |
| 0.627 | 0.287 | citation-only | Rot moves a record outward only | chosen |
| 0.611 | 0.295 | executed-pass | The rank weights are normalized and sum to one | chosen |
| 0.570 | 0.317 | citation-only | An idle instrument does no work | chosen, provisional |

Two of these were **found** rather than chosen, and one was sharpened by the
evidence rather than by taste:

- *A scanner that writes contracts measures itself* is the reality behind the
  read-only rule. A measuring instrument that writes its own input reports its
  own loop. Everything read-only in the tool — the scanner, the span endpoint,
  the bounded verification runner — descends from it.
- *R is an asymptote no record reaches* falls straight out of
  `0.10 + 0.90 × e^(−2.5 × rank)`. No amount of evidence turns a record into
  reality; the geometry says so before the prose does.
- *Rank depends only on the contract set and its history* had to be **scoped**
  once I checked it: the current snapshot also *executes* bounded verification
  commands against the working tree, so it observes more than the git tree. The
  record now says so and hands that arm to *A bounded read is the only
  verification the instrument runs*. It is `Renegotiable at` the contract schema
  in `.claude/skills/invariants/`, because the schema decides which fields a
  rank may read.

The sibling lattice,

```
tools/invariant-field-v2/invariant-field.lattice.md
```

carries the dependency map and four compositions: *An honest measurement*, *A readable
history*, *One instrument, not four surfaces*, and *The instrument inside its
own field*. It also records the recurring two-owner shape this synthesis met
three times (the filter, the token table, the field frame).

## Self-measurement — the instrument in its own field

The scanner needed no special case: it reads the new contract the way it reads
any other. Driven, at the snapshot that first carried it:

```
SELF totalRows=388 ownRows=11 litMarks=11
  instrumentPresence="Instrument: 11 own records"
  snapshotTitle="dd2b61b6 · Field v2: a release gate and a driven smoke..."
  selectedRecord="A scanner that writes contracts measures itself"
```

Three deliberate surfaces, all visible in
`/tmp/419-field-look/05-instrument-measures-itself.png`:

- a **`Measure the instrument`** control in the rail, which focuses the
  instrument's own contract *and* rewinds the timeline to the snapshot where
  that contract was born (`birthSnapshotIndex=307`), so the instrument's birth
  plays out inside the field it draws;
- a **gold birth marker** on the timeline track, clickable, plus a live
  `Instrument: 11 own records` readout beside the snapshot position;
- its own sector, labelled `INVARIANT-FIELD`, holding 11 lit dots with the
  other 377 muted around them.

It is the ordinary domain focus pointed at itself — no second code path, which
is the point of the fourth composition. Its own top record, *A scanner that
writes contracts measures itself*, ranks 0.756: near the front of the whole
repo, and it earned that by being verified, annotated and generative, not by
being about itself.

## The name

The app is now the **Invariable representation instrument** (document title,
`<h1>`, README heading), with `Invariance Field` kept as the short name inside
the code. The identity lives in exactly one place,
`tools/invariant-field-v2/Instrument.ts`, and a test holds the page title, the
chrome name and the scanned contract path together so they cannot drift.

## Verification

| check | result |
|---|---|
| `bash tools/invariant-field-v2/release-gate.sh` | RELEASE-GATE PASS (0 failures) |
| `bun test tools/invariant-field-v2` | 48 pass, 0 fail, 326 expect() calls |
| `bunx vue-tsc --noEmit -p tools/invariant-field-v2/tsconfig.json` | clean |
| `check_invariants.mjs <contract>` | PASS — 3 reality, 8 chosen |
| `check_invariants.mjs --refs` | 1301 annotations, 259 lattice links, 0 problems |
| `bun tools/invariant-field-v2/check-stylesheet.ts` | `CENSUS unreachable=0 duplicated=0` |
| planted-rot calibration | outward movement 0.0778 (red arm fires) |
| `bash scripts/merge-gate.sh` | `merge-gate: ALL-PASS`, **GATE_EXIT=0**, 4m08s |

The merge gate ran after merging `main` (with #420), fully green with no
pre-classified exception, and its retry tally reports "no step passed only on
retry — this run's green is a clean green".

## Bycatch

- **The current snapshot mixes two sources** (suspect, not fixed). Contract
  *text* for the current snapshot is read from the working tree
  (`currentTrackedFiles`), while annotations, the file tree and evidence
  resolution come from `HEAD` (`git grep <commit>`, `git ls-tree <commit>`) —
  `RepositoryHistory.ts`, `buildSnapshot`. With uncommitted contract edits the
  two disagree: before I committed, my new contract appeared in the field with
  zero annotations and unresolved evidence; after committing, all 11 records
  resolved. Reproduced twice. Out of scope here, and the fix is a scanner-design
  decision (read both from the working tree, or both from HEAD).
- **`.record-mark-composition` is emitted with no stylesheet rule.**
  `ui/FieldView.ts:258` adds the class; `styles.css` has no rule for it, so
  lattice membership carries no visual channel of its own even though the design
  language promises a relation arc. My census checks stylesheet → source only;
  the source → stylesheet direction is unguarded.
- **`RecordList.recordCards` was a dead alias** for `recordRows` with no caller
  (#415 bycatch, v2 form). Removed while rewriting that file for the focus fold,
  not as a separate commit, because the file was rewritten wholesale.
- **The design language's `tokens.ts` is imported by nothing.** `tokens.css`
  serves the static mockup; `tokens.ts` serves neither the mockup nor the app.
  It is now covered indirectly through the parity test on `tokens.css` values. A
  later task could delete it or have the mockup generate from `DesignTokens`.
- **Six design-table colours have no application counterpart**
  (`field-background-canvas`, `field-border-quiet`, `field-text-inverse`,
  `field-signal-orphan`, and two component backgrounds). The design language
  names an amber orphan signal the app never draws; orphan pressure currently
  reaches the eye only through radius.
- **`prefers-reduced-motion` is untested by anything driven.** The class
  branches exist and a unit test covers the mode flag, but no driven pass
  confirms the reduced-motion field, and the release-gate smoke does not cover
  it.
- **Untracked >2 MB `.pile` files under `artifacts/home/.cache/bun/`** draw
  "file exceeds 2000000 bytes — not scanned" notes from the invariant checker on
  every run. Cache debris, not repo content; they belong in an ignore rule.

## Notes

- The known #420 red is gone: `main` merged in at `16fd0203` and the gate ran
  fully green.
- The generated store is 180 MB and stays ignored under `generated/`.
- Scratch tooling in this task folder: `419-look-at-the-field.ts` and
  `419-look-at-the-instrument.ts` (screenshot drives), each with a header
  comment saying how to run it and what a zero count would mean. `BrowserDrive.ts`
  and `check-stylesheet.ts` graduated out of the task folder into
  `tools/invariant-field-v2/` because the release gate depends on them.
