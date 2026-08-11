# READY — #546 (diff view labels lie for commits)

## Amendment (round 2): priming file removed from the branch

Commit `8901e00d` had swept `BUILDER-FUNDAMENTALS.md` (2814 lines, the
dispatcher's priming file) into tracking via `git add -A`. Commit
`814145b8` removes it with `git rm --cached`; the file stays on disk in the
worktree as untracked dispatch scaffolding. Confirmed on the full branch
diff (`merge-base..HEAD`): neither `BUILDER-FUNDAMENTALS.md` nor `AGENTS.md`
appears in the committed changes. Tree clean apart from the untracked
priming file. The requested `brief-546-2-2.md` does not exist under
`.invar/tasks/` or the worktree; this amendment follows the conductor's
steer text directly.

## In plain words

Every diff used to title its two sides "Base (HEAD)" and "Current (working)",
even when it showed an old commit. Now the code that fetches the two texts
also writes the two titles, because it is the only place that knows where the
texts came from. A commit diff now reads "Base (abc1234^)" and
"Commit (abc1234)", a staged diff reads "Current (staged)", and the view
itself invents nothing.

## What changed

Commit `8901e00d` on branch `fleet/546-diff-view-labels-lie-for-commits`.

- [GitWorkspace.ts](../../../../src/modules/git/GitWorkspace.ts):
  `GitComparisonRequest` gains `previousVersionLabel` / `currentVersionLabel`.
  Both build sites fill them — this is the ONE provenance source the brief
  asked for:
  - commit diff (`loadCommitFileDiff`): `Base (<sha7>^)` / `Commit (<sha7>)`.
    The base path also dropped its duplicated `@ <sha>^` suffix, since the
    label now carries the revision.
  - staged row: `Base (HEAD)` / `Current (staged)`.
  - unstaged row: `Current (working)`; the base reads `Base (staged)` when a
    staged version of the same file exists (the index is the real base), else
    `Base (HEAD)`.
  - untracked row: `Base (empty)` / `Current (working)`.
  - the restore-state type guard now checks both label fields.
- [DiffView.ts](../../../../src/modules/diff/DiffView.ts): `DiffViewOptions`
  requires both labels; `update()` renders them verbatim. The hardcoded
  strings at the old lines 710/715 are gone.
- [GitComparisonContent.ts](../../../../src/modules/git/GitComparisonContent.ts)
  passes the request labels through; its stale `focusedPaneTitle` comment is
  updated.
- [diff.invariants.md](../../../../src/modules/diff/diff.invariants.md):
  the record `Base and current stay unambiguous` is refined as the brief
  predicted — Invariant and Mechanism now name the provenance source
  (`GitComparisonRequest` labels built in `GitWorkspace`), Scope adds the two
  build sites, Impossible-if-true adds "a historical-commit comparison
  labeled `Current (working)`", Verification adds the git-log smoke.
- Test fixtures in four `*.test.ts` files gained the two new request fields.

## Verification — the adversarial protocol actually driven

All driving went through the real PTY harness (the same byte path a user's
terminal produces).

Comparison kinds driven, labels asserted on the painted grid, each with BOTH
polarities (true label present AND the old lying label absent):

- **unstaged, nothing staged** —
  [smoke-diff-overview-harness.ts](../../../../scripts/harness/smoke-diff-overview-harness.ts)
  (existing scenes): `Base (HEAD)` / `Current (working)` unchanged.
- **staged** — new scene in the same smoke: stage the file, modify the
  working copy AGAIN so the same path sits in both sections (the
  interleaving case), click the staged row: `Base (HEAD) — long.txt` +
  `Current (staged)` painted, `Current (working)` absent.
- **unstaged with a staged sibling** — same scene, Escape out of the staged
  diff, click the Changes row: `Base (staged) — long.txt` +
  `Current (working)` painted, `Base (HEAD)` absent.
- **commit** —
  [smoke-git-log-harness.ts](../../../../scripts/harness/smoke-git-log-harness.ts):
  all three commit previews now assert `Commit (…) — <file>`; the first also
  asserts the `Base (…^) — <file>` side and the absence of both old labels.
- **untracked** —
  [smoke-git-watch-harness.ts](../../../../scripts/harness/smoke-git-watch-harness.ts):
  the untracked node_modules-symlink comparison asserts
  `Base (empty) — node_modules…` and the absence of `Base (HEAD)`.
- **commit-range** — does not exist in the app; no build site produces one.

Positive controls — each new assertion seen RED on a planted defect, then
green after removal:

1. staged label planted back to `Current (working)` → diff-overview smoke
   timed out on the staged-labels condition. Reverted.
2. commit label planted back to `Current (working)` → git-log smoke timed
   out on the commit-preview condition. Reverted.
3. untracked label planted back to `Base (HEAD)` → git-watch smoke timed out
   on the symlink-comparison condition. Reverted.

Final green pass, in order: smoke-diff-overview ALL-PASS, smoke-git-log
ALL-PASS, smoke-git-watch ALL-PASS, smoke-scrollbars ALL-PASS (neighbor
smoke that also asserts diff labels), `bun test src/modules/git
src/modules/diff` 139 pass / 0 fail, invariants checker `--all --refs`
1440 annotations resolved / 0 problems, `tsc --noEmit` clean.

Scale parity: the labels are two constant strings per comparison, no
per-row or per-frame work; the scrollbars smoke exercises the 500-line diff
fixture with the same code path. Saved state: comparison requests live only
in in-memory navigation history, nothing on disk changed shape.

Neighbor sweep: change navigation, split-ratio drag, selection copy, and
Open current all re-driven green by the existing scenes of the same smokes.
Coherence: one field pair on the existing request seam replaced four
hardcode/duplication sites (the `@ <sha>^` path suffix folded into the
label); the invariant record is sharper than before.

## Instrument feedback

EASY: PtyTestDriver grid conditions and the status waits covered everything.
CONFUSING: pane titles truncate to the pane width, so a label+filename
needle can miss while the label is correct — a "findText with truncation
tolerance" note (or a rightmost-pane-title reader) would have saved one
probe round trip.

## Bycatch

- Comment drift, FIXED in the task commit (it sat on a line the task had to
  rewrite anyway): `GitComparisonContent.focusedPaneTitle` doc said the
  panes are labeled `Base (HEAD)` / `Current (working)` — now describes the
  provenance labels.
- Suspect near-duplication: `smoke-scrollbars-harness.ts` and
  `measure-scroll-smoothness.ts` each carry a private `runGit` helper while
  the other smokes use `HarnessSmoke.Class.runGit` — same generator,
  three sites.
- Premise note: the brief's `DiffView.ts:710/:715` line numbers were exact;
  no premise corrections needed.
- None further observed.
