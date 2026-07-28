# READY — capability boot guard #151

Commit: `047c49a5c577f02010b715bd5a3f3036b522a716`

## Result

Invar now checks the installed ivue runtime capability before
`AppLoader` begins application boot. It does not inspect a version string.
The check wraps a throwaway get-only `$` accessor with the installed
`Static()` and compares two reads by identity.

Failure refuses boot with the recomputation consequence, the `bun install`
remedy, and the documented emergency override
`INVAR_SKIP_CAPABILITY_CHECK=1`.

The same assertion is an always-run hard step in `scripts/merge-gate.sh`;
that step clears the override so CI cannot accidentally bypass its installed
resolution.

## Required positive control before implementation

Both legs used separate fresh scratch directories, explicit ivue pins, and
`vue@3.6.0-rc.1`. Each leg printed the version resolved from its own
installation before running the two-read probe.

| requested ivue | installed ivue | getter cache | probe exit |
|---|---|---|---|
| 2.1.0 | 2.1.0 | `false` | 1 |
| 2.2.1 | 2.2.1 | `true` | 0 |

Exact result lines:

```text
installed_ivue=2.1.0
getter_cache=false
probe_exit=1

installed_ivue=2.2.1
getter_cache=true
probe_exit=0
```

## Exact guard evidence

The checked-in guard file was copied unchanged into each real scratch
installation and invoked there.

ivue 2.1.0:

```text
exact_guard_requested=2.1.0 installed_ivue=2.1.0 version_exit=0 guard_exit=1
error: ivue Static() is not caching $-getters. Every cached table in this app would recompute on
every read. Your node_modules is out of date with package.json — run: bun install
To bypass this check, set: INVAR_SKIP_CAPABILITY_CHECK=1
```

ivue 2.2.1:

```text
exact_guard_requested=2.2.1 installed_ivue=2.2.1 version_exit=0 guard_exit=0
guard_output=<empty>
```

Escape hatch against the failing 2.1.0 installation:

```text
exact_bypass_installed_ivue=2.1.0 bypass_exit=0
bypass_output=<empty>
```

## Gate positive control

With the capability result temporarily planted to `false`, the exact gate
command produced:

```text
current_planted_gate_exit=1
error: ivue Static() is not caching $-getters. Every cached table in this app would recompute on
every read. Your node_modules is out of date with package.json — run: bun install
To bypass this check, set: INVAR_SKIP_CAPABILITY_CHECK=1
```

The plant was removed. The restored gate command produced:

```text
FINAL_GATE_STEP_EXIT=0
```

## Boot cost and driven verification

At the real AppLoader boundary, 25 fresh-process measurements of the entire
assertion were:

```text
minimum  0.059541 ms
median   0.071083 ms
maximum  0.086041 ms
```

A warm 10,000-check measurement averaged `0.001547 ms` per check. The added
boot cost is therefore about `0.071 ms`, below the requested 1 ms ceiling.

The existing in-app boot metric begins inside `Bootstrap`, after this guard,
so it cannot isolate the guard's cost. Its pre-change and guarded samples
overlapped (`206–227 ms` before; `205–232 ms` guarded), confirming no
downstream boot regression.

Real PTY drives:

- Default fixture: settled, `ready=true`, `renderQuiescent=true`.
- Shared 100,000-line fixture: exit 0, settled,
  `ready=true`, `renderQuiescent=true`,
  `bootDurationMilliseconds=239`.

## Verification

The final pass, after all edits:

```text
git diff --check                                              exit 0
bunx tsc --noEmit                                             exit 0
bun test                                                      exit 0
  1671 pass, 0 fail, 67515 expect() calls
bash scripts/conventions-gate.sh                              exit 0
node .claude/skills/invariants/scripts/check_invariants.mjs
  --all --refs                                                exit 0
  884 annotations resolved, 67 lattice links, 0 problems
bun scripts/check-coverage-ratchet.ts                         exit 0
  311 files inspected; no undeclared decrease
```

Per the task, `scripts/merge-gate.sh` was not run.

The worktree is clean. Nothing was pushed, merged, tagged, or deleted.

## Bycatch

None observed.
