# READY — #365 (gate scratch paths are machine-global)

Commit: `c479610e32d0e5784b793f8d8baa6f68a919498b`

Final hook gate: `GATE_EXIT=0`, 3m58s.

The worktree is clean. I did not push or land the branch.

## Result

Concurrent gates in different worktrees no longer share a failure pointer or
binary output.

[The merge gate](../../../../scripts/merge-gate.sh) now hashes the absolute
worktree path. It uses the first 16 hash characters as the namespace.

- Stable failure pointer:
  `/tmp/merge-gate-failures.<worktree-hash>`
- Per-run failure directory:
  `/tmp/merge-gate-failures.<worktree-hash>.<pid>`
- Per-run binary:
  `/tmp/merge-gate-binary-build.<worktree-hash>.<pid>/iv`

The binary path includes both worktree and run identity. The exit trap removes
that run's binary directory. Failure evidence remains available.

The old machine-wide failure pointer had no executable consumer. Searches
found only human prose and historical evidence. I removed the machine-wide
pointer instead of keeping a second source of truth.

Run this command inside any worktree:

```bash
bash scripts/merge-gate.sh --print-scratch-paths
```

It prints that worktree's stable failure pointer and the current process
paths. [Project tools](../../../../project.tools.md) now documents the command.
[The live delegation note](../../../../project.delegation-log.md) uses it too.

I did not rewrite historical task reports, dispatch records, or archive
entries. Their old path text describes the path that existed during those
runs. No skill text named either old path.

## `/tmp` census

