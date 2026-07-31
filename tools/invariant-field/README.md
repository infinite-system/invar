# Invariance Field

The Invariance Field is a standalone development instrument. It reads every
contract and lattice snapshot in Git history. It does not join the Invar
runtime.

The frontend is TypeScript. Bun's HTML import transpiles it when the server
receives the page request. There is no separate frontend build step.
`InvariantFieldApp`, `HistoryTimeline`, `FieldView`, `RecordList`, and
`RankDisplay` own the UI through ivue `Reactive` classes.

Run it from the repository root:

```sh
bun tools/invariant-field/server.ts
```

Open `http://localhost:4313/`. Add `--port=4400` to select another port. Add
`--rebuild` to rebuild the history store even when the stored HEAD matches.
The server has no watcher or timer. Stop it with Ctrl-C.

Build the ignored JSON store without starting the server:

```sh
bun tools/invariant-field/build-data.ts
```

Run its focused checks:

```sh
bun test tools/invariant-field
bun tools/invariant-field/calibrate.ts
```

The parser adapts the record, slug, inert-content, link, and annotation rules
from the canonical
[`check_invariants.mjs`](../../.claude/skills/invariants/scripts/check_invariants.mjs).
The parity test compares both parsers against the current contract set.

## How to read the field

R is reality at the center. It is an asymptote. The displayed radius is
`0.10 + 0.90 × e^(-2.5 × depth)`, so no record reaches R. Contract files form
angular sectors. Dot color shows record kind. Radius alone carries rank.

Depth combines kind, falsifiability, resolved evidence, verification mode,
status, generativity, guarded simplicity, connection density, annotation
coverage, and survival. Orphan annotations apply outward pressure. Open the
formula panel or a record calculation to inspect every input and weight.
The current snapshot executes bounded `grep` and `rg` verification commands.
Historical and broader commands stay citation-only because running them
against the current checkout would give a false result.

The time control switches among every commit that touched a contract or
lattice. A URL such as `?snapshot=0` opens a specific snapshot. A lattice
composition filters the list and lights its records together.
