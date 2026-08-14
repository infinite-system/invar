# 562 — harness contributor seam

Priority: user-directed
State: ACTIVE
Engine: claude
Environment: linux
Model: fable-5
Effort: high

## In plain words

Let any project extend the graph with its own nodes (a Rust repo adds
cargo semantics) by dropping a small contributor file — without ever
touching iv-harness core, so core stays updateable.

## Scope seed (settled in discussion 2026-08-14)

- The app's two records transfer: the host graph is COMPLETE without
  contributors; a contributor mounts one authority under its own key.
- Contract surface: one narrow exported interface (name + node getter),
  contract-versioned; version skew warns loudly (the checker-skew
  rule). Extensions never import core internals.
- Mount = dynamic import of `.invar/harness/*.harness.ts` at graph
  construction; the plain-object resolver then gives contributed nodes
  ls/get/misses/did-you-mean/bounded-print/waitFor FOR FREE — the
  kernel needs zero per-extension knowledge.
- Props only at first; contributed VERBS wait for #559's harvested
  verb contract. The wrap rule binds contributors (parse your tool's
  output; never reimplement it). Trust = same as npm scripts; said
  plainly in docs.
- Gates need NO extension: any language's gate emits GATE_EXIT= into a
  registered log and the gates domain reads it today — the sentinel is
  the protocol; extensions add project semantics only.
