# TASK — Plugin canvas: Workspace stops knowing Git

Branch: create `refactor-plugin-canvas-git` from `origin/main`.
Worktree: assigned at dispatch. Do not touch any other directory.

This is a USER-DIRECTED architecture inversion and the highest-risk change in the repo, because
everything hangs off `Workspace`'s lifecycle. Read this whole brief before editing anything. If the
design here turns out to be wrong somewhere, SAY SO in the report rather than half-applying it.

## The thesis: this dissolves a bug class, it is not a tidiness exercise

Today `Workspace` carries git built-in and hands it everything. `src/modules/workspace/Workspace.ts`
imports `GitWatcher` and `GitBlameCache` directly, constructs `gitPanel`, and owns `createGit`,
`createGitWatcher`, and their teardown in `dispose()`/`resumeOwnedResources()`.

That host-centric shape GENERATED a real bug: the gutter-diff stale-head defect existed because
`Workspace` holds ONE `activeHeadText` slot, so document identity had to be checked by hand — and was
not. It was fixed by adding a guard. Under this inversion the same bug becomes UNWRITABLE rather than
guarded: a plugin owns per-document state keyed by a STABLE DOCUMENT HANDLE, so there is no single
shared slot to confuse in the first place.

That is the test of whether this refactor succeeded. Not "is there an abstraction" — abstraction is
cheap and usually wrong. The question is whether the class of bug can still be expressed.

## The inversion

After this change, `GitPlugin` carries its own behaviour — head tracking, diff projection, blame — and
ASKS through narrow contribution ports. The host offers ports; it does not know what git is.

## The four contribution surfaces, each justified by TWO existing customers

Do not invent a surface with one customer. Each of these has two, which is why it is a seam and not a
guess:

1. **Document lifecycle and identity port.** `opened` / `became-active` / `closed`, carrying STABLE
   DOCUMENT HANDLES. Plugins key their state by handle. This is the structural bug-killer above.
   Customers: git head tracking, and LSP document sync.
2. **Gutter decoration contribution point.** Plugins register per-line marks per document. Customers
   TODAY: `gutterDiffByLine` (git) AND `diagnosticsByLine` (lsp). The same illegal host-owned shape
   appearing twice IS the seam announcing itself — that is the evidence this port is real.
3. **Status-bar segment contribution.** Customers: git blame, and the existing non-git segments.
4. **Panes and popups.** Already landed as the `PaneContent`/`PanelHost` and `BoundedListPopup` seams;
   reuse them, do not build a parallel mechanism.

## The done-test, which is mechanical

1. `grep` `src/modules/workspace/Workspace.ts` (and the app core) for git → NOTHING. No import, no
   type reference, no construction, no field.
2. Then GATE-ENFORCE it: add a checker rule in the style of the existing report-only censuses in
   `scripts/conventions-gate.sh` so that core naming a plugin fails the gate. Start report-only if you
   must, but state clearly in the report whether it is enforcing or reporting.
3. The gutter-diff and diagnostics projections both arrive through the contribution point, with all
   their existing smokes green.

## Properties you MUST NOT regress (all landed within the last day)

- **Activation is O(depth), not O(repo size).** `GitWatcher` does a level-order walk with ONE bulk
  `git check-ignore` per depth, spawns asynchronously, and yields between levels. Measured: 0.145 ms
  synchronous on the switch path, 9/8/6 ignore-query subprocesses. The plugin now owns this lifecycle —
  keep the numbers. Re-measure and report them.
- **N open workspaces do not cost N live GitWatchers.** Suspension disposes; the plugin must preserve
  that bound and its invariant record.
- **The paint barrier.** Establishment, reconciliation, and `git.refresh()` await the next painted frame
  so a switch is view-only. Keep it, including the stale-watcher identity check that stops deferred work
  applying after another switch.
- The gutter-diff cross-document guard's BEHAVIOUR must survive even as its need disappears: a diff must
  never render another document's head text.

## Sequencing note

The task record says this is fused with the capsule track (#33) as ONE Workspace surgery rather than
two. Do the git extraction cleanly; if you find yourself needing a membrane/capsule concept to finish,
STOP and report what you needed rather than inventing half of #33.

## Verification — by driving, and with a counterfactual

- The existing git smokes (blame, watch, log, gutter-diff) green THREE times each.
- The diagnostics gutter proven through the SAME port as the diff gutter — one drive showing both kinds
  of mark on one document.
- A counterfactual for the bug class: show that the cross-document diff error cannot be expressed —
  either by a type-level argument you state explicitly, or by a test that fails to compile / cannot be
  written. If neither is possible, say plainly that the class is still expressible and the inversion is
  incomplete.
- Re-measure activation: synchronous cost on the switch path and ignore-query subprocess counts, tiny
  versus wide fixture, as the existing workspace-tabs smoke already does.
- `bash scripts/behavioral-contracts.sh` green including `idle-quiescence`.

## House rules (non-negotiable)

- Full descriptive identifier names, no abbreviations. Name the STATE established, not the steps taken.
- Class-first ivue conventions: `Static()`/`Reactive()`, `export let Class` mutable binding, `protected`
  floor, late-read discipline, file name follows class, `X.interface.ts` for contracts.
- `.prettierrc` (80 columns).
- Invariant records: the four ports each need one, with ALL fields including **Scope**. The most
  important is the document-handle one — its Impossible-if-true should name the bug class this dissolves.
  Verify with EXIT CODES, never a log tail.
- Run and report exact exit codes: `bunx tsc --noEmit`, `bun test`,
  `bun scripts/check-file-grammar.ts`, both invariant checker passes, `bash scripts/conventions-gate.sh`,
  `bun scripts/check-coverage-ratchet.ts`, `bash scripts/behavioral-contracts.sh`, and every smoke you
  touch three times.
- Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <message-file>` (use `-F`: backticks in
  a `-m` string get executed by the shell). Do NOT run the merge gate, push, merge, tag, or delete a
  branch — the conductor does that.
- Leave the worktree CLEAN; `git ls-files | grep '^TASK'` must return nothing.
- Report to `/tmp/plugin-canvas-git-READY.md`: the four ports and their two customers each, the grep
  result proving core is clean, whether the new rule enforces or reports, the re-measured activation
  numbers, the counterfactual for the bug class, and anything you could not prove or had to leave for
  #33.
