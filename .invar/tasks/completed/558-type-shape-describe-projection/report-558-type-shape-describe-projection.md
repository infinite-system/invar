# READY — 558 type shape describe projection

## In plain words

The graph can now describe its own shapes: ask about a path or a type
and it answers which fields exist, their types, and where they live —
generated from the TypeScript compiler, so it cannot lie or rot. An
agent learns argument shapes from the graph instead of reading source.

## Delivered

- generate-shapes.ts: TS-compiler walk of iv-harness sources ->
  shapes.generated.json (23 interfaces with members/types/optionality,
  10 classes with public static method signatures). Generated, never
  authored.
- No-drift mechanically: colocated test regenerates and structurally
  diffs vs the committed catalog — the gate inherits the check through
  bun test with zero new wiring.
- describe <type-or-path> (CLI + GET /describe); authored path->type
  bindings for graph domains; misses list every describable name.

## Invariants in scope (answered)

- One authority, many projections (the paper's rule, honored): the
  compiler is the authority; the catalog is a regenerable projection.
- The harness graph never imports from the app: upheld.

## Verification

- 49 tests incl. the regenerate-and-diff no-drift arm and the
  undescribable-loud arm. Driven: describe tasks.all -> TaskNode
  members; describe HarnessVerbs -> run signature; miss lists
  describables. Gate GREEN first run (GATE_EXIT=0, /tmp/gate-558.log).

## Bycatch

- Prettier reformats the generated json at pre-commit — byte-diff
  no-drift checks are unstable by construction; structural comparison
  is the right form (encoded in the test comment).
