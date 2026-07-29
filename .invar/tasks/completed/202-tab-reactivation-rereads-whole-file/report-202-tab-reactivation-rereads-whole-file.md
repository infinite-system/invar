# READY — tab reactivation full-file rereads (#202)

## Outcome

Implemented and committed the bounded recently-active hydration repair.

- Commit: `ba27bbb Fix recent tab reactivation full-file rereads`
- Branch: `fleet/202-tab-reactivation-rereads-whole-file`
- Worktree: clean
- No terminal-module files touched.

`OpenBufferSet` now retains the two most recently active documents. A clean
document is dehydrated only when it leaves that constant-size window; dirty
documents remain live outside the clean budget. Suspending a workspace
dehydrates its clean warm documents, so inactive workspaces do not retain the
new budget.

## Falsifiable diagnosis

The required dirty-versus-clean drive confirmed the task's mechanism before
code changed.

- Two clean 500,000-line files: three `Control+Tab` reactivations took
  `107.008`, `111.952`, and `112.964` ms. `bufferTabCount=2` while
  `bufferLiveCount=1`, so each return reconstructed the document.
- Dirty retained arm on the same fixture: the return took `34.974` ms.
  While the dirty file was in the background, `bufferLiveCount=2`.

The clean/dirty asymmetry was therefore present and the diagnosis held.

## Driven result

Real PTY drives used the shared generated scale shape and the default
configuration.

- 100,000 lines: recent clean switches took `22.018`, `14.723`, and
  `18.097` ms.
- 500,000 lines: recent clean switches took `17.726`, `20.749`, and
  `12.406` ms.
- 500,000-line dirty return: `23.256` ms.
- Every recent clean drive held `bufferLiveCount=2`; no document was
  reconstructed.

The post-fix clean 500,000-line fingerprint now matches the retained dirty
arm instead of the pre-fix 107–113 ms reload arm.

Many-tab boundedness was driven through the existing 103-buffer PTY harness:

- `bufferTabCount=103`
- `bufferLiveCount=2`
- App-process RSS before opening tabs: `248440 kB`
- App-process RSS after opening 103 tabs: `253376 kB`
- Delta: `4936 kB` of light tab/session state while the heavy-document count
  remained fixed at two.

## Regression contracts and positive controls

- `OpenBufferSet.test.ts` measures full-document creation/read count across
  six recent switch cycles. The 10-line and 500,000-line arms both report
  zero reads: `[0, 0]`.
- Its permanent one-document-window control reports six reloads for six
  switches.
- Fault injection changed the production window from 2 to 1. The zero-read
  check exited `1`, reporting received `[6, 6]` versus expected `[0, 0]`.
  Restoring the window returned the focused checks to green.
- The 103-buffer PTY assertion was separately fault-injected with the same
  one-document window. It exited `1` with
  `FAIL 103 clean tabs retain two live documents (got 1)`. Restored, the
  harness exited `0` with `ALL-PASS`.

The project active-set record, editor dirty-retention record, workspace
flyweight record, and lifecycle architecture narrative were updated to state
the bounded warm set. The workspace invariant is now established by the
count and PTY evidence. Invariant review verdict: PASS — the bounded window
refines and strengthens the active-set discipline without allowing clean
storage to scale with tab count.

## Verification

Required standard verification:

- `bunx tsc --noEmit`: initial exit `2` exposed missing contextual parameter
  types in the new test seam; after adding the explicit
  `OpenBufferSetSeams` type, rerun exit `0`.
- `bun test`: exit `0` — 1,735 pass, 0 fail, 67,767 expectations across 260
  files.
- `bash scripts/conventions-gate.sh`: exit `0`.
- `bunx prettier --check .`: exit `0`.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`:
  exit `0` — 938 annotations and 67 lattice links resolved, 0 problems.

Additional task-specific checks:

- Final 100,000-line PTY drive: exit `0`.
- Final clean 500,000-line PTY drive: exit `0`.
- Final dirty 500,000-line PTY drive: exit `0`.
- Restored 103-buffer PTY harness: exit `0`.
- `git diff --check`: exit `0`.

## Bycatch

- `bun run drive --size 100000 --key Control+q` successfully made Invar exit
  with app exit code 0, but the drive front door then failed with exit 1
  because its default key completion waited for a post-quit frame. Observed
  once during fixture generation; not reproduced a second time. No change
  made because it is outside the tab-reactivation task.
# READY v2 — #202 (tab reactivation rereads the whole file)

## Outcome

Updated `scripts/harness/smoke-editor-harness.ts` to encode the bounded warm-set policy as an exact count contract: three clean tabs retain exactly two live documents.

The smoke now also returns the previously edited fixture to disk state before exercising the clean-tab contract. Without that cleanup, the first tab remained dirty and was correctly retained in addition to the two-document warm set.

No other smoke was changed.

## Reproduction and positive control

- Reproduced the combined-tree failure locally with `bun scripts/harness/smoke-editor-harness.ts`.
- Exit: 1.
- Failure: `flyweight keeps live documents 3 below tabs 3`.
- Replacing the old inequality with the new `bufferLiveCount === 2` publication condition initially remained red: it timed out while the deliberately dirty first tab kept the live count at 3. This demonstrated that the exact count check detects a non-clean three-tab setup.
- Added an observed `Control+z` transition back to `dirty === false` before opening the remaining tabs.
- Reran the same smoke; it passed with `flyweight keeps exactly two warm documents across 3 clean tabs`.

## Coverage ratchet

`bun scripts/check-coverage-ratchet.ts` passed:

- `coverage ratchet: inspected 322 files; no undeclared decrease against 831e5cf`
- The assertion replacement is count-neutral and changes a weaker relational policy check into the exact warm-window count.
- One condition-based clean-state wait was added.
- No assertion or wait count was weakened, so [project.coverage-deltas.md](../../../../project.coverage-deltas.md) was not changed.

## Verification

- `bun scripts/harness/smoke-editor-harness.ts` — PASS, `ALL-PASS` (also rerun after commit)
- `bun scripts/check-coverage-ratchet.ts` — PASS
- `bunx tsc --noEmit` — PASS
- `bun test` — PASS, 1,735 tests across 260 files
- `bash scripts/conventions-gate.sh` — PASS
- `bunx prettier --check .` — PASS
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` — PASS, 0 problems
- `git diff --check` — PASS

## Commit

`c9e40c9 Update editor smoke for bounded warm tabs`

Branch: `fleet/202-tab-reactivation-rereads-whole-file`

The worktree is clean.

## Bycatch

None observed.
