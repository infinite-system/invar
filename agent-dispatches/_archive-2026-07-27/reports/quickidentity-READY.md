# READY — #162 (Quick Open activation identity)

## Status

READY on `fix-quick-open-identity`.

Commit: `22be2dce925832c797889dd54aaf83748e442396`
(`test(quick-open): lock activation to published identity`)

Worktree clean. Nothing pushed, merged, tagged, or deleted.
`scripts/merge-gate.sh` was not run.

## Finding

The reported product identity mismatch does not exist in this checkout.
The original evidence published an index, count, and query, but never the
identity at that index.

With an isolated HOME and the repository itself as workspace, typing
`TASK.md` produced:

```text
quickOpenQuery="TASK.md"
quickOpenMatches=2
quickOpenSelected=0
```

The visible result rows were `project.tasks.md` and
`src/modules/tasks/tasks.invariants.md`. A temporary seam instrument at Enter
then proved:

```text
quickOpenIdentityInstrument={
  "published":"project.tasks.md",
  "consumed":"project.tasks.md"
}
activeBuffer="/tmp/conductor-quickidentity/project.tasks.md"
```

`TASK.md` was not a Quick Open candidate because the shared Git exclude
contains:

```text
/home/parallels/dev/tui-editor/.git/info/exclude:8:/TASK.md
```

`rg --files` therefore omitted `TASK.md`. The `TASK.md` text visible in the
reported state was the query, not proof that a selected result had that
identity.

A real two-file workspace containing both `TASK.md` and
`project.tasks.md` already behaved correctly before changes: `TASK.md` was
the selected result and Enter opened `/tmp/quickidentity-small-workspace/TASK.md`.
`QuickOpen.activate()` already returns
`matches[selectedIndex].path`; the Bootstrap path opens that returned identity
without re-querying.

## Implemented

- `AppStatusProjection` now publishes
  `quickOpenSelectedIdentifier`, so the selected entry identity is
  authoritative and observable without an O(match-count) projection.
- `search.invariants.md` records the established invariant
  `Quick Open activates the selected entry`.
- The gated real-PTY Quick Open smoke includes the confusable
  `TASK.md` / `project.tasks.md` pair, waits for the full selected-identity
  publication, proves both rows are rendered, and compares the opened
  absolute path with the exact published selected entry.
- `AppStatusProjection.test.ts` covers the empty and selected identity
  publications.

## Driven evidence

Default repository-scale drive, isolated HOME:

```text
quickOpenMatches=2
quickOpenQuery="TASK.md"
quickOpenSelected=0
quickOpenSelectedIdentifier="project.tasks.md"
```

Committed confusable-pair drive, isolated HOME:

```text
quickOpenMatches=2
quickOpenQuery="TASK.md"
quickOpenSelected=0
quickOpenSelectedIdentifier="TASK.md"
activeBuffer="/tmp/quickidentity-small-workspace/TASK.md"
```

This covers the large repository candidate set and the minimal confusable
pair without adding per-item projection cost.

## Positive control

I temporarily reintroduced the classic defect by making file activation
re-query the unranked `projectFiles` collection instead of consuming
`matches[selectedIndex].path`.

The unique `widget` case remained green, while the new identity contract
failed red with exit code 1:

```text
error: Timed out waiting for the opened buffer to be the exact entry Quick
Open published as selected
```

After removing the plant, the same contract returned exit code 0:

```text
PASS  Enter opened the exact Quick Open entry published as selected
smoke-quickopen-harness: ALL-PASS
```

## Verification

- `bun install` — exit 0.
- `bunx tsc --noEmit` — exit 0.
- `bun test` — exit 0; 1,692 pass, 0 fail, 67,579 expectations across
  258 files.
- `bash scripts/conventions-gate.sh` — exit 0; 0 grammar violations.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`
  — exit 0; 910 annotations, 67 lattice links, 0 problems.
- `bun scripts/check-coverage-ratchet.ts` — exit 0; Quick Open smoke grows
  from 3 assertions / 5 waits to 5 assertions / 9 waits; projection test
  grows from 34 assertions / 1 wait to 36 assertions / 1 wait; no undeclared
  decrease.
- `bun scripts/harness/smoke-quickopen-harness.ts` — exit 0,
  `ALL-PASS`.
- `git diff --check` — exit 0.

## Bycatch

None observed.

Conventions:
`2e6c207555c2aeecd49d460e5d8ca3ed8ba030af`
