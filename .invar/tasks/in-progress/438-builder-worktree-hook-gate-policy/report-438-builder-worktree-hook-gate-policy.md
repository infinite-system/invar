# READY — 438 builder worktree hook gate policy

## In plain words

A builder commit used to start the full merge gate. Dispatch now gives each
builder worktree a private marker. Builder commits keep formatting, while the
conductor still runs the full gate on the combined tree at landing.

## Result

Task #438 (builder worktree hook gate policy) is READY in three commits:

- `0cd9971769082db639be4c30463bdaf6a0e78923` plants the policy.
- `16f7421f655488914eef4e68776f0f81d6e95da6` tests both checkout types.
- `5cc9e3f395c5935984e3cf82d754f758b5cda70d` corrects the hook policy text.

[Dispatch](../../../../scripts/fleet/dispatch.sh) writes
`skip-full-merge-gate-v1` under the linked worktree's private Git directory.
[The shared hook](../../../../scripts/hooks/pre-commit) formats staged
TypeScript first. It then prints one policy line and exits before the full
gate. A missing or damaged marker falls through to the full gate.

The marker mechanism fits the existing shared hook. It changes no repository
configuration and writes no tracked builder-only file. Git removes the marker
with the linked worktree's private Git directory.

[The conductor skill](../../../../.claude/skills/conductor/SKILL.md) now says
that new builder briefs do not need `SKIP_GATE=1`. Manually cut worktrees do
not get the policy. [The hook installer](../../../../scripts/install-hooks.sh)
now names the primary-checkout scope.

## Driven evidence

Before the change, a linked scratch worktree commit printed:

```text
pre-commit: running the merge-gate ...
PROBE: builder commit launched the full merge gate
pre-commit: merge-gate RED — commit BLOCKED.
PROBE_EXIT=1
```

After the change, `DRY_RUN=1` printed the planned action:

```text
hook policy: plant the worktree-local builder marker; keep formatting and skip the full merge gate
```

A real scratch dispatch then printed the exact private path:

```text
dispatch: planted builder hook policy at /tmp/438-hook-policy-after-OK6lI1/repository/.git/worktrees/9438-hook-policy-probe/invar-builder-hook-policy
```

The dispatched builder worktree formatted and committed the staged TypeScript:

```text
pre-commit: prettier formatted 1 staged file(s).
pre-commit: builder hook policy skips the full merge gate because the conductor gates the combined tree at landing.
BUILDER_COMMIT_EXIT=0
```

The same change and commit message in the throwaway primary checkout reached
the planted gate sentinel:

```text
pre-commit: running the merge-gate ...
PROBE: primary commit launched the full merge gate
pre-commit: merge-gate RED — commit BLOCKED.
PRIMARY_COMMIT_EXIT=1
```

I used a throwaway primary checkout. I did not mutate or commit in the live
conductor checkout.

## Regression contract

[The hook test](../../../../scripts/hooks/pre-commit.test.ts) creates one
primary checkout and one linked builder worktree. The builder arm must skip
the sentinel. The primary arm must launch it.

I changed the hook's expected marker to `broken-positive-control`. The builder
arm failed with expected exit `0` and received exit `1`. I restored the real
marker before the final green run.

## Verification

- `bash -n scripts/hooks/pre-commit scripts/fleet/dispatch.sh scripts/install-hooks.sh`: exit `0`.
- `bun test scripts/hooks/pre-commit.test.ts`: 1 pass, 0 failures, 14 assertions.
- `bunx tsc --noEmit`: exit `0`.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: 1,378 annotations, 266 lattice links, 0 problems.
- `bash scripts/conventions-gate.sh`: passed. It inspected 662 source TypeScript files and 16 script TypeScript files.
- `git diff --check $(git merge-base main HEAD)..HEAD`: exit `0`.
- `git show --check` for all three task commits: passed.
- `git status --short`: empty.

I did not run `scripts/merge-gate.sh`.

## Invariants in scope

The brief expected no invariant. Content implication found one root record.

- [Completion is proven not declared](../../../../project.invariants.md#completion-is-proven-not-declared): upheld. The builder hook skips only an intermediate branch gate. The conductor still gates the combined tree at landing.

No module contract applies to the changed fleet, hook, test, installer, or
conductor files.

## Bycatch

- Contract-layer gap, observed by inspection: [the fleet tooling directory](../../../../scripts/fleet/) has no colocated invariant contract. The load-bearing rule that iteration skips the gate and landing runs it lives only in [the conductor skill](../../../../.claude/skills/conductor/SKILL.md). I did not create a contract in this task.
- Dirty-from-birth worktree, observed once at entry: dispatch generated a fundamentals file as an untracked root file. This conflicts with the clean-tree rule. I moved that generated copy to [its recoverable temporary path](../../../../../../../../tmp/438-builder-worktree-hook-gate-policy-BUILDER-FUNDAMENTALS.md) after reading it. I did not change this separate dispatch behavior.

## Instrument feedback

- EASY: `git rev-parse --git-path invar-builder-hook-policy` exposed a different private path for each linked worktree.
- CONFUSING: none.
- MISSING: dispatch has no safe self-test stop after it plants the marker. `DRY_RUN=1` stops before the worktree exists, while `RECORD_ONLY=1` stops before the cut. I used a temporary scratch-only stop after the plant and did not commit it.

## Worktree state

The branch is `fleet/438-builder-worktree-hook-gate-policy`. The committed tip
is `5cc9e3f395c5935984e3cf82d754f758b5cda70d`. The worktree is clean.
