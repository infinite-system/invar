# READY — #148 retired-file convention

Branch: `docs-retired-file-convention`

Commit: `72b28a0c0f559f1f130554b252310d36dac43c6e`

## Outcome

- Documented `scripts/retired-smokes/` as the sole smoke-retirement
  directory, with `git mv`, basename preservation, a mandatory coverage
  declaration and reason, and the rejected deletion alternative.
- Migrated `smoke-settings-applied.sh.parked` with a 100% Git rename to
  `scripts/retired-smokes/smoke-settings-applied.sh`. The pre/post SHA-256
  remained
  `0706350e264127cfcda43d7b0ab874c59cbb61535d7e32f65b0db16af22be281`;
  its content was not changed.
- Added `scripts/check-retired-smoke-references.sh` to the always-run
  conventions gate. It blocks child-path citations from live invariant
  records, scripts and registrations, and `project.*.md` files while allowing
  documentation of the directory itself.
- Removed existing child-path citations from coverage declarations and the
  harness invariant record.
- Made the coverage ratchet reject the retired prefix before classifying
  coverage-bearing paths, with tests for retired harness and unit-test names.
- Made invariant discovery and `--refs` skip the retirement directory,
  bumped the checker to 2.2.1, documented the exclusion, and added a
  black-box test containing both an invalid retired contract and an orphaned
  retired annotation.
- Confirmed smoke registration is explicit in `scripts/merge-gate.sh`; it
  does not walk the retirement directory. The new all-live-scripts citation
  check also prevents registering a retired child path later.

This task changes repository policy and checker censuses, not a rendered,
per-row, per-item, or per-frame application path. PTY driving and small/large
scale parity are therefore not applicable.

## Positive control

Planted this active line in the harness invariant record:

```text
Positive-control plant: `scripts/retired-smokes/smoke-settings-applied.sh`.
```

The new check produced:

```text
RETIRED-SMOKE-REFERENCE FAIL: live files cite retired smoke content:
./scripts/harness/harness.invariants.md:208:Positive-control plant: `scripts/retired-smokes/smoke-settings-applied.sh`.
```

Exit code: `1`. The plant was then removed.

## Final verification on the committed bytes

- `bash scripts/check-retired-smoke-references.sh` — exit `0`; 229 live
  files inspected.
- `bash scripts/conventions-gate.sh` — exit `0`.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`
  — exit `0`; 875 annotations and 67 lattice links resolved, 0 problems.
- `bun scripts/check-coverage-ratchet.ts` — exit `0`; 309 files inspected,
  no undeclared decrease.
- `bunx tsc --noEmit` — exit `0`.
- `bun test` — exit `0`; 1,657 passed, 0 failed across 249 files.
- `git show --check HEAD` — exit `0`.
- Worktree is clean and the branch is one commit ahead of `origin/main`.
- `scripts/merge-gate.sh` was not run, as required.

## Bycatch

None observed.

COMPACTION: none.

conventions @ `72b28a0c0f559f1f130554b252310d36dac43c6e`
