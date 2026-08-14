# 557 — graph miss did you mean

Priority: user-directed
State: COMPLETED — 050eebdf — Graph misses now suggest the intended key: get tasks.count answers Did you mean tasks.counts, copy-ready full path.
Engine: claude
Environment: linux
Model: fable-5
Effort: medium
Assignment note: conductor self-do — user ask 2026-08-14 ("get
tasks.count should recommend: did you mean tasks.counts? like iv graph").

## In plain words

When an agent asks the graph for a path that does not exist but is
CLOSE to one that does (tasks.count vs tasks.counts), the error should
suggest the near-miss, the way the app graph does. Misses become
teachers with one obvious next step.

## The deliverable, twice

CODE: HarnessGraph.missMessage gains a did-you-mean (edit distance +
prefix match on the failing segment); tests for suggest and no-suggest
arms; works identically attached and cold.
VISUAL: `bun iv-harness/cli.ts get tasks.count` prints
"no node at 'tasks.count'. Did you mean 'tasks.counts'? ..." on stderr.

## Invariants in scope

- iv-harness.invariants.md — all records; no new record needed (this
  refines the existing miss behavior, no store or arrow change).

## Bycatch expected

Report per AGENTS.md taxonomy, even when None observed.
