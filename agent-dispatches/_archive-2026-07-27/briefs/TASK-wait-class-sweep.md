# TASK — Sweep the WHOLE harness for waits that do not observe what their assertion reads (#80)

You are a builder on the Invar terminal IDE. Work ONLY in this worktree. Do NOT run
`scripts/merge-gate.sh`, do NOT push, merge, tag, or delete branches — the conductor does that.
Commit to this branch when done and report.

## Why this is urgent, not tidy

Five concurrent builders are running tonight, which loads the machine, and EVERY gate run since has gone
red on a DIFFERENT smoke. Six instances of ONE defect class have been found and fixed by hand in three
hours. A migrating failure means the class is unfixed and only instances were removed — and because the
single gate slot is serialized, this class is currently blocking every branch in the queue, not just one.

Fixing instances one gate at a time costs ~2.5 minutes per instance and does not converge. Sweep the class.

## The class

**A wait must observe the same state its assertion reads.** Four sub-classes, all seen for real:

1. **Adjacent-state wait.** The wait observes something that arrives NEAR the target but not the target.
   Fixed tonight: `smoke-terminal-backpressure` awaited quiescence then asserted the shell heading text;
   `smoke-scrollbars` awaited the FILE TEXT then asserted the editor vertical thumb, the horizontal
   thumb, and (third site) awaited the diff HEADERS then required the diff bar in every collected frame.
   In that last case the diagnostics showed column 119 holding diff TEXT — a frame that PREDATED the bar,
   which is the opposite failure from the bar vanishing, yet produces the identical message.
2. **Vacuous predicate.** The pre-action state already satisfies the wait. Fixed tonight:
   `smoke-gutter-diff` sent `Control+s` and then awaited `markerHasForeground(...modifiedColor)` — the
   exact condition asserted BEFORE the save, so it proved nothing about the save.
3. **Action depending on unobserved EXTERNAL state (new sub-class, found tonight).** After that vacuous
   save wait, `git add` + `git commit` ran against a file whose write had not landed: git exited 1 with
   "nothing to commit". The dependency was the DISK, and nothing observed it. Look for every fixture
   operation — git, file writes, mkdir, chmod, settings.json — that depends on state produced
   asynchronously by the app.
4. **Bare sleep** between a drive and its assertion. A sleep INSIDE a polling loop with its own deadline
   is legitimate (that is the poll interval); a bare one is the defect.

## What to do

1. **Audit every file** in `scripts/harness/` plus the shell smokes in `scripts/smoke-*.sh`. For each
   assertion, ask: did the immediately preceding wait observe THIS state? Report the census — the count
   of sites inspected and the count found — because a sweep that reports only fixes cannot be audited.
2. **Fix each one** so the wait observes exactly what the assertion reads. Prefer awaiting the target
   condition; where the dependency is external (disk, git, a spawned process), poll it with a DEADLINE
   and a named `requireCondition` on the result, exactly as the gutter-diff fix now does.
3. **Do not weaken any claim to make it pass.** Every one of tonight's fixes kept its assertion identical
   and only corrected what was waited for. If you find an assertion you believe is genuinely wrong rather
   than badly sequenced, STOP and report it rather than relaxing it.
4. **Declare coverage deltas with counts** in `coverage-deltas.md` — turning an assertion into a wait
   moves the numbers, and the ratchet will refuse an undeclared decrease. Append rows; do not rewrite the
   table, since other branches are editing it tonight.
5. **Leave a checker if you can find a mechanical tell.** Some of these are detectable: an `awaitSnapshot`
   or `awaitGridCondition` whose predicate is textually identical to a predicate already asserted earlier
   in the same function is a vacuous-predicate candidate; a `runGit`/file-write immediately after a
   `sendKeys('Control+s')` with no intervening disk observation is a sub-class-3 candidate. Report-only
   is fine and preferable to a false-positive gate rule. If no honest mechanical tell exists, say so —
   do not invent a rule that produces confident false positives over a reactive codebase.

## Verification

- Run EVERY smoke you touch three times each, and report exact exit codes in a table.
- Run them once more with the machine deliberately loaded (start a `bun test` in parallel, or run two
  smokes concurrently) — load is what exposes this class, so a quiet-machine pass proves little.
- `bunx tsc --noEmit`, `bun test`, `bun scripts/check-file-grammar.ts`, both invariant checker passes,
  `bash scripts/conventions-gate.sh`, `bun scripts/check-coverage-ratchet.ts`,
  `bash scripts/behavioral-contracts.sh` — exact exit codes, never a log tail.
- Refine the invariant record *Harness waits observe conditions not frame ordinals* to name sub-class 3
  (external dependencies) in its Scope and Impossible-if-true. Keep its Rejected-alternatives intact:
  frame ORDERING was already rejected and must not come back.

## Rules

- Full descriptive identifier names, no abbreviations. `.prettierrc`, 80 columns.
- STAY INSIDE `scripts/`. Four other builders are working in `src/modules/{workspace,git,ui,theme,agent}`
  tonight; product edits will conflict. If a harness fix genuinely requires a product change, report it
  instead of making it.
- Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <message-file>`. Leave the worktree
  clean; `git ls-files | grep '^TASK'` must return nothing.

## Report to /tmp/wait-class-sweep-READY.md

The census (sites inspected / defects found, by sub-class); every fix with its file and what it now
awaits; the loaded-machine run results; whether a mechanical tell exists and what it flags; and any
assertion you believe is wrong rather than mis-sequenced.
