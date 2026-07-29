# READY — #191 (split terminal-stage compound predicates)

## Outcome

The terminal-stage gate blocker is repaired and the required full merge gate
reached `ALL-PASS`.

Commit:

`70d7e7bc52b1941e417b089a0b4e0d79002b9f36`
`fix(harness): await terminal-stage claims independently`

The worktree is clean. Nothing was pushed, merged, tagged, or deleted.

## Primary split measurement

The original wait combined:

1. a visible themed terminal header containing the full `fixtures` suffix;
2. a `$` cell whose foreground was the `terminalPrompt` RGB role.

I split those into independently named grid waits before changing either
claim.

### Pre-repair ordered sequences

| Tier | Ordered result |
| --- | --- |
| Standalone N=5 | `COLOR PASS → TEXT FAIL`, `COLOR PASS → TEXT FAIL`, `COLOR PASS → TEXT FAIL`, `COLOR PASS → TEXT FAIL`, `COLOR PASS → TEXT FAIL` |
| Six-worker pool N=4 | `COLOR PASS → TEXT FAIL`, `COLOR PASS → TEXT FAIL`, `COLOR PASS → TEXT FAIL`, `COLOR PASS → TEXT FAIL` |

The pool sequence is the two attempts from each of the full gates rooted at
`/tmp/merge-gate-failures.196897` and
`/tmp/merge-gate-failures.220408`.

Exact text red:

`Timed out waiting for grid condition: the terminal header shows the fixture path from shell metadata`

Every final grid showed:

- the `$` prompt;
- the correct prompt RGB;
- `parallels@ubuntu2:/home/parallels/.../191-terminal-stage-compound-p`
  clipped at the panel-heading boundary;
- no visible `fixtures` suffix because that suffix was outside the cell.

### Post-repair ordered sequences

| Tier | Ordered result |
| --- | --- |
| Standalone N=5 | `COLOR PASS → TEXT PASS`, `COLOR PASS → TEXT PASS`, `COLOR PASS → TEXT PASS`, `COLOR PASS → TEXT PASS`, `COLOR PASS → TEXT PASS` |
| Six-worker pool N=3 | `COLOR PASS → TEXT PASS`, `COLOR PASS → TEXT PASS`, `COLOR PASS → TEXT PASS` |

The first two post-repair pool entries are the two terminal-stage attempts in
`/tmp/merge-gate-failures.258154`; both passed the repaired prompt boundary
before reaching a later task-local wait. The third is the clean final gate in
`/tmp/191-final2-full-merge-gate.log`, where the entire smoke passed without a
retry.

## Diagnosis, ranked by the task's candidates

1. **The text half — confirmed.** The predicate required the full fixture
   suffix even though the asserted behavior was only that the themed header
   showed shell identity and a working-directory path. The long task-worktree
   path was legitimately clipped before `fixtures`. The repaired predicate
   checks visible `user@host:` plus non-space path text.
2. **The colour half — falsified.** It passed independently in all five
   standalone and all four pre-repair pool observations.
3. **Conjunction timing — falsified for the primary blocker.** One half was
   consistently true and the other consistently false; they were not
   alternating between sampled frames.

The environment comparison also kills the colour-capability hypothesis:

| Context | Parent smoke environment | Invar child environment |
| --- | --- | --- |
| Standalone | `TERM=tmux-256color`, empty `COLORTERM` | `TERM=xterm-256color`, `COLORTERM=truecolor` |
| Merge gate | exports `INVAR_TEST_SUPPRESS_BUILT_IN_TASK=1`; does not override parent terminal colour variables | `TERM=xterm-256color`, `COLORTERM=truecolor` |

`PtyTestDriver.childEnvironment` supplies the same truecolor child
environment in both tiers, so the standalone parent's empty `COLORTERM` never
reaches the application.

## Second terminal-stage boundary exposed by the first repair

The first post-repair full gate advanced beyond the prompt and exposed a
second compound wait in the same smoke on both attempts:

`Timed out waiting for grid condition: the harness snapshot satisfies (candidate) => candidate.findText("Current terminal input: printf") !== null && candidate.findText("BROKN_COMMAND") !== null`

Both final grids visibly contained `BROKN_COMMAND`, while the
`readTerminalInput` tool result was still collapsed. Measurement of the real
path showed the smoke took a transcript coordinate as soon as an intermediate
frame contained generic `lines` text; under pool load the agent turn then
moved that row before the click.

The repair now:

