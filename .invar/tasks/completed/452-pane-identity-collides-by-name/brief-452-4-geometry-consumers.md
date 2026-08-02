# Brief #452 round 4 — a pane-identity consumer you did not migrate

## In plain words

Something still looks panes up by the word "terminal" instead of by
the new id. It breaks copying from the terminal. Find every place that
still does this, not just the one the check caught.

## Evidence — A/B proven

Stack gate `main + #442 + #444 + #452`: `GATE_EXIT=1`.

```text
smoke: clipboard frame boundary harness
  error: Panel geometry unavailable for terminal
```

Same smoke, run on main, unmerged:

```text
smoke-clipboard-frame-boundary-harness: ALL-PASS
```

So this is yours: a lookup by the OLD kind-based id `terminal` against
your new opaque `pane-instance-N` ids.

## What to do

Enumerate EVERY consumer that resolves a pane by kind string — panel
geometry, narration maps, status projection, harness helpers, anything
that used to assume `id === kind`. The gate names only what it happens
to cover; #442 lost a whole afternoon to exactly that assumption.

Then decide the right shape: either those consumers take an id, or the
host exposes a kind→pane lookup that is honest about there being MANY
panes of a kind. Do not reintroduce the collision by making kind an
identity again.

## Also check before assuming

`smoke-agent-pane-ux` and `smoke-agent-cancel` also failed. They are
filed as #454 and #455 from an earlier round, but they may share THIS
cause. Check before treating them as unrelated. `smoke-scrollbars`
(#453) and `behavioral-contracts` (#456) failed identically before your
branch existed and are NOT yours.

## Invariants in scope

Rounds 1 to 3 stand. The identity record you were asked to propose now
has a second impossibility worth naming: a consumer resolving a pane by
its KIND when several panes share that kind.

## Verification

- The clipboard smoke green on the stack.
- Every consumer you found, named in the report.
- `bun test` in FULL; `bunx tsc --noEmit`; conventions gate; invariant
  checker `--all` and `--refs`.
- Do NOT run `scripts/merge-gate.sh`. Commit with `SKIP_GATE=1`.

## Report

Open with `## In plain words`. List every kind-based consumer found and
what you did with each.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md) taxonomy. Write the `## Bycatch` section even if
it reads `None observed`.
