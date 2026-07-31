# READY — Field v2 foundation: Vue SFC toolchain, ivue, and strict conventions

## Outcome

The work in the [field v2 foundation brief](brief-415-2-field-v2-foundation-vue-sfc.md)
is complete.

The new `tools/invariant-field-v2/` starts from the complete v1 tool. It keeps
the existing field, record list, accordions, history timeline, and composition
lighting. The five UI owners now use Vue 3 TypeScript SFCs:
`InvariantFieldApp`, `HistoryTimeline`, `FieldView`, `RankDisplay`, and
`RecordList`. Each setup block only wires its ivue owner to its template.

V1 remains byte-untouched in Git. Both versions ran side by side and returned
HTTP 200. V1 uses port 4313. V2 uses port 4314.

## Commit

Commit `f0041c6d` contains the complete change:
`build field v2 Vue SFC foundation (#415)`.

The worktree is clean. I did not push, merge, tag, or delete a branch.

## Toolchain decision

The v2 server calls `Bun.build()` once during startup. A local Bun plugin uses
`@vue/compiler-sfc` to compile `.vue` imports in memory. This keeps the
development loop to one command:

```sh
bun tools/invariant-field-v2/server.ts
```

The tool does not need Vite, a second process, a watcher, a timer, or a
generated JavaScript bundle. `vue-tsc` checks the complete SFC graph, including
template bindings. A known-bad template proves that this check can fail for a
missing binding.

The parser source is byte-identical to v1. Parser citations in the cloned test
point to v2. Parser and canonical checker parity remains green.

## Design-token seam

`DesignTokens.ts` owns 86 typed values. They cover all colors, spacing, type,
line height, letter spacing, font weight, and radii used by the component
stylesheet. The server generates the `:root` CSS custom properties from these
values. `styles.css` contains layout and presentation rules that consume the
properties.

The seam test first matches known-bad direct color and spacing literals. It
then proves that the real component stylesheet contains no direct design
values in the governed declarations.

## Verification

- The real Chromium drive passed at the latest snapshot. It rendered 377 field
  dots and 377 record cards. It opened 12 record fields and 10 calculation
  rows. Composition selection lit 5 dots, muted 372 dots, and filtered the
  list to 5 cards. Timeline input moved from snapshot 307 to 306.

- The same drive passed at snapshot 0. It rendered 22 field dots and 22 record
  cards. It opened 10 record fields and 10 calculation rows. Composition
  selection lit 5 dots, muted 17 dots, and filtered the list to 5 cards.
  Timeline input moved from snapshot 0 to 1.

- V1 and v2 ran together. Each exposed 308 snapshots and 377 records at the
  latest snapshot.

- `bun test tools/invariant-field tools/invariant-field-v2` passed: 43 tests,
  0 failures, and 184 expectations. The v2-only run passed 26 tests and 147
  expectations.

- `vue-tsc` and root `tsc` passed. The Vue typecheck control failed with exit
  2 and named `missingTypecheckControlIdentifier`.

- The v2 file grammar passed for 14 governed TypeScript files with 0
  violations. A planted `private` member failed with
  `[private-modifier]`; removing it restored green.

- The static getter check passed across 796 files. Structural scans found 0
  calls to `setInterval`, `setTimeout`, or `watch` under v2.

- The invariant checker resolved 1,286 annotations and 231 lattice links with
  0 problems.

- The rank calibration moved the planted record radius from `0.245491` to
  `0.322264`. The outward movement was `0.076773`.

- The final commit-hook merge gate reported `GATE_EXIT=0`. All hard checks,
  66 parallel harness jobs, behavioral contracts, serial harnesses, and five
  input-order sessions passed. No step needed a retry. The first commit-hook
  pass exposed that the ignored v1 generated store was not in
  `.prettierignore`. The committed exclusion covers both generated store
  directories. The final gate was a clean green.

- `git diff --stat -- tools/invariant-field` produced no output.

## Invariant verdict

- Scanner writes remain limited to the ignored v2 generated store. Contract
  files remain read-only.

- [Cost tracks the actively observed set](../../../../project.invariants.md)
  remains upheld. The server builds once and starts no recurring observation.

- Parser behavior did not change. The parser source comparison and parity test
  both passed.

No invariant changed status.

## Bycatch

- **UNFIXED — dead v1 field selector.** The v1 stylesheet contains `#field`,
  but the rendered SVG has no `id="field"`. I saw this in the v1 browser
  baseline on port 4413 and reproduced it in the cloned v2 surface. A temporary
  v2 `id` made the SVG scale differ from the baseline, so I removed it and
  preserved parity. This selector needs a separate design decision.

- **GAP — no tool-local contract.** `tools/invariant-field-v2/` has no
  colocated `*.invariants.md` record or lattice. The root cost invariant and
  parser parity test govern parts of the tool, but no tool-local contract
  unifies its scanner, server, ranking, and UI promises.