1. awaits published state proving `readTerminalInput` completed with the exact
   current readline buffer and `agentBusy === false`;
2. reacquires the completed result summary from the stable grid;
3. clicks it;
4. waits only for the expanded result text;
5. separately asserts that the terminal pane still contains
   `BROKN_COMMAND`.

Its in-pool ordered sequence was `FAIL, FAIL, PASS`: both attempts in
`/tmp/merge-gate-failures.258154`, followed by the clean final gate.

## Positive controls

Each new condition was deliberately broken, observed red, restored, and
observed green.

Primary prompt split:

- Wrong RGB:
  `error: Timed out waiting for grid condition: the clean terminal paints the minimal prompt with the terminalPrompt palette role`
- Impossible header path:
  `error: Timed out waiting for grid condition: the terminal header shows shell identity and a working-directory path`
- Restored:
  `smoke-terminal-stage-harness: ALL-PASS`

Stable `readTerminalInput` boundary:

- Impossible semantic result:
  `error: Timed out waiting for readTerminalInput finishes with the current readline buffer`
- Impossible expanded text:
  `error: Timed out waiting for grid condition: the expanded tool result shows the current terminal input`
- Impossible retained buffer:
  `error: FAIL the terminal pane retains the current readline buffer while the tool result expands`
- Restored:
  `smoke-terminal-stage-harness: ALL-PASS`

## Invariant review

Derived scope:
`scripts/harness/smoke-terminal-stage-harness.ts` implicates
[scripts/harness/harness.invariants.md](../../../../scripts/harness/harness.invariants.md).

- **Strengthened — Harness waits observe conditions not frame ordinals.**
  Compound and intermediate-frame predicates became independently observable
  result conditions.
- **Strengthened — Every wait names itself.** Each timeout now identifies the
  exact missing prompt, header, completed result, or expansion condition.
- **Upheld — Async-published state is always awaited.** The tool result uses
  the status file until its exact semantic endpoint is published.
- **Upheld — The terminal emulator is the harness screen oracle.** All visual
  claims remain immutable terminal-cell reads.
- **Upheld — Blocking gate verdicts use ordering and counts.** No elapsed-time
  threshold was added or widened.

No contract wording needed refinement.

## Verification

| Check | Result |
| --- | --- |
| `bunx tsc --noEmit` | exit 0 |
| `bun test` | exit 0; 1696 pass, 0 fail |
| `bash scripts/conventions-gate.sh` | exit 0 |
| invariant checker `--all --refs` | exit 0; 924 annotations, 67 lattice links, 0 problems |
| `bun scripts/check-coverage-ratchet.ts` | exit 0; 319 files; terminal-stage `23 assertions / 34 waits → 23 assertions / 36 waits`; no undeclared decrease |
| `bash scripts/behavioral-contracts.sh` | exit 0; `ALL-PASS` |
| AST `awaitNextCompletedFrame` census under `scripts/harness` | 0 identifiers |
| AST `awaitQuiescence` census under `scripts/harness` | 0 identifiers |
| repaired standalone sequence | `PASS, PASS, PASS, PASS, PASS` |
| `bash scripts/merge-gate.sh` | exit 0; `ALL-PASS`; no step passed only on retry |

All task timing/driving runs used the machine-wide quiet lock. Every task
holder recorded `waiting → acquired → released`; no task holder recorded
`degraded`.

## Bycatch

- **100k fold-dense behavioral contract travelled 995 rows once.** Exact
  reproduction: the first pre-repair full pool gate,
  `/tmp/merge-gate-failures.196897/behavioral-contracts-felt-invariants-.log`,
  reported `100k nested JSON count/shape contract failed ... rows=995`.
  Reproduced a second time: **NO** — both later standalone behavioral passes
  and the final full gate passed. Verified at merge base
  `5494a3e` separately: **NO**. The task did not change this contract.

- **Panel-split ordering wait passed only on retry once.** Exact reproduction:
  the first post-repair full gate,
  `/tmp/merge-gate-failures.258154/smoke-panel-split-harness-.attempt1.log`,
  timed out waiting for
  `panelContentOrder.join(',') === 'agent,terminal'` and matching cell IDs,
  then passed its retry. Reproduced a second time: **NO** — the final full gate
  passed without retry. Verified at merge base `5494a3e` separately: **NO**;
  the three earlier `e407bfd` baseline gate failure roots
  `/tmp/merge-gate-failures.{80761,105047,128199}` also contain no panel-split
  failure.

No bycatch fix was made.