I reused
[#90's shared mutable path census](../../completed/90-harness-diagnostic-provenance-guard/census-90-shared-mutable-paths.ts).
Its self-test passed all ten controls before both censuses.

| census | before | after |
|---|---:|---:|
| scanned files | 806 | 806 |
| fixed `/tmp` paths | 17 | 15 |
| fixed names without a disk verb | 79 | 79 |
| repository-relative artifacts | 3 | 3 |
| repository-relative history | 1 | 1 |
| fixed network ports | 0 | 0 |
| total shared expressions | 100 | 98 |

The two removed hits were the two task targets. The remaining three
`merge-gate.sh` fixed-path hits are `/tmp/tui-` and `/tmp/tui-demo` process
match strings. The gate does not write those strings as paths.

The census found no other writable, machine-global gate scratch path. Existing
step, report, duration, summary, result, and retry files contain `$$`.
The PID file already contains the worktree-root slug.

## Concurrent and single-worktree proof

The new `--scratch-path-namespace-self-test` runs two probes concurrently.
Each probe receives a distinct worktree root identity.

The first probe writes these markers:

```text
first-worktree-binary
first-worktree-planted-failure
```

The second writes these markers:

```text
second-worktree-binary
second-worktree-clean-run
```

The test requires distinct stable pointers, failure directories, and binary
paths. Each stable pointer must resolve to its own failure directory. Each
reader must find only its own marker.

The test then plants the first failure and binary markers in the second
probe's paths. Both foreign-content detectors must report the plant. The test
removes the controls and restores the second binary.

A third, non-concurrent probe reads its binary and failure through its own
reported paths. This proves the normal single-worktree discovery path.

Final targeted output:

```text
scratch-path namespace self-test: concurrent worktrees kept distinct failure logs and binaries
scratch-path namespace self-test: foreign failure and binary detectors passed both polarities
scratch-path namespace self-test: one worktree resolved its stable failure path
```

The final hook also compiled the real binary at the new path:

```text
OK    binary build (bun run build compiles)
```

### Planted namespace defect

I replaced the worktree hash with one fixed value. The same test went red:

```text
scratch-path namespace self-test: FAIL concurrent worktree isolation
first probe exit: 0
second probe exit: 0
PLANTED_NAMESPACE_EXIT=1
```

I removed the plant. The targeted test and final hook step returned green.

## Gate chain

No gate used `SKIP_GATE`.

The first commit hook ended after 6m51s:

```text
merge-gate: FAILURES — commit/merge BLOCKED
merge-gate: this run's failure logs: /tmp/merge-gate-failures.dfaa98e47b5819bd.889278
GATE_EXIT=1
```

The only blocking red was
[#359 (panel-split agent-terminal order intermittent)](../../active/359-panel-split-agent-terminal-order-intermittent/task-359-panel-split-agent-terminal-order-intermittent.md).
Both built-in attempts timed out on the recorded `agent,terminal` order.

I changed no code after that hook. The next required commit hook ran the same
tree. Panel split passed, and the hook ended:

```text
merge-gate: ALL-PASS
GATE_EXIT=0
pre-commit: merge-gate GREEN — commit allowed.
```

The final retry tally contained one known class:
[#214 (panel-chrome agent-close intermittent)](../../active/214-panel-chrome-agent-close-intermittent/task-214-panel-chrome-agent-close-intermittent.md).
It passed on its built-in retry. All other blocking steps passed directly.

## Invariants answered

Scope came from the changed gate, its two `Completion is proven not declared`
annotations, and contract terms about parallel gates. Literal searches found
no contract that names either old path.

| record | verdict | evidence |
|---|---|---|
| [Completion is proven not declared](../../../../project.invariants.md#completion-is-proven-not-declared) | strengthened | The always-run gate now executes the concurrent namespace self-test. Its planted fixed-hash defect exits 1. |
| [Blocking gate verdicts use ordering and counts](../../../../scripts/harness/harness.invariants.md#blocking-gate-verdicts-use-ordering-and-counts) | upheld | The new verdict uses path identity and exact content. It uses no elapsed-time threshold. |
| [Soft duration reports use a machine-wide quiet lock](../../../../scripts/harness/harness.invariants.md#soft-duration-reports-use-a-machine-wide-quiet-lock) | upheld | The change adds no lock or wait. Blocking gates remain parallel. |
| [Harness app homes are complete and isolated](../../../../scripts/harness/harness.invariants.md#harness-app-homes-are-complete-and-isolated) | untouched | Its scope is app homes and diagnostic logs. Gate build and failure artifacts stay outside it. |

The retry tally has no separate invariant record. Its
`.perf-history/gate-retries.ndjson` path remains per worktree and
report-only. No quiet-lock or retry-tally record was missed.

Mechanical checks resolved 1,220 annotations and 223 lattice links with zero
problems. Semantic verdict: PASS.

## Bycatch

- KNOWN:
  [#359 (panel-split agent-terminal order intermittent)](../../active/359-panel-split-agent-terminal-order-intermittent/task-359-panel-split-agent-terminal-order-intermittent.md)
  failed both attempts in the first hook. The final hook passed it directly.
- KNOWN:
  [#214 (panel-chrome agent-close intermittent)](../../active/214-panel-chrome-agent-close-intermittent/task-214-panel-chrome-agent-close-intermittent.md)
  passed only on retry in both hooks.
- KNOWN RESIDUAL:
  the first hook's behavioral-contract retry timed out on the structure
  scrollbar geometry in the plugin-manifest drive. The final hook passed it
  directly. This matches
  [#364 (plugin-manifest residual wait weaknesses)](../../active/364-plugin-manifest-residual-wait-weaknesses/task-364-plugin-manifest-residual-wait-weaknesses.md)
  and the earlier
  [#337 (plugin-manifest structure-scrollbar intermittent)](../../completed/337-plugin-manifest-structure-scrollbar-intermittent/task-337-plugin-manifest-structure-scrollbar-intermittent.md).
- CONTRACT GAP: the gate contract layer has no record that writable scratch
  artifacts carry worktree or run identity. This change enforces that rule,
  but the `invariants` skill keeps contract edits propose-only. A later
  contract task can add “Gate scratch writers carry local identity” to
  [the harness contract](../../../../scripts/harness/harness.invariants.md).

No other bycatch was observed.
