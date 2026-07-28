# TASK — #151: assert the CAPABILITY at boot, not the dependency version

Work ONLY in `/tmp/conductor-capguard` (branch `feat-capability-boot-guard`, cut off latest main).
Do NOT run `scripts/merge-gate.sh`; do NOT push/merge/tag/delete. Report to
`/tmp/capguard-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`.

## Why this exists

On 2026-07-27 the ivue statics migration made Invar unusable for the user twice — 69.4% CPU,
493 MB RSS, 50 CPU-seconds in 73 seconds of life. Roughly three hours went into diagnosis
across six refuted hypotheses. The cause was not the code.

`package.json` was bumped to `ivue ^2.2.1` and all 55 hand-rolled
`Object.defineProperty(this, …)` caches were deleted, handing `$`-getter caching to `Static()`.
The conductor said "pull and restart" and never ran `bun install`. The user's `node_modules`
kept **ivue 2.1.0**, whose `Static()` is:

```js
if (typeof descriptor.value != "function") continue;   // methods ONLY — every $-getter skipped
```

The `$`-getter caching branch exists **only in 2.2.1**. So all 67 `$`-getters recomputed on every
read, forever — fresh `Map`s, `WeakMap`s and frozen arrays per access. Every symptom followed.

## The design — and why the obvious one is WRONG

**Do NOT compare the installed version against the `package.json` range or against `bun.lock`.**
That design was considered and rejected for a reason the user raised: versions are legitimately
flexible. `^2.2.1` may resolve to 2.3.0. More importantly the user develops ivue locally at
`/home/parallels/dev/ivue` — the moment it is `bun link`ed, the installed version string is
meaningless and a strict comparison would lock them out of their own editor.

**Assert the CAPABILITY the code actually depends on.** Measured, both legs, real installs:

| installed ivue | `$`-getter caching | probe exit |
|---|---|---|
| 2.1.0 | **false** — `Static()` ignores getters | 1 |
| 2.2.1 | true | 0 |

The probe that produced that table:

```ts
import { Static } from 'ivue/extras';
class $Canary { static get $TABLE(): readonly number[] { return [1, 2, 3]; } }
const Canary = Static($Canary);
const cachesGetters = (Canary as any).$TABLE === (Canary as any).$TABLE;
```

Two property reads. Version-agnostic, matcher-free, works with any range and with a linked local
build. **Reproduce this table yourself before writing the guard** — a scratch directory with an
explicit `"ivue": "2.1.0"` pin plus `vue`, then the same probe. This is the positive control for
the whole feature; without it you have built something that cannot fail.

WARNING, learned the hard way in this session: my first attempt at that table ran BOTH legs
against the same installed ivue (a worktree whose `package.json` had been restored but whose
`node_modules` had not) and reported "caching present" twice. Verify the installed version inside
each leg and print it.

## What to build

1. **A boot guard**, checked once during startup, before any `$`-getter-dependent surface loads.
   On failure, refuse to boot and print the REMEDY, not the symptom:
   ```
   ivue Static() is not caching $-getters. Every cached table in this app would recompute on
   every read. Your node_modules is out of date with package.json — run: bun install
   ```
   Name the actual consequence; "version mismatch" is what a proxy check would say and it is not
   what the user needs to read.
2. **An escape hatch, documented in that message**: `INVAR_SKIP_CAPABILITY_CHECK=1`. A guard that
   can lock the user out of their editor must have a stated override — and if the guard itself is
   ever wrong, that is the difference between an annoyance and a brick.
3. **A gate step** running the same assertion, so CI cannot pass on a resolution the user's machine
   will not reproduce.
4. **Cost**: measure and report the added boot time. Two property reads should be unmeasurable;
   the repo's boot-to-ready is ~350 ms and `project.invariants.md` cares about it. If your
   implementation costs more than ~1 ms, you have built the wrong thing.

## Scope discipline

- **One capability, this one.** Do NOT build a general capability-registry framework. If a second
  capability ever needs guarding, the second instance earns the abstraction.
- Do NOT add a version comparison "as well" — it is the design that was rejected, it false-fails on
  linked builds, and it dilutes the failure message.
- The canary class is throwaway and lives with the guard. Do NOT reuse a real app class: a real
  class drags real imports into the boot path.

## Acceptance

- the two-leg table reproduced with the installed version printed per leg;
- guard passes on `main` as-is (ivue 2.2.1 installed);
- guard FAILS with the quoted message against a scratch 2.1.0 install — quote the exact output;
- `INVAR_SKIP_CAPABILITY_CHECK=1` bypasses it — quote that too;
- gate step present and green, plus its planted red;
- boot-time delta reported.

## Verification — quote exact exit codes, never read `$?` after a pipeline

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`,
`bun scripts/check-coverage-ratchet.ts`, plus a driven boot proving the app still starts.

Full descriptive identifier names, 80 columns, ivue conventions. Commit with
`SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
