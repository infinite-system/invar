# Wait-class sweep — READY

## Result

Audited all 75 files in `scripts/harness/` (74 TypeScript files plus the
invariant record) and all 42 `scripts/smoke-*.sh` files.

The final rebased assertion census inspected 1,084 proof sites:

- 858 TypeScript assertion calls (`expect`, `pass`, `requireCondition`, and
  `assertContentInvariantAcrossAction`)
- 226 shell `PASS` verdict branches

I assigned each defect to its most specific primary sub-class so the totals do
not double-count sites which also contained a literal sleep.

| Sub-class | Already fixed in prerequisite `45d52b4` | Fixed on this branch | Total found |
| --- | ---: | ---: | ---: |
| Adjacent-state wait | 4 | 40 | 44 |
| Vacuous predicate | 1 | 1 | 2 |
| Unobserved external dependency | 1 | 10 | 11 |
| Bare sleep | 0 | 9 | 9 |
| **Total** | **6** | **60** | **66** |

This branch was cut at `3c1590a`; `main` advanced afterward with prerequisite
commit `45d52b4`. I inspected that commit's six fixes and did not duplicate
them. After my commit, the conductor rebased the branch onto current
`origin/main`, so the final commit already has `45d52b4` in its ancestry.

## Fixes

The prerequisite commit already corrected:

- `scripts/harness/smoke-terminal-backpressure-harness.ts`: waits for the shell
  heading text before asserting it.
- `scripts/harness/smoke-scrollbars-harness.ts`: waits for the editor vertical
  thumb, diff bar, and editor horizontal thumb before consuming those frames.
- `scripts/harness/smoke-gutter-diff-harness.ts`: replaces the repeated
  post-save marker predicate with a deadline-bounded disk-content observation
  before git consumes the save.

This branch adds:

- `scripts/harness/smoke-agent-cancel-harness.ts`: polls the authoritative
  backend prompt log for both exact ordered sequences; observes the
  cancellation hold as an unchanged prompt count throughout a bounded window.
- `scripts/harness/smoke-bracket-match-harness.ts`: awaits published editor
  focus before claiming the fixture is ready for the arrow-key path.
- `scripts/harness/smoke-git-blame-harness.ts`: produces a watched-tree event,
  then awaits both a changed git count and the asserted empty blame author.
- `scripts/harness/smoke-layout-harness.ts`: awaits the exact clock/right-dock
  status-row suffix and uses that same snapshot for both edge assertions.
- `scripts/harness/smoke-overlay-dialog-harness.ts`: all five cursor-byte
  assertions now await their exact shown/hidden output state.
- `scripts/harness/smoke-panel-split-harness.ts`: boot and restart drives await
  the exact terminal/agent button labels before deriving click coordinates.
- `scripts/harness/smoke-paste-harness.ts`: awaits published editor focus before
  claiming paste readiness.
- `scripts/harness/smoke-pixel-preview-harness.ts`: Quick Open awaits its exact
  published query before Enter, and the placement absence sleep is replaced by
  a deadline-bounded unchanged sequence-count observation.
- `scripts/harness/smoke-terminal-follow-harness.ts`: awaits `follow: off` and
  uses that exact snapshot for pointer discovery.
- `scripts/harness/smoke-terminal-harness.ts`: scroll samples now await changed
  settled row offsets; reversal awaits a consecutive downward transition while
  remaining above the live bottom; child-wheel ownership observes raw child
  bytes and then the unchanged host scroll state throughout a bounded window.
- `scripts/harness/smoke-text-input-harness.ts`: awaits the exact retained
  quick-open query before the no-drill assertion reads it.
- `scripts/harness/smoke-workspace-tabs-harness.ts`: awaits the selected root
  and incomplete watcher activation together, then asserts from that returned
  status.
- `scripts/smoke-gutter-diff.sh`: replaces fixed sleeps/settles with exact
  marker/no-marker polls, observes saved disk bytes before git, and observes the
  post-save retained marker across a bounded window.
- `scripts/smoke-pixel-preview.sh`: polls exact image-status fields, raw kitty
  and sixel byte sequences, and the spawned app process exit.
- `scripts/smoke-scrollbars.sh`: polls exact bar counts, solid-thumb geometry
  and movement, revealed text, and bounded absence conditions for independent
  or fitting panes.

The invariant `Harness waits observe conditions not frame ordinals` now names
app-produced disk/process dependencies in Scope and Impossible-if-true. Its
Rejected-alternatives section is unchanged.

`coverage-deltas.md` has appended count rows for every AST-counted change:

- git blame: 7 assertions / 10 waits → 7 / 11
- layout: 43 / 44 → 43 / 46
- panel split: 32 / 21 → 32 / 23
- terminal follow: 11 / 22 → 11 / 23
- terminal: 23 / 27 → 24 / 31
- text input: 11 / 16 → 11 / 17
- workspace tabs: 27 / 27 → 27 / 28

No coverage count decreased.

## Mechanical tell

Added report-only `scripts/check-harness-wait-observation.ts` and the
`named-calls` structural mode in `scripts/ast-query.ts`.

The checker:

- counts the TypeScript assertions/condition waits and shell verdict branches;
- reports a canonicalized wait predicate repeated in the same function, for
  review of whether an intervening action really made it false;
- specifically reports a post-`Control+s` predicate matching an earlier wait;
- reports git consumption after `Control+s` without a disk observation; and
- reports a TypeScript bare sleep only when it is the last wait between a drive
  and the following assertion.

It is intentionally report-only. Final output on the rebased branch:

- 41 repeated-predicate review candidates;
- 1 overlapping vacuous-save review candidate: gutter-diff's repeated marker
  wait is safe because the newly authoritative disk observation intervenes; and
- 0 save/git external-boundary candidates; and
- 0 bare-sleep candidates.

Semantic review found the other repeated predicates legitimate because an
intervening action made the state false before it was awaited again. There is
no honest low-false-positive textual rule for adjacent semantic states or for
arbitrary shell predicates, so I did not add one.

No assertion was found to be wrong rather than mis-sequenced, and no assertion
was weakened.

## Smoke verification

Every modified smoke passed three times on its final relevant source and once
under deliberate load. Loaded TypeScript runs were paired concurrently;
loaded shell runs were run concurrently (the final terminal repeat also ran
beside `bun test`).

Failure-driven refinement was not hidden from the census: an early terminal
run exited 1 on the too-strong reversal target, its next refinement exited 1
because child exit was combined with the unchanged-scroll claim, and a rebased
pixel-preview run exited 1 when adjacent file-tree text vacuously satisfied
Quick Open. Those three failures produced the consecutive-transition,
bounded-absence, and exact-query waits listed above. The table records the
required three runs of each final implementation.

| Smoke | Run 1 | Run 2 | Run 3 | Loaded |
| --- | ---: | ---: | ---: | ---: |
| `smoke-agent-cancel-harness.ts` | 0 | 0 | 0 | 0 |
| `smoke-bracket-match-harness.ts` | 0 | 0 | 0 | 0 |
| `smoke-git-blame-harness.ts` | 0 | 0 | 0 | 0 |
| `smoke-layout-harness.ts` | 0 | 0 | 0 | 0 |
| `smoke-overlay-dialog-harness.ts` | 0 | 0 | 0 | 0 |
| `smoke-panel-split-harness.ts` | 0 | 0 | 0 | 0 |
| `smoke-paste-harness.ts` | 0 | 0 | 0 | 0 |
| `smoke-pixel-preview-harness.ts` | 0 | 0 | 0 | 0 |
| `smoke-terminal-follow-harness.ts` | 0 | 0 | 0 | 0 |
| `smoke-terminal-harness.ts` | 0 | 0 | 0 | 0 |
| `smoke-text-input-harness.ts` | 0 | 0 | 0 | 0 |
| `smoke-workspace-tabs-harness.ts` | 0 | 0 | 0 | 0 |
| `smoke-gutter-diff.sh` | 0 | 0 | 0 | 0 |
| `smoke-pixel-preview.sh` | 0 | 0 | 0 | 0 |
| `smoke-scrollbars.sh` | 0 | 0 | 0 | 0 |

## Required verification

| Command | Exit code |
| --- | ---: |
| `bunx tsc --noEmit` | 0 |
| `bun test` | 0 |
| `bun scripts/check-file-grammar.ts` | 0 |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all` | 0 |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --refs` | 0 |
| `bash scripts/conventions-gate.sh` | 0 |
| `bun scripts/check-coverage-ratchet.ts` | 0 |
| `bash scripts/behavioral-contracts.sh` | 0 |
| `bun scripts/check-harness-wait-observation.ts` | 0 |
| `bun scripts/ast-query.ts named-calls awaitQuiescence --path scripts/harness` | 0 |
| `bash -n` on the three modified shell smokes | 0 |
| `git diff --check` | 0 |

Sweep commit:
`80c6cd79ac11aae43608a743f45da52780d7ad24`

Load-discovered Quick Open follow-up:
`44cee21afbde847835d701b87a318d27b0811521`

The conductor integrated the sweep commit and added independent commit
`72dca35` while verification was still running, then marked the branch
finished. The follow-up commit is therefore after the finished tag and still
needs conductor integration.
