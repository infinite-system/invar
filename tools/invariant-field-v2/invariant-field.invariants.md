# Invariance Field — Invariants

The contract of the instrument that draws this repository's contracts. It
governs `tools/invariant-field-v2/` only: the scanner that reads every
contract snapshot out of Git history, the rank that turns a record into a
radius, and the browser surfaces that show the result.

The instrument reads this file like any other contract, so every record below
becomes a dot in the field it describes.

## Reality-based invariants

### R is an asymptote no record reaches

**Invariant:** If a record has a rank, then its drawn radius is greater than
zero, so no record can occupy the center of the field.

**Scope:** Every ranked record in every snapshot, in the exact 2D view and in
the constrained 3D view.

**Mechanism:** Rank is clamped to the zero-to-one range, and the radius is
`0.10 + 0.90 × e^(-2.5 × rank)`. An exponential of a finite exponent is never
zero, and the added `0.10` floor keeps the strongest record a visible distance
out. Reality is the limit of evidence, not a place a record arrives at.

**Generates:** The reality well drawn as a separate mark rather than as a
record; the "distance from R" reading of the whole field; the refusal to
report a rank of "complete".

**Rejected alternatives:** Map the best rank to radius zero — the field would
then claim a record had become reality, which no amount of evidence can
establish.

**Evidence:** `tools/invariant-field-v2/Rank.ts` (`calculateRank`, final
`radius` expression); `tools/invariant-field-v2/Rank.test.ts`.

**Impossible if true:** A record drawn at the field center, or a reported
radius of zero for any record in any snapshot.

**Verification:** `grep -n "0.1 + 0.9 \* Math.exp(-2.5 \* rank)" tools/invariant-field-v2/Rank.ts`

**Status:** established

**Last refined:** 2026-07-31

### A scanner that writes contracts measures itself

**Invariant:** If the scanner writes to any `*.invariants.md` or
`*.lattice.md` file, then the next rank it computes is partly a measurement of
the scanner, not of the repository.

**Scope:** Every path the instrument uses to reach contract text: history
reads, current-tree reads, annotation scans, and the executed verification
arm.

**Mechanism:** Rank is computed from contract text and from annotations that
point at contract records. Contract text is therefore the input. Any write
places the instrument's own output back into its input, and a measurement that
feeds itself reports its own loop instead of the thing measured.

**Generates:** The read-only file access in the scanner (`git show`,
`git ls-tree`, `git grep`, `readFileSync`); the refusal to run any
verification command that is not a bounded read; the store written to an
ignored `generated/` directory instead of into the tree.

**Rejected alternatives:** Let the instrument repair a malformed record it
parses — a self-repairing scanner reports a contract set nobody wrote.

**Evidence:** `tools/invariant-field-v2/RepositoryHistory.ts` (`runGit`,
`currentTrackedFiles`, `verificationMode` command filter);
`tools/invariant-field-v2/calibrate.ts` copies a contract to a private
temporary directory before it plants rot.

**Impossible if true:** A tracked contract or lattice file changed by starting
the server, building the store, or running the calibration.

**Verification:** `grep -n "readOnlyCommand" tools/invariant-field-v2/RepositoryHistory.ts`

**Status:** established

**Last refined:** 2026-07-31

### Rank depends only on the contract set and its history

**Invariant:** If two runs see the same commit range and the same contract
text, then every historical snapshot they produce carries the same rank and
the same radius for the same record.

