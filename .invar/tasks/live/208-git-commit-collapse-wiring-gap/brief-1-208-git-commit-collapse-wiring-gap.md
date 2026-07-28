# TASK — an expanded commit cannot be folded back: the UI calls expand() where it should toggle()

USER-REPORTED 2026-07-28: "the git commits, you can expand a commit but you cannot fold it back."

Reproduce it first by DRIVING the real app, then read the rest of this brief. Do not start from my
diagnosis.

## The traced site — confirm before trusting it

`CommitExpansion` already has the whole mechanism:

- `toggle(commitIndex, sha)` at `src/modules/git/CommitExpansion.ts:53` — "Expand a collapsed commit /
  collapse an expanded one (click or Enter on its header row)", and it calls `this.collapse(sha)` when
  `isExpanded(sha)`.
- `collapse(sha)` at `:91` drops the entry and evicts its cached files.
- `isExpanded(sha)` at `:48`.

But the production callers do not use it. `src/modules/git/GitWorkspace.ts:501` and `:522` both call
`expansion.expand(row.commitIndex, row.record.sha)` directly. Searching the whole tree, the only callers
of `toggle` are in `src/modules/git/CommitExpansion.test.ts:100-106`, which toggles three times and
passes. So the model can collapse, the tests prove the model can collapse, and the UI never asks it to.

That is why this shipped green: the unit test exercises a seam the product does not use. When you fix
it, ask what OTHER capability on this model has tests but no production caller — the same wiring gap may
exist more than once, and finding a second instance is worth more than fixing the first.

## Do not stop at swapping one call

Two things to establish before choosing the repair:

1. **Which gestures should collapse?** The `toggle` docstring says "click or Enter on its header row",
   so there are at least two entry points and `:501`/`:522` look like different ones (one appears to be
   a fire-and-forget `void expand(...)`, the other an `await expand(...)` that then reads
   `entries.value` to find the first changed file — that second one probably wants expansion as a
   PRECONDITION, not a toggle, since collapsing it would defeat its own next step). Decide per call
   site and justify each. Blindly replacing both with `toggle` may break the drill-into-first-file
   path.
2. **What does the keyboard do?** If Enter toggles but some other key expands, or if the collapse
   gesture exists for the keyboard but not the mouse, say so. The user hit it in the UI; the contract
   should cover both paths that the docstring already promises.

## Verify by driving, and cover the state the tests missed

The gap here was a contract that tested the MODEL in isolation. Do not add a second one of those.

- Drive the real app in a dirty git workspace: open the commit log, expand a commit, confirm the file
  rows appear, then perform the SAME gesture again and confirm the rows disappear and the row count
  returns to its pre-expansion value. Quote the published state before, during and after.
- Do it for BOTH gestures the docstring promises (click and Enter) or state clearly which one the
  product supports and why the other does not apply.
- Then a gated contract in `bun test` (blocking, `scripts/merge-gate.sh:696`) that fails if the
  PRODUCTION path cannot collapse — not one that only exercises `CommitExpansion` directly. A test that
  calls `toggle` proves nothing about a UI that calls `expand`.
- Positive control: break the collapse path again and show the new contract RED, then restore it and
  show green. Say explicitly what the contract observes, so the next reader can tell whether it would
  have caught the original defect. If it would not have, it is the wrong contract.

## Constraints

Do not widen or delete any existing contract. `expansion.collapse` also evicts cached files by design
("re-expanding refetches") — keep that, and if collapse-then-expand now refetches visibly, report the
cost rather than silently caching around it.

Do NOT run `scripts/merge-gate.sh` (the conductor gates), do not push, merge, tag, or delete branches.
Another builder is working on the drive tool concurrently; if you touch `scripts/harness/Drive.ts` you
will conflict, so avoid it and say so if you needed it.

## Repo law

`export let Class = $Class`; the `Static()` wrapper lives at the `$Class` anchor; `Reactive()` is
exempt. Invariant records at `src/modules/<domain>/<domain>.invariants.md` — git contracts in
`src/modules/git/git.invariants.md` — cited by ROOT-RELATIVE path. Full descriptive identifier names.
80 columns. A fragment, not a substitute for the conventions and skills.

## Verification — quote exact exit codes, never read `$?` after a pipeline

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` (zero problems; read the
count off this tree), `bun scripts/check-coverage-ratchet.ts`, `bash scripts/behavioral-contracts.sh`,
plus the drive evidence above.

Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean. Report to
`/tmp/208-commit-collapse-READY.md`: the reproduction, the per-call-site decision with justification,
the drive evidence before/after, the positive control red then green, whether you found a second
tested-but-unwired capability, and anything you could not establish.
