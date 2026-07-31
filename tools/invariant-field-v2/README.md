# Invariance Field v2

The Invariance Field is a standalone development instrument. It reads every
contract and lattice snapshot in Git history. It does not join the Invar
runtime.

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

Run the focused checks:

```sh
bun test tools/invariant-field-v2
bunx vue-tsc --noEmit -p tools/invariant-field-v2/tsconfig.json
bun tools/invariant-field-v2/calibrate.ts
```

## Design tokens

[`DesignTokens`](DesignTokens.ts) is the source of truth for color, spacing,
type, and radius tokens. The server turns its typed values into the `:root`
CSS custom-property block. [`styles.css`](styles.css) consumes those
properties and holds only component layout and presentation rules.

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
