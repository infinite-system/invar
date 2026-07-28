# TASK — #159: panel-chrome passed only on retry. Find the mechanism.

Work ONLY in `/tmp/conductor-panelchrome` (branch `fix-panel-chrome-flake`, cut off latest main).
Do NOT run `scripts/merge-gate.sh`; do NOT push/merge/tag/delete. Report to
`/tmp/panelchrome-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`, then `bun install` FIRST — a fresh
worktree has no `node_modules` and every preflight will red on unresolved imports until you do.

**THE MACHINE IS QUIET AND MUST STAY THAT WAY.** No other builder is running, deliberately, because
this measurement is worthless under contention. Do not launch parallel work.

## What happened

The gate that verified fourteen commits (`d5ba738`) exited 0 and printed ALL-PASS, but its retry
tally declared the green as debt:

    RETRY TALLY: 1 step(s) PASSED ONLY ON RETRY — a retried pass is a FLAKE, not a green.
    RETRY TALLY:   smoke: panel-chrome harness

The failing attempt is preserved at `/tmp/panel-chrome-flake-evidence.log`. Its failure:

    error: Timed out waiting for the Agent 2 list close removes only that instance
           at /tmp/invar-panel-chrome-Eex1Hv/status.json

Earlier assertions in the same run PASSED (e.g. "Close uses the ordinary theme foreground and never
the error red"), so the harness reached the agent-list phase before wedging. It is a wait on a
PUBLISHED CONDITION that never arrived — not an assertion mismatch.

## Why this one is not just another flake

`panel-chrome` is NOT in the flake census. The known intermittents are audio-narration (#141),
bounded-list-popup (#142), agent-permissions (#109) and terminal-follow (#124). This name appears
nowhere in `project.conductor.md`, so it is either NEW or newly visible. The user's instruction was
"where there is smoke there is fire" — treat it as a real defect until measurement says otherwise.

## Step 1 — REPRODUCE, and report a SEQUENCE not a rate

Run the panel-chrome harness N times (N >= 20) and print the ordered pass/fail sequence.

**A rate reads as randomness; a sequence names a cause.** The narration flake was solved exactly
this way — a perfect 0,1 alternation identified wall-clock phase instantly, where "50% failure"
would have told you nothing. If the sequence has structure (alternating, periodic, first-run-only,
after-N-runs), find what shares that period.

If it will not reproduce in 20 runs, say so plainly and raise N once. Do NOT declare it fixed by
absence — a flake that hides is not a flake that is gone.

## Step 2 — POPULATION SEPARATION against the suspected cause

`#156` (tasks capability) landed in the same batch and touches the terminal/pane surface:
`TerminalPaneContent.ts`, `TerminalFactory.ts`, `OpenPtyBackend.ts`, plus a `Bootstrap` hookup that
can launch task terminals on folderOpen. A capability that creates additional panes could plausibly
make "closing Agent 2 removes only that instance" racier.

**THAT IS A HYPOTHESIS, NOT A CAUSE.** Five structural diagnoses were overturned by measurement in
the preceding session; one of them was mine, built and shipped as a fix before it was refuted. Run
the experiment before believing it:

- **post-#156 tree:** `d5ba738` (or current main — say which you used)
- **pre-#156 tree:** `186f2d8` — that is `b0b15b2^1`, main immediately before the tasks merge

Same N, same machine, same quiet. If it flakes only after #156, the separation is clean and the
interaction is real. If it flakes on both, **#156 is exonerated** and this is a pre-existing race
the gate has been hiding behind retries — which is a more serious finding, not a lesser one.

## Step 3 — mechanism, then fix

Name the interleaving. "Closing Agent 2 removes only that instance" is a condition published to
`status.json`; the wait timed out, so either the condition never becomes true in some ordering, or
it becomes true and is then overwritten before the poll observes it. Those are different defects
with different fixes — distinguish them with evidence, not preference.

## Constraints

- **NEVER widen the timeout.** The wait is on a published condition. If the condition can
  legitimately fail to arrive, the harness must OBSERVE THAT instead of waiting longer.
- Positive control mandatory: after fixing, re-introduce the defect (or plant the interleaving) and
  quote the red, then the green. A wait that can no longer fail is worse than the flake.
- If the fix is in the app rather than the harness, that is the better outcome — say so loudly.

## The class question, worth one paragraph in your report

`#109` (agent-permissions), `#124` (terminal-follow) and this one ALL wait on published conditions
and all flake intermittently. `#158` turned out to be a wait whose condition was UNREACHABLE by
construction — a probe keyed to the fourteenth moving frame of a glide that no longer produced
fourteen. If this one is the same shape — a condition that can never arrive in some interleaving,
rather than one that merely arrives late — say so, because then the three are one class and should
be fixed as one.

## Repo law

`export let Class = $Class`; the `Static()` wrapper lives at the `$Class` anchor
(`$Class = Static($Raw); Class = $Class`), never `Class = Static($Class)`; `Reactive()` is exempt
because it mutates in place. conventions-gate rules 1.8/1.9/1.95 enforce all three across `src` and
`scripts`. Invariant records live at `src/modules/<domain>/<domain>.invariants.md` and are cited by
ROOT-RELATIVE path. Full descriptive identifier names, 80 columns.

## Verification — quote exact exit codes, never read `$?` after a pipeline

`bunx tsc --noEmit`, `bun test`, `bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` (at or above 884
annotations / 67 lattice links / 0 problems), `bun scripts/check-coverage-ratchet.ts`, plus the
N-run sequences from steps 1 and 2.

Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