**Scope:** Every snapshot except the current one. The current snapshot also
executes the bounded verification commands, so it additionally observes the
working tree — that arm is named in
[a bounded read is the only verification the instrument runs](invariant-field.invariants.md#a-bounded-read-is-the-only-verification-the-instrument-runs).

**Renegotiable at:** the invariant contract schema in
`.claude/skills/invariants/` — the schema decides which fields exist, and the
rank reads those fields. A schema change changes what rank can depend on.

**Mechanism:** `calculateRank` is a pure function of its `RankInput`. Every
component of that input is derived from parsed contract text, from lattice
links, from annotation counts, and from commit timestamps. No component reads
a clock, a random source, or a machine-local path.

**Generates:** A store that is rebuilt only when HEAD moves; a timeline that
can be replayed; the ability to compare two checkouts by comparing radii.

**Evidence:** `tools/invariant-field-v2/Rank.ts` (`calculateRank` signature and
body); `tools/invariant-field-v2/RepositoryHistory.ts` (`buildSnapshot`);
`tools/invariant-field-v2/Rank.test.ts`.

**Impossible if true:** Two builds of the same commit range that disagree
about a historical record's radius.

**Verification:** `bun test tools/invariant-field-v2/Rank.test.ts`

**Status:** established

**Last refined:** 2026-07-31

## Chosen invariants

### The rank weights are normalized and sum to one

**Invariant:** If every rank component is clamped to the zero-to-one range and
the ten weights sum to one, then the weighted depth is itself in the
zero-to-one range before rot is subtracted.

**Scope:** `RANK_WEIGHTS` and every component `calculateRank` produces.

**Mechanism:** Each component is a ratio, a flag, or a clamped value, so none
exceeds one. The weights are a partition of one, so the weighted sum is a
convex combination and cannot leave the range its parts occupy.

**Generates:** A rank that reads as a fraction of possible depth; a formula
panel that can show each component's share; the ability to add a component
only by taking weight from the others.

**Rejected alternatives:** Free weights with a normalization at the end — the
displayed weight would then not be the weight, and no reader could predict the
effect of a change.

**Evidence:** `tools/invariant-field-v2/Rank.ts` (`RANK_WEIGHTS`);
`tools/invariant-field-v2/Rank.test.ts` sums the weights.

**Impossible if true:** A reported rank above one or below zero, or a weight
table whose sum differs from one by more than floating-point error.

**Verification:** `grep -n "RANK_WEIGHTS" tools/invariant-field-v2/Rank.test.ts`

**Status:** established

**Last refined:** 2026-07-31

### Rot moves a record outward only

**Invariant:** If a contract collects orphaned annotations, then every record
in that contract moves away from R and none moves toward it.

**Scope:** The `rotPenalty` component and the orphan pressure that feeds it.

**Mechanism:** Orphan pressure enters the rank as a clamped positive penalty
that is subtracted from the weighted depth. Subtraction cannot raise depth, and
the radius decreases monotonically with depth, so a penalty can only increase
the radius.

**Generates:** The planted-rot calibration arm; the orange outward tick in the
field; the rule that decay is visible as motion away from reality.

**Evidence:** `tools/invariant-field-v2/Rank.ts` (`rotPenalty`, `rank`
subtraction); `tools/invariant-field-v2/calibrate.ts` plants rot and asserts
the radius grew.

**Impossible if true:** A record whose radius falls after its contract gains an
orphaned annotation.

**Verification:** `bun tools/invariant-field-v2/calibrate.ts`

**Status:** established

**Last refined:** 2026-07-31

### One focus fold serves every surface

**Invariant:** If a search, kind, contract, or composition focus is active,
then the rail, the field, and the lens all read the same focused record set,
and no surface computes a second one.

**Scope:** `InvariantFieldApp.focusedRecords` and its consumers: `RecordList`,
`FieldView`, and the record lens.

**Mechanism:** The application owns the four focus cells and folds them once
into `focusedRecords`. `RecordList` receives that array as a property and
`FieldView` receives the matching identifier set. Neither holds a filter cell
of its own, so a second fold has nowhere to live.

**Generates:** Field marks that mute exactly when the rail rows disappear; the
focus chips that name the active focus in one place; the instrument's own
domain focus.

**Rejected alternatives:** A private filter in the record list, with the field
showing every record — the two surfaces then disagree about what is being
looked at, and the disagreement is invisible.

**Evidence:** `tools/invariant-field-v2/ui/InvariantFieldApp.ts`
(`focusedRecords`, `focusedRecordIdentifiers`);
`tools/invariant-field-v2/ui/RecordList.ts` holds no filter state;
`tools/invariant-field-v2/ui/InvariantFieldApp.test.ts`.

**Impossible if true:** A record row visible in the rail whose field mark is
muted, or a lit field mark with no matching rail row.

**Verification:** `grep -n "focusedRecordIdentifiers" tools/invariant-field-v2/ui/FieldView.ts`

**Status:** established

**Last refined:** 2026-07-31

### Both field views place a record at the same radius

**Invariant:** If a record is drawn in the exact 2D view and in the
constrained 3D view, then its distance from R is the same in both.

**Scope:** `FieldView.fieldDots` and every consumer of it, including the
three-dimensional point positions and the projected overlay labels.

**Mechanism:** Both views read one `fieldDots` fold. The 3D position is the 2D
point translated into scene coordinates, with depth applied on the third axis
only. Camera pitch and yaw are bounded and never scale the base plane.

**Generates:** The claim that 3D is an exploration view and not a second data
model; the rule that the 3D view must still name R and the domain sectors;
the "radius is rank" readout shown in both modes.

**Evidence:** `tools/invariant-field-v2/ui/FieldView.ts`
(`fieldDots`, `threeDimensionalPosition`, `addThreeDimensionalRecords`);
`tools/invariant-field-v2/ui/FieldView.test.ts`.

**Impossible if true:** A record whose 2D radius and 3D radius differ, or a 3D
view that omits R while the 2D view shows it.

**Verification:** `grep -n "threeDimensionalPosition" tools/invariant-field-v2/ui/FieldView.ts`

**Status:** established

**Last refined:** 2026-07-31

### Design tokens are the only source of colour and timing

**Invariant:** If the stylesheet sets a colour or a duration, then it reads a
custom property that `DesignTokens` published, and it names no literal colour
and no literal duration.

**Scope:** `tools/invariant-field-v2/styles.css` and the `:root` block the
server generates from `DesignTokens.VALUES`.

**Mechanism:** The server concatenates the generated token block with the
stylesheet before serving. A literal value in the stylesheet would be reachable
without the token, so the token would stop being the source. Keeping the
stylesheet free of literals leaves exactly one place a colour or a duration can
be changed.

**Generates:** A palette that can be retuned in one file; timings that match
the interaction specification by construction; a design language that survives
a new surface.

**Rejected alternatives:** A second token file beside the mockup — two token
sources drift, and the drift is invisible until a screenshot disagrees with the
app.

**Evidence:** `tools/invariant-field-v2/DesignTokens.ts` (`VALUES`,
`stylesheet`); `tools/invariant-field-v2/DesignTokens.test.ts`;
`tools/invariant-field-v2/server.ts` concatenates both;
`tools/invariant-field-v2/Instrument.test.ts` guards the absence of literals.

**Impossible if true:** A hexadecimal colour, an `rgb(` literal with numeric
channels, or a millisecond literal inside `styles.css`.

**Verification:** `bun test tools/invariant-field-v2/Instrument.test.ts`

**Status:** established

**Last refined:** 2026-07-31

### A bounded read is the only verification the instrument runs

**Invariant:** If a record's Verification field names a command, then the
instrument executes it only when it is a single `grep` or `rg` invocation with
no pipe, no redirection, no command substitution, and no separator, and only
against the current checkout.

**Scope:** `verificationMode` in the scanner, and the `/api/code` endpoint that
serves source for the code lens.

**Mechanism:** The command is matched against a read-only pattern before it
runs, and it runs with a two-second timeout. Historical snapshots are never
executed, because running today's checkout against an old record would report a
result that never happened. The code endpoint resolves every requested path
against the repository root and refuses anything outside it.

**Generates:** The `executed-pass`, `executed-fail`, and `citation-only`
verification marks; the honest half-rim for a record the instrument only cites;
the 403 answer for a path outside the root.

**Rejected alternatives:** Run each record's full Verification command — the
instrument would become an arbitrary command runner driven by file contents.

**Evidence:** `tools/invariant-field-v2/RepositoryHistory.ts`
(`verificationMode`); `tools/invariant-field-v2/CodeLens.ts` path resolution;
`tools/invariant-field-v2/CodeLens.test.ts`.

**Impossible if true:** A shell pipeline executed from a contract file, or a
successful `/api/code` read of a path above the repository root.

**Verification:** `grep -n "timeout: 2_000" tools/invariant-field-v2/RepositoryHistory.ts`

**Status:** established

**Last refined:** 2026-07-31

### An idle instrument does no work

**Invariant:** If no data changed and no input arrived, then the server runs no
timer and the field requests no animation frame.

**Scope:** The server process and the field's animation path.

**Mechanism:** The server builds the store once at startup and holds no watcher
and no interval. The field requests frames only inside a snapshot transition,
and the request chain stops when the transition progress reaches one. The
resting field is static markup and a static canvas.

**Generates:** A tool that can stay open beside the editor; a field that is
quiet at rest, as the design language requires; a timeline whose motion is
evidence of a change rather than decoration.

**Rejected alternatives:** A polling rebuild — the store would change under the
reader, and the timeline position would move without a user action.

**Evidence:** `tools/invariant-field-v2/server.ts` (no `setInterval`, no
watcher); `tools/invariant-field-v2/ui/FieldView.ts`
(`animateThreeDimensionalTransition` stops at progress one);
`tools/invariant-field-v2/Instrument.test.ts` guards the absence.

**Impossible if true:** A running frame request, timer, or file watcher while
the field is at rest.

**Verification:** `bun test tools/invariant-field-v2/Instrument.test.ts`

**Status:** provisional

**Last refined:** 2026-07-31

### A renamed record keeps its identity

**Invariant:** If a record's heading changes but its body stays substantially
the same, then the timeline shows one moving record rather than a death and a
birth.

**Scope:** `assignStableIdentities` and every snapshot the store builds.

**Mechanism:** Records first match by contract path and name. Every unmatched
record is then compared against the unmatched records of the previous snapshot
by a token similarity of its semantic fingerprint. A match is accepted only
above a similarity floor and only when it is clearly ahead of the runner-up, so
an ambiguous pair produces a new identity instead of a wrong one.

**Generates:** A history that survives the rename ripple the contract skill
requires; an age and a change count that mean something across renames; the
stable dot the lens links to.

**Rejected alternatives:** Key identity on the heading alone — every rename
would then read as a record dying and an unrelated one being born.

**Evidence:** `tools/invariant-field-v2/RepositoryHistory.ts`
(`assignStableIdentities`); `tools/invariant-field-v2/TimelinePlayout.test.ts`.

**Impossible if true:** A pure rename that produces both a removal event and a
birth event in the same transition.

**Verification:** `grep -n "assignStableIdentities" tools/invariant-field-v2/RepositoryHistory.ts`

**Status:** established

**Last refined:** 2026-07-31
