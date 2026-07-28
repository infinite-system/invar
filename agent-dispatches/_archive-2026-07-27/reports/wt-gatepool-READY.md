# READY — Parallel smoke pool and serial quiet tail

Tip: `2ee70ae35b32c5ae04e2ff020115a583c5557153`

Commit: `2ee70ae parallelize timing-safe gate smokes`

Worktree: clean. `TASK.md` was not committed.

## Result

- Before: 8m03s serial baseline.
- After: 6m23s full all-instruments gate, exit 0.
- Improvement: 1m40s (20.7%).
- Final phase times: parallel-safe 0m54s for 33 jobs; quiet-serial 5m18s; total 6m23s.
- Worker count chosen/defaulted: 6, configurable with `INVAR_GATE_WORKERS`.
- Tuning evidence: the first 6-worker run was green with a 0m49s pool. The 8-worker trial took
  1m11s and `workspace tabs harness` failed after its retry. Six is the measured sweet spot on this
  machine; eight was both slower and unstable.

The final gate log is `/tmp/wt-gatepool-final-clean.log`. It includes two recovered timeout retries
in the final `RETRY TALLY`, an `ALL-PASS` verdict, and the phase/total timings above.

## Quiet-serial classification

Derived by grepping registered sources for
`assertNoCompleteFrameEmittedFor|awaitFrameSilence|[Mm]omentum|glide`.

Always registered in the quiet tail:

1. `behavioral-contracts (felt invariants)`
2. `smoke: editor harness`
3. `smoke: horizontal extent harness`
4. `smoke: find harness`
5. `smoke: word-delete harness`
6. `smoke: clipboard frame boundary harness`
7. `smoke: git-blame harness`
8. `smoke: git-watch harness`
9. `smoke: tree-scroll harness`
10. `smoke: panel-chrome harness`
11. `smoke: agent harness`
12. `smoke: agent-pane-ux harness`
13. `smoke: agent-engine-switch harness`
14. `smoke: agent-permissions harness`
15. `smoke: agent-search harness`
16. `smoke: audio-narration harness`
17. `smoke: hover harness`
18. `smoke: terminal harness`
19. `smoke: terminal follow harness`
20. `smoke: markdown harness`
21. `smoke: settings-applied harness`
22. `input byte flush latency (5-session median)`
23. `perf-baselines (memory/CPU/latency)`

Additional quiet jobs when `INVAR_FULL_TMUX=1`:

24. `smoke: agent-pane-ux`
25. `settings applied-effect (all schema fields driven)`

Every other registered smoke is explicitly tagged `parallel_safe_smoke` or
`parallel_safe_full_tmux_smoke`. The gate also rejects a parallel-safe source if the grep markers
above appear in it.

## Failure and load proofs

- Deliberate failure: temporarily guarded `smoke-move-line-harness.ts` to emit a timeout-class
  failure, then ran the full smoke registry. The gate exited 1, retried the job once after 10s,
  preserved both full logs, printed its tail excerpt, ran all 53 other registered jobs, and reported
  the retry tally. Evidence: `/tmp/wt-gatepool-deliberate-loaded.log`,
  `/tmp/merge-gate-failures.376615/smoke-move-line-harness-.attempt1.log`, and
  `/tmp/merge-gate-failures.376615/smoke-move-line-harness-.log`. The injection was removed before
  commit.
- Loaded quiet tail: the same run kept six `yes` CPU burners active on this 16-core machine.
  All 21 registered quiet jobs and the hard input-byte-flush measurement passed. One quiet job
  needed its permitted isolated retry and recovered. Quiet phase: 4m22s under load.
- Full instruments: final tip gate exit 0; conventions/tsc, invariant structure and references,
  unit tests, all 54 registered jobs, hard input-byte latency, and soft performance instruments all
  ran. The invariant checker reported 669 annotations resolved, 41 lattice links resolved, and
  0 problems.

The per-run failure directory remains unique, every pooled job has a unique step/result/summary log,
timeout retries occupy their existing pool slot, failures do not stop later jobs, and performance
history remains a one-call `appendFileSync` NDJSON append in the serial tail.
