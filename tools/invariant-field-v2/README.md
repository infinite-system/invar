# Invariable representation instrument (Invariance Field v2)

The Invariance Field is a standalone development instrument. It reads every
contract and lattice snapshot in Git history, ranks each record by its
evidence, and draws the result as distance from reality. It does not join the
Invar runtime.

It also measures itself. Its own contract lives beside this file
(`invariant-field.invariants.md` and `invariant-field.lattice.md`), the
scanner reads it like any other, and the rail carries a `Measure the instrument` control that
focuses the instrument's own records and rewinds the timeline to the snapshot
that first carried them.

The frontend uses Vue 3 single-file components with
`<script setup lang="ts">`. Each template has one ivue class as its logic
owner. The setup block only imports, constructs, and exposes reactive cells.

## Toolchain

Run the tool from the repository root:

```sh
bun tools/invariant-field-v2/server.ts
```

Open `http://localhost:4314/`. Add `--port=4400` to select another port. Add
`--host=0.0.0.0` to select another host. Add `--rebuild` to rebuild the
history store even when the stored HEAD matches. The v1 tool keeps port 4313,
so both tools can run together.

The server calls `Bun.build()` once at startup. The local
[`VueSingleFileComponentPlugin`](VueSingleFileComponentPlugin.ts) compiles
`.vue` imports with `@vue/compiler-sfc` and keeps all build output in memory.
This choice adds no Vite process, watcher, timer, or generated bundle
directory. One command still starts the complete tool.

Build the ignored JSON store without starting the server:

```sh
bun tools/invariant-field-v2/build-data.ts
```

## The release gate

One command must pass before the tool is released:

```sh
bash tools/invariant-field-v2/release-gate.sh
```

It runs the types, the unit tests (parser parity against the canonical checker,
rank determinism and range, playout, code lens, tokens, and the absence
guards), the instrument's own contract and annotation checks, the stylesheet
census, the planted-rot calibration, and then ONE driven smoke in real
Chromium. The smoke recomputes every record's rank and radius from the
published weights, measures the drawn 2D marks against those radii, checks that
the rail and the field agree about the focused set, and confirms the instrument
appears in its own field with a birth marker on the timeline. It also proves it
can go red: the same comparison is run against a perturbed weight table and
must fail.

The last line is `RELEASE-GATE PASS` or `RELEASE-GATE FAIL` with the failure
count. The gate uses port 4319; set `FIELD_RELEASE_GATE_PORT` to change it.

This is not a second merge gate. The repository's conventions gate and merge
gate still cover this tree.

Run the individual checks:

```sh
bun test tools/invariant-field-v2
bunx vue-tsc --noEmit -p tools/invariant-field-v2/tsconfig.json
bun tools/invariant-field-v2/calibrate.ts
bun tools/invariant-field-v2/check-stylesheet.ts
```

## Design tokens

[`DesignTokens`](DesignTokens.ts) is the source of truth for color, spacing,
type, and radius tokens. The server turns its typed values into the `:root`
CSS custom-property block. [`styles.css`](styles.css) consumes those
properties and holds only component layout and presentation rules.

No stylesheet rule may name a literal colour or duration, and no rule may be
unreachable or silently overridden. `check-stylesheet.ts` enforces both.

The parser adapts the record, slug, inert-content, link, and annotation rules
from the canonical
[`check_invariants.mjs`](../../.claude/skills/invariants/scripts/check_invariants.mjs).
The parity test compares both parsers against the current contract set.

## How to read the field

R is reality at the center. It is an asymptote. The displayed radius is
`0.10 + 0.90 × e^(-2.5 × depth)`, so no record reaches R. The field has eight
stable domain sectors. Domain sets color. The diamond, open hexagon, and circle
silhouettes distinguish absolute, renegotiable, and chosen reality. Radius
alone carries rank.

The field opens in a constrained three-dimensional view. Use 2D for the exact
plan projection. Both views use the same radius and angle, and both name R and
the eight domain sectors. Each sector label names the contract domains that
hash into that hue slot. A secondary-pointer
drag changes only the camera yaw and pitch. Use 2, 3, and 0 to select 2D, select
3D, and reset the camera. Reduced-motion environments stay in 2D.

Depth combines kind, falsifiability, resolved evidence, verification mode,
status, generativity, guarded simplicity, connection density, annotation
coverage, and survival. Orphan annotations apply outward pressure. Open the
formula panel or a record calculation to inspect every input and weight.
The current snapshot executes bounded `grep` and `rg` verification commands.
Historical and broader commands stay citation-only because running them
against the current checkout would give a false result.

The rail on the left holds one focus. Search, kind, contract, and composition
all fold into one focused record set, so the rail rows and the lit field marks
are always the same records. Anything outside the focus stays visible but
muted.

The time control switches among every commit that touched a contract or
lattice. A gold marker on the track is the instrument's own birth. Play advances on the client and shows birth, removal, inward,
outward, and rot events between snapshots. A URL such as `?snapshot=0` opens a
specific snapshot. A lattice composition filters the list and lights its
records together.
