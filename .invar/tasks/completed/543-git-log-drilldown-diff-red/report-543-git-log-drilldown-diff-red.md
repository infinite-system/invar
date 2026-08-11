# READY 543 — git log drill-down diff: the app was right, the smoke drifted

**Branch:** `fleet/543-git-log-drilldown-diff-red` · **Commit:** `acdfc4c6`
**Verdict:** rival (b) — smoke row arithmetic drifted. The app path works and
matches its recorded invariant. One file changed: the smoke.

## In plain words

The test believed that pressing Enter on a commit only unfolds it, and that
you need a second Down and Enter to open the file's before-and-after view.
But since 2026-07-26 the app opens that view the moment you select the
commit, and the first Enter jumps you into it. So the test's second Enter
landed INSIDE the open diff, where Enter means "open the real file" — which
closed the diff. The test then reported "the diff never opened" when in
truth it had opened and the test itself closed it. I rewrote the test to
follow the app's real contract, and everything is green.

## The rival separation, with evidence

Both rivals from the brief were driven before any diagnosis:

1. **App path at defaults (HEAD view):** Down on a commit opened the
   comparison (`showingDiff` true after the async git shows landed). Healthy.
2. **App path on the viewed branch, paced:** switch to `feature`, external
   plumbing commit, Down → preview opened, focus stayed `git`; Enter →
   focus transferred to `editor`, diff up. Healthy, exactly per the record
   [Commit selection previews without focus transfer](../../../../src/modules/git/git.invariants.md#commit-selection-previews-without-focus-transfer).
3. **Temporary diagnostic logging** in `showLogRowComparison` /
   `loadCommitFileDiff` under the failing smoke run (removed after, tree
   restored byte-identical): both the Down preview (gen 1) and the Enter
   activation (gen 2) reached `showComparison` with matching generations
   and real content (`prevLen=0 currLen=19` for the added `feat2.txt`).
   The smoke's SECOND Down+Enter pair never appeared in the git panel's
   log — because focus had already moved into the comparison.
4. **The closer, reproduced live twice:** inside the comparison, Enter is
   `GitComparisonContent` 'return' → `DiffView.openFull()` → `onOpenFull`
   → `Workspace.openFileInTab` → `releaseOccupying()` → `release()` →
   `showingDiff=false`, plus an empty `feat2.txt` tab (the file does not
   exist on checked-out `main`). That is both smoke failures at once:
   `showingDiff='false'` and the missing `'feat2 content line'`.

**Why the drift:** the smoke's drill-down section was written 2026-07-24
(`0ed61d66`). The selection-preview model (select previews, Enter
activates with focus transfer) landed 2026-07-26 (`f85e4eaa`). The section
was never updated. The brief's premise ("broken before #542") is CONFIRMED:
red reproduced at my dispatch base before any change.

## The change (1 file, +29/−7)

[scripts/smoke-git-log.sh](../../../../scripts/smoke-git-log.sh) — the
drill-down section now asserts the recorded contract directly:

- Down selects the commit → wait for the file row, the commit content in
  the preview, and `showingDiff=true`; assert `gitLogExpanded=1` and
  `focus=git` (preview must NOT transfer focus).
- Enter → wait for `focus=editor`; assert `showingDiff` stays true.
- Waits are conditions, never sleeps: new `wait_for_field` helper mirrors
  `wait_for_capture`; both text waits start false (feat2.txt exists only in
  the viewed branch's commit, so neither needle is pre-painted).
- A comment names the old defect so the arithmetic cannot silently drift
  back.

No app code changed. `git diff` against base touches only the smoke.

## Positive controls (both arms)

- **Plant 1** — preview disabled (`previewLogRow` no-op): four reds, all in
  the preview family ("changed file never rendered", "expansion count 0",
  "preview never showed the commit content", "preview did not open").
- **Plant 2** — activation without focus transfer: exactly one red ("Enter
  did not transfer focus (focus='git')"), everything else green.
- Plants removed; tree restored.

## Verification

- `bash scripts/smoke-git-log.sh`: **ALL-PASS three consecutive runs** —
  every family green, including the neighbor families the brief names
  (Esc-return to HEAD, viewed-branch freshness, mouse menu, read-only
  guarantee).
- `bunx tsc --noEmit; echo TSC=$?` → TSC=0.
- `bun test src/modules/git`: 120 pass, 0 fail.
- Neighbor smokes: `smoke-git-watch.sh` ALL-PASS, `smoke-git-blame.sh`
  ALL-PASS.
- Invariants checker `--all` and `--refs`: 0 problems, 1438 annotations
  resolve.

## Adversarial drive protocol (what was actually driven)

Warm DriveSession server on the smoke's exact fixture, real keys only.
Families: paced vs rapid Down+Enter interleavings (the rapid pair is where
the flat-row space shifts under the cursor while the lazy fetch is in
flight — driven, observed, app behaved consistently); the full smoke
sequence stepwise with state asserted after every key (index, expansion,
showingDiff, focus); the closing Enter inside the comparison (twice);
expansion of an EMPTY commit (files `[]` → no diff opens, by design — hit
via a contaminated fixture, kept as an edge observation); Esc-return,
menu-click, and read-only families via three full smoke runs. A smoke-only
change has no per-row cost, so scale parity is not implicated.

## Invariants in scope — enumerate and answer

From [git.invariants.md](../../../../src/modules/git/git.invariants.md):

| record | verdict |
|---|---|
| Commit selection previews without focus transfer | **upheld + strengthened** — the shell smoke now asserts preview-keeps-focus and Enter-transfers directly (before, only `smoke-git-log-harness.ts` did) |
| Commit expansion is lazy and windowed | upheld — driven: one by-SHA fetch on select, expansion count 1, loading→files transition observed |
| The commit log follows repository reality | upheld — freshness families green, unchanged |
| The log branch viewer is read-only | upheld — drill-down routes by SHA from the viewed branch, driven and asserted; read-only guarantee green |
| Git completions can arrive out of order; Filesystem notifications arrive in bursts; Only the newest Git request mutates state; History storage remains page bounded; Git command failures stay data; the two watcher records; Git row decoration stays within one row; Destructive operations require confirmation; the three blame records; A relative time reads in the largest fitting unit | untouched |

**Proposed contract edit (conductor confirms, not applied):** add
`bash scripts/smoke-git-log.sh` to the Verification line of *Commit
selection previews without focus transfer* — the shell smoke now exercises
it end to end.

## Bycatch (per the [AGENTS.md](../../../../AGENTS.md) taxonomy)

- **Comment/label drift, invariant implicated:**
  [DiffView.ts](../../../../src/modules/diff/DiffView.ts) lines 710 and 715
  hardcode `Base (HEAD)` / `Current (working)` for EVERY comparison. For a
  commit drill-down the base is `sha^` and the current side is the commit
  revision — both labels lie. Seen twice while driving ("Base (HEAD) —
  main.txt @ 8494a2d^ │ Current (working) — main.txt" for a commit diff).
  Implicates *Base and current stay unambiguous*
  ([diff.invariants.md](../../../../src/modules/diff/diff.invariants.md)).
- **Defect (suspect):** Enter or the header "Open current" inside a COMMIT
  comparison ([GitComparisonContent.ts](../../../../src/modules/git/GitComparisonContent.ts)
  `onOpenFull`) promotes `currentVersionPath` to a working-tree tab. When
  the file exists only in the viewed commit (non-checked-out branch), the
  tab opens EMPTY and a save would create the file. Reproduced twice by
  driving. "Open full" is right for working-tree diffs; for commit diffs it
  silently shows the wrong content. Not fixed — shared seam, design call.
- **None observed** in the other taxonomy classes (violated-in-function,
  distillation, generator drift, plain nonsense, contract-layer gaps).

## Coherence statement

Coherence-positive: the smoke now speaks the same model as the app's
recorded invariant and the harness smoke (one contract, three enforcers
agreeing), its waits are conditions per the wait law, and the drifted
arithmetic carries a comment naming why it was wrong. No app surface
changed, so the UX dialect is untouched.

## Artifacts check

Drive server stopped cleanly (`--stop`, twice — one per fixture). Scratch
fixture repos live under `/tmp/drill-543*` (recognizable names; not
deleted — deletion permission was declined once, and they are bounded at a
few KB). Diagnostic logging removed; `git diff` at base shows only the
smoke. The dispatch scaffolding file `BUILDER-FUNDAMENTALS` (`.md`, in the
worktree root) is left untracked.
No settings, defaults, or status keys changed.
