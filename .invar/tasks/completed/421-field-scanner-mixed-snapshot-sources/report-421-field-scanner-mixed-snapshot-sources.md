# READY — Field scanner mixed snapshot sources (#421)

## Outcome

Commit `c4fd678dfb5e920a3c624e1aa9473d16bb1015b1` completes the [filed brief](brief-421-2-field-scanner-mixed-snapshot-sources.md).

Every timeline snapshot now reads one commit only. The final HEAD snapshot no longer reads contract or lattice text from the working tree.

Snapshot Verification fields stay citation-only. The code lens reads source from the selected commit, including HEAD.

The scanner keeps no working-tree snapshot. Uncommitted edits stay outside the timeline.

## Drive evidence

Port 4314 was already held by process 1053739. I used port 4321 without stopping that unrelated process.

Before the fix, I changed one working-tree heading to `Working tree mixed source marker`. Chromium showed this evidence:

- Snapshot index: 311 of 312.
- Snapshot commit: `fd03b0e33d5b9d7671c68e976b708ddde528cd4b`.
- API marker count: 1.
- DOM marker row count: 1.
- `git show HEAD` marker count: 0.

The snapshot claimed HEAD while it displayed text that HEAD did not contain.

After the fix, I kept the same uncommitted heading and drove the same snapshot. Chromium showed this evidence:

- Snapshot index: 311 of 312.
- Snapshot commit: `fd03b0e33d5b9d7671c68e976b708ddde528cd4b`.
- API marker count: 0.
- DOM marker row count: 0.
- API committed-heading count: 1.
- DOM committed-heading row count: 1.
- Working-tree marker count: 1.

The final snapshot displayed `R is an asymptote no record reaches`, which was the heading at its named commit.

## Change

- [RepositoryHistory.ts](../../../../tools/invariant-field-v2/RepositoryHistory.ts) builds HEAD from accumulated committed contract text. It scans every component at the same commit.
- [CodeLens.ts](../../../../tools/invariant-field-v2/CodeLens.ts) removed the working-tree shortcut. It now uses `git show` for every selected snapshot.
- [ContractParser.test.ts](../../../../tools/invariant-field-v2/ContractParser.test.ts) locks the contract, annotation, and orphan counts to one commit.
- [CodeLens.test.ts](../../../../tools/invariant-field-v2/CodeLens.test.ts) locks the displayed source to the selected commit.
- [invariant-field.invariants.md](../../../../tools/invariant-field-v2/invariant-field.invariants.md) adds the one-source record and corrects the verification record.
- [invariant-field.lattice.md](../../../../tools/invariant-field-v2/invariant-field.lattice.md) adds the source boundary to the dependency map and compositions.
- [README.md](../../../../tools/invariant-field-v2/README.md) now describes commit-scoped source and citation-only verification.

The v1 [invariant-field tool](../../../../tools/invariant-field/) is byte-untouched by the commit.

## Invariant review

Scope came from all seven changed files under [tools/invariant-field-v2](../../../../tools/invariant-field-v2/). The local contract contains 4 reality records and 8 chosen records.

| Record | Verdict | Evidence |
|---|---|---|
| [R is an asymptote no record reaches](../../../../tools/invariant-field-v2/invariant-field.invariants.md#r-is-an-asymptote-no-record-reaches) | Upheld | Rank and radius math did not change. |
| [A scanner that writes contracts measures itself](../../../../tools/invariant-field-v2/invariant-field.invariants.md#a-scanner-that-writes-contracts-measures-itself) | Strengthened | The scanner no longer executes record Verification commands. |
| [One commit supplies each snapshot](../../../../tools/invariant-field-v2/invariant-field.invariants.md#one-commit-supplies-each-snapshot) | Discovered and established | The before and after drive plus two regression tests verify the record. |
| [Rank depends only on the contract set and its history](../../../../tools/invariant-field-v2/invariant-field.invariants.md#rank-depends-only-on-the-contract-set-and-its-history) | Strengthened | Its scope now includes the final HEAD snapshot without a working-tree exception. |
| [The rank weights are normalized and sum to one](../../../../tools/invariant-field-v2/invariant-field.invariants.md#the-rank-weights-are-normalized-and-sum-to-one) | Upheld | Weight calculations did not change. |
| [Rot moves a record outward only](../../../../tools/invariant-field-v2/invariant-field.invariants.md#rot-moves-a-record-outward-only) | Upheld | The planted-rot calibration moved radius outward by 0.077812. |
| [One focus fold serves every surface](../../../../tools/invariant-field-v2/invariant-field.invariants.md#one-focus-fold-serves-every-surface) | Upheld | The Chromium smoke matched 89 rail rows to 89 lit marks. |
| [Both field views place a record at the same radius](../../../../tools/invariant-field-v2/invariant-field.invariants.md#both-field-views-place-a-record-at-the-same-radius) | Upheld | The worst geometry error was `1.6653345369377348e-16`. |
| [Design tokens are the only source of colour and timing](../../../../tools/invariant-field-v2/invariant-field.invariants.md#design-tokens-are-the-only-source-of-colour-and-timing) | Upheld | The stylesheet census found 0 unreachable and 0 duplicated rules. |
| [Snapshot verification never crosses its commit](../../../../tools/invariant-field-v2/invariant-field.invariants.md#snapshot-verification-never-crosses-its-commit) | Refined and upheld | The prior bounded-current-checkout record mixed sources. All snapshot verification is now citation-only. |
| [An idle instrument does no work](../../../../tools/invariant-field-v2/invariant-field.invariants.md#an-idle-instrument-does-no-work) | Upheld | The change adds no watcher, timer, or animation loop. |
| [A renamed record keeps its identity](../../../../tools/invariant-field-v2/invariant-field.invariants.md#a-renamed-record-keeps-its-identity) | Upheld | Identity assignment did not change. |

Final invariant verdict: PASS. No record is violated or stressed.

## Positive controls

- I restored working-tree contract reads in the HEAD source. The new parser test failed because it received `Working tree record` instead of `Reality record`.
- I restored the current-code-lens working-tree shortcut. The new lens test failed because it received `working tree` instead of `commit`.
- I removed both planted defects. The focused run passed 18 tests and 52 assertions.

## Verification

- `bash tools/invariant-field-v2/release-gate.sh`: `RELEASE-GATE PASS (0 failures)`.
- Release gate types: PASS.
- Release gate unit tests: 50 passed, 0 failed, 337 assertions.
- Release gate contract structure: 4 reality records and 8 chosen records.
- Release gate annotation check: 1306 annotations and 263 lattice links resolved, with 0 problems.
- Release gate stylesheet census: 0 unreachable and 0 duplicated rules.
- Release gate planted-rot calibration: radius `0.247460` to `0.325272`.
- Release gate Chromium smoke: 388 records and 388 measured marks.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all`: exit 0.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --refs`: exit 0 with 0 problems.

The first commit attempt started the repository merge gate through the pre-commit hook. The brief forbids that gate, so I stopped it during behavioral contracts. I retried with the documented `SKIP_GATE=1` bypass and did not use the partial gate as evidence.

## Repository state

The worktree is clean. I did not push, merge, tag, or change the v1 tool.

## Bycatch

None observed.
