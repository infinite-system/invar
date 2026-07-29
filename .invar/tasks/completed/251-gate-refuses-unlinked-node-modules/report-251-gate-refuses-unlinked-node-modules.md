# READY — the gate refuses missing dependency ground truth (#251)

Status: READY

Commit: `e9b2d3d5977f611904c8acfd1394cfa7426d11fa`

## Outcome

`scripts/merge-gate.sh` now runs a dependency preflight before all gate setup and steps.

The preflight checks three facts:

1. `node_modules` exists beside `bun.lock`.
2. `node_modules` is not empty.
3. The local `tsgo` and `typescript-language-server` provider links are executable.

The provider names live in one array. They match the binaries resolved by the real-provider harness smokes.

Missing dependency ground truth exits 3. The refusal names `bun install --frozen-lockfile` as the repair.

`--dependency-preflight` runs the guard alone. A healthy run is silent.

The gate header now states the dependency-ground-truth rule and exit code.

I did not change `scripts/harness/harness.invariants.md`. This rule governs every gate step, including formatting, tests, and contract checks. It belongs at the gate entry.

## Reproduction

I created the detached scratch worktree `/tmp/invar-251-before` at `c3bbdd00`.

I planted an empty `node_modules` with zero entries. Before the fix, the gate entered its provenance probe and wrote failure evidence:

```text
merge-gate: FAILURES — provenance probe
merge-gate: this run's failure logs: /tmp/invar-251-before-probe-log.2644652
merge-gate: stable failure logs resolve to /tmp/invar-251-before-probe-log.2644652
BEFORE_EXIT_CODE=1
```

The gate did not report missing dependencies.

## Verification

I did not run the full merge gate.

`bash -n scripts/merge-gate.sh` exited 0.

The empty scratch tree produced the repair refusal and exit 3:

```text
merge-gate: dependency preflight failed because node_modules is missing or empty.
merge-gate: dependency preflight failed because provider binaries are missing:
  node_modules/.bin/tsgo
  node_modules/.bin/typescript-language-server
Run: bun install --frozen-lockfile
EMPTY_EXIT_CODE=3
```

After `bun install --frozen-lockfile`, the same scratch tree passed silently:

```text
HEALTHY_OUTPUT_BYTES=0
HEALTHY_EXIT_CODE=0
```

The healthy tree's existing provenance failure kept its normal exit 1:

```text
merge-gate: FAILURES — provenance probe
merge-gate: this run's failure logs: /tmp/invar-251-final-wrong-reason.2651791
merge-gate: stable failure logs resolve to /tmp/invar-251-final-wrong-reason.2651791
WRONG_REASON_EXIT_CODE=1
```

`bunx prettier --check .` passed:

```text
Checking formatting...
All matched files use Prettier code style!
```

`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` exited 0:

```text
1027 annotation(s) resolved, 217 lattice link(s) resolved, 0 problem(s)
```

## Bycatch

- Guards-go-first violation, not fixed: `INVAR_GATE_WORKERS` validation is at `scripts/merge-gate.sh:407`. PID publication, orphan reaping, and failure-log publication occur at lines 279-338 first. An invalid worker value can cause those side effects before exit 2. I confirmed this by inspection and did not trigger the side-effecting path.

## Handoff

The branch is `fleet/251-gate-refuses-unlinked-node-modules`.

The worktree is clean after commit.

COMPACTION: none.

conventions @ `2e6c207555c2aeecd49d460e5d8ca3ed8ba030af`
