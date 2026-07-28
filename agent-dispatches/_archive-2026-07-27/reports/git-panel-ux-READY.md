# READY — Git panel hover and commit browsing UX

## Result

READY on `fix-git-panel-ux`.

Commit: `f85e4eaa9e5bddce72db7f38c1f55b2858965000`
(`Fix Git panel hover and commit browsing`)

The staging-list hover is confined to its own terminal row. Commit-log
selection now previews comparisons while Source Control retains focus; Enter
and double-click explicitly transfer focus to the comparison.

## Reproduction and diagnosis

Both defects were reproduced through the real PTY before structural diagnosis.

- Hover reproduction: moving the pointer from one change row to another
  changed the complete cell array of the following row. The initial ratchet
  exited 1 at `staging hover leaves the following row byte-identical`.
- Focus reproduction: single-clicking a changed file in an expanded commit
  published `focus: editor` with `showingDiff: true`. The initial log ratchet
  exited 1 because selection did not update the comparison preview while
  retaining Git focus.

The hover row was one cell too wide. Its clipped label plus eight action cells
and the scrollbar already equalled `innerWidth`; one additional painted space
made the styled line `innerWidth + 1`, so the final cell wrapped onto the next
terminal row.

Commit browsing and activation shared one operation:
`GitWorkspace.showComparison` always called `Workspace.focusEditor`. The log
pointer mapping also addressed the row before the clicked commit after the log
header. These were authority and geometry errors, not a host focus-projection
problem; the Bootstrap sync-flush precedent was read, but no host seam needed
to change.

## Implementation

- Removed the surplus styled cell from active change rows.
- Split log-row preview from activation at `GitWorkspace`.
  - arrows and single clicks preview without claiming editor focus;
  - Enter and double-click activate and transfer focus;
  - working-tree change rows retain their existing open-and-focus behavior.
- Corrected log pointer row mapping.
- Joined repeated expansion calls to one in-flight fetch so a fast
  double-click can await lazy commit expansion reliably.
- Superseded stale preview work from older log selections.
- Extended the real-PTY selection smoke with an exact next-row cell comparison.
- Extended the log smoke across three commits and their files, checking
  distinct comparison headers and published focus throughout, then Enter,
  double-click, and the existing Escape binding.
- Recorded:
  - `Git row decoration stays within one row`
  - `Commit selection previews without focus transfer`
- Appended counted coverage declarations for both driven smokes and both
  extended unit files.

## Verification

Every command below exited 0.

| Check | Result |
| --- | --- |
| `bun install --frozen-lockfile` | exit 0 |
| `bash scripts/conventions-gate.sh` | exit 0; PASS |
| `bunx tsc --noEmit` | exit 0 through conventions gate |
| `bun scripts/check-file-grammar.ts` | exit 0; 452 files, 0 violations |
| invariant checker `--all` | exit 0 |
| invariant checker `--all --refs` | exit 0; 832 annotations, 45 links, 0 problems |
| `bun scripts/check-coverage-ratchet.ts` | exit 0; 296 files, no undeclared decrease |
| `bun scripts/check-reactive-observation.ts` | exit 0; positive control green, 0 candidates |
| `bun scripts/check-harness-wait-observation.ts` | exit 0; report-only census completed |
| full `bun test` | exit 0; 1,555 pass, 0 fail, 16,980 expectations |
| `bash scripts/behavioral-contracts.sh` | exit 0; ALL-PASS |
| `git diff --check` / committed-tree check | exit 0 |

`idle-quiescence` remained green: frame 2 to frame 2 across three untouched
seconds.

Touched PTY smoke matrix:

| Smoke | Run 1 | Run 2 | Run 3 | Post-commit |
| --- | --- | --- | --- | --- |
| `smoke-selection-harness.ts` | exit 0 | exit 0 | exit 0 | exit 0 |
| `smoke-git-log-harness.ts` | exit 0 | exit 0 | exit 0 | exit 0 |

Loaded run: full `bun test` and both touched PTY smokes ran concurrently.
All three exited 0; both smokes reported `ALL-PASS`.

Counted coverage changes:

- `smoke-selection-harness.ts`: assertions 15 → 16, waits 14 → 16
- `smoke-git-log-harness.ts`: assertions 25 → 29, waits 20 → 29
- `CommitExpansion.test.ts`: assertions 15 → 18, waits 7 → 8
- `GitWorkspace.races.test.ts`: assertions 2 → 4, waits 2 → 3

## Handoff state

- Worktree is clean.
- No TASK file is tracked.
- The manual reproduction session was stopped.
- `scripts/merge-gate.sh` was not run.
- Nothing was pushed, merged, tagged, or amended; no branch or worktree was
  deleted.
