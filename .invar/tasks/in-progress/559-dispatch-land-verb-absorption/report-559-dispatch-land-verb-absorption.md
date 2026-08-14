# READY — 559 the verb contract rung 1

## In plain words

The fleet's tools can now be called through the graph, not just read
by it. `run probe.selfTest` executes the real probe script and returns
structured results; every run leaves one typed line in a ledger the
graph can count. Wrong names teach the registry. The riskiest verb
(landing) waits for rung 2 on purpose.

## Delivered

- verbs module: registry of wrap faces (probe.selfTest/builders/gate,
  dispatch.dry with DRY_RUN passthrough) — logic stays in the scripts;
  structured VerbResult; absent script = absent capability.
- Run channel: CLI `run <verb> [args]` + server POST /run; unknown
  verb lists the registry.
- Event ledger: .invar/harness-events.jsonl (gitignored telemetry),
  one typed line per run; graph reads it at `events`.
- Graph: `verbs` + `events` domains in rootNamespace.

## Invariants in scope (answered)

- A wrapped script keeps its logic in one place: upheld — faces
  execute scripts, never reimplement guards (dispatch.dry's refusal
  text arrives as data, produced by dispatch.sh itself).
- Only the files arbitrate process state: upheld — the ledger is a
  file; graph reads re-derive.

## Verification

- 45 tests (6 verbs tests incl. failing-script arm, unknown-verb arm,
  absent-script arm, malformed-ledger-line arm).
- Driven cold AND attached on the real repo: probe.selfTest through
  the graph (real probe.sh, both-arms PASS lines), dispatch.dry's
  worktree-guard refusal structured, ledger counted via server, clean
  stop.
- Gate r1 red: TWO REAL bugs (mine) — VERB_REGISTRY naming (derived
  getter with functions must not be SCREAMING) and appendEvent ENOENT
  without .invar/. Fixed; r2 GREEN (GATE_EXIT=0, /tmp/gate-559-r2.log).

## Bycatch

None beyond the in-branch fixes.
