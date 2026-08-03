## In plain words

Five tests could press Enter before Quick Open finished choosing a file. I made each test wait for the typed query and intended first match. All five tests now pass, including both scales and both diagnostics servers.

## Result

READY at commit `ad6d50383d84292427a1fca33070038ddbd297c0`.

The six Quick Open sites in the [task brief](brief-480-2-migrate-the-quick-open-idiom.md) are complete.

| State | Files |
| --- | --- |
| Done | [smoke-bracket-match-harness.ts](../../../../scripts/harness/smoke-bracket-match-harness.ts): 1 site. [smoke-git-blame-harness.ts](../../../../scripts/harness/smoke-git-blame-harness.ts): 2 sites. [smoke-image-preview-harness.ts](../../../../scripts/harness/smoke-image-preview-harness.ts): 1 shared helper site across 4 queries. [smoke-breadcrumb-harness.ts](../../../../scripts/harness/smoke-breadcrumb-harness.ts): 1 site. [smoke-diagnostics-harness.ts](../../../../scripts/harness/smoke-diagnostics-harness.ts): 1 site across 2 server arms. |
| Remaining in this task | None. |
| Reserved outside this task | [tui-harness.sh](../../../../scripts/tui-harness.sh), [HarnessSmoke.ts](../../../../scripts/harness/HarnessSmoke.ts), [PtyTestDriver.ts](../../../../scripts/harness/PtyTestDriver.ts), and [Drive.ts](../../../../scripts/harness/Drive.ts) remain unchanged for their separate round. |

## Changes

Each site now waits for `quickOpen.query` to equal the typed text. It then waits for `quickOpen.matches.0.path` to equal the intended file before Enter.

The image-preview helper now takes the expected path separately from the query. Its four calls cover `picture.png`, `sample.ts`, `photo.jpg`, and `data.bin`.

Each file keeps its later screen or status assertion. The graph sequences the action. The screen and status still prove the user-visible result.

The edited smoke files now cite [Harness waits observe conditions not frame ordinals](../../../../scripts/harness/harness.invariants.md) at their enforcement point.

## Driven proof

The unchanged bracket smoke passed before the edit. Its pre-satisfied `sample.ts` wait therefore showed the false-green shape from the census.

A warm real-app drive reached `quickOpen.query="smoke-bracket-match-harness.ts"`. It then reached `quickOpen.matches.0.path="scripts/harness/smoke-bracket-match-harness.ts"`. I stopped the warm server after this probe.

The final breadcrumb smoke passed at 10 and 100,000 lines. The diagnostics smoke passed with `tsgo` and `typescript-language-server`. The image smoke passed all four Quick Open queries.

## Positive controls

I planted a wrong graph expectation in each touched smoke. All five controls exited 1. I restored the correct values before the green runs.

| Smoke | Planted expectation | Last settled value |
| --- | --- | --- |
| Bracket match | `positive-control-does-not-exist.ts` | `sample.ts` |
| Git blame | `positive-control-does-not-exist.txt` | `tracked.txt` |
| Image preview | `positive-control-does-not-exist.png` | `picture.png` |
| Breadcrumb | Wrong `quickOpen.query` value | `huge.ts` |
| Diagnostics | Wrong `quickOpen.query` value | `far.ts` |

## Coverage

[project.coverage-deltas.md](../../../../project.coverage-deltas.md) declares every measured decrease:

- Bracket match: assertions 6 → 6, waits 6 → 5.
- Git blame: assertions 7 → 7, waits 11 → 9.
- Image preview: assertions 11 → 11, waits 11 → 10.

The source counter does not count `GraphClient.awaitValue`. Each removed screen wait became two real graph waits. No runtime claim was removed.

The breadcrumb count increased to assertions 13 and waits 13 against the merge base. Diagnostics had no decrease.

## Invariants

- [Harness waits observe conditions not frame ordinals](../../../../scripts/harness/harness.invariants.md): strengthened. Every converted site observes a false-at-issue query or first-match condition before Enter.
- [Every wait names itself](../../../../scripts/harness/harness.invariants.md): upheld. Each graph timeout names the exact path, expected value, and last settled value.
- [Async-published state is always awaited](../../../../scripts/harness/harness.invariants.md): upheld. Enter follows parked graph waits at frame-settle boundaries.
- [The composition graph reaches every installed contributor](../../../../src/modules/system/system.invariants.md): upheld. The smokes use the existing composition root. This change adds no curated membership list.
- [Coverage may fall but never silently](../../../../project.invariants.md): upheld. The three measured decreases have exact declarations and reasons.

No invariant record changed. The final checker found 0 problems.

## Verification

- [smoke-bracket-match-harness.ts](../../../../scripts/harness/smoke-bracket-match-harness.ts): ALL-PASS.
- [smoke-git-blame-harness.ts](../../../../scripts/harness/smoke-git-blame-harness.ts): ALL-PASS.
- [smoke-image-preview-harness.ts](../../../../scripts/harness/smoke-image-preview-harness.ts): ALL-PASS across four queries.
- [smoke-breadcrumb-harness.ts](../../../../scripts/harness/smoke-breadcrumb-harness.ts): ALL-PASS at 10 and 100,000 lines.
- [smoke-diagnostics-harness.ts](../../../../scripts/harness/smoke-diagnostics-harness.ts): ALL-PASS for both server arms.
- `bun test`: PASS. 2,353 tests across 353 files, 72,111 expectations, 0 failures.
- `bunx tsc --noEmit`: PASS.
- `bash scripts/conventions-gate.sh`: PASS. It reported the existing 20 legacy grammar violations.
- `bun scripts/check-coverage-ratchet.ts`: PASS. It inspected 392 files and found no undeclared decrease against `a9700d9`.
- Invariant checker `--all`: PASS for every record.
- Invariant checker `--refs`: PASS. 1,372 annotations, 266 lattice links, 0 problems.

The final pass ran on committed content after the commit hook formatted five smoke files. I did not run `scripts/merge-gate.sh` or `scripts/behavioral-contracts.sh`, as the brief requires.

## PTY usability

- Easy: the live graph made the query and selected first path direct conditions. One warm drive confirmed the exact array path.
- Confusing: a timed-out graph wait says the path did not resolve even when it reports the real last settled value.
- Missing: none for this task.

## Bycatch

- Not fixed: `GraphClient.awaitValue` reports a wrong expected value as a path-resolution failure. Each positive control printed `walk died at: <unknown>` and then printed the real last settled value. This reproduced in all five controls.
- Conductor-map miss, not fixed: the brief's invariant list omitted [Coverage may fall but never silently](../../../../project.invariants.md). Its coverage-delta instruction still implicated that record, and this change upheld it.

No bycatch received a code change.
