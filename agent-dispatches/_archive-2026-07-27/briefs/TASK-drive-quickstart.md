# TASK — #137: a one-command exploratory driver, so the inner loop has no on-ramp

Work ONLY in `/tmp/conductor-drivequick` (branch `feat-drive-quickstart`, off latest main).
Do NOT run `scripts/merge-gate.sh`; do NOT push/merge/tag/delete. Report to
`/tmp/drivequick-READY.md`. `export PATH=$HOME/.bun/bin:$PATH`.

## The need, and the evidence it is real

The repo's primary law is DRIVE THE REAL APP FIRST — reproduce by driving before writing any
assertion. It works: every substantive fix this session came from driving, and the two most
valuable findings (a diff scrollbar that had never been themed, an overview ruler publishing a
one-row rectangle) were invisible to reading code.

But the on-ramp is not free. Builders repeatedly spend their first minutes assembling a driver:
open a PTY, boot the app, wait for a settled frame, open a file, send input, dump the grid. Several
this session wrote near-identical scaffolding, and one wasted ten runs because a fresh worktree had
no `node_modules` before its harness could even start.

**Deliverable: one command that drops you into a driven, real app with a printed grid, and a short
doc that says how to poke it.** Reduce the on-ramp to a single line, so "drive it first" stops
having a setup cost that competes with reading code.

## What it must do

- **One command, no arguments required.** Boot the real app in a PTY at a sensible default geometry
  with a small default workspace, wait for a SETTLED frame (never a fixed sleep), and print the
  grid.
- **Optional arguments for the things that actually vary**: the file or workspace to open, terminal
  geometry, and a fixture SIZE so scale parity is one flag rather than a fixture-authoring exercise.
  If #136's shared fixture generator does not exist yet, generate into `tmp/` (already gitignored)
  and say in the report that a shared generator would replace it.
- **Send input and re-print.** Keystrokes, wheel notches, and a mouse click at minimum — the three
  things every investigation needs. Accept them as a simple script or repeated flags; do not invent
  a language.
- **Print the published status/probe keys** alongside the grid. Half of this session's diagnoses
  turned on a status key, and finding the right key name is itself a research task today.
- **Exit non-zero and say what it was waiting for if the app never settles.** A driver whose failure
  mode is a silent hang is worse than no driver.

## What it must NOT do

- **Do not re-roll the harness.** `PtyTestDriver`, the frame/grid probe, and the settle-wait already
  exist and are the authorities. This is a thin ergonomic front door onto them. If you find
  yourself duplicating wait logic, stop — the duplicate will drift and then lie.
- **Do not add assertions.** This is an exploration tool. Assertions belong in contracts, and a
  driver that asserts invites people to treat its output as a verdict.
- **Do not make it a gate step.** It has no pass/fail semantics.

## The doc

Short, in the repo, linked from `AGENTS.md` near the drive-first section. Cover: the one command,
the three or four flags, how to read the grid output, how to find a status key, and one worked
example of reproducing a real bug from this session (the diff scrollbar or the ruler geometry are
both good, and both are recorded).

Keep it to what a builder needs in its first two minutes. A long document is another on-ramp.

## Verification — quote exact exit codes

Drive it yourself and paste real output: default invocation, one with a file argument, one at a
large fixture size, one sending input, and one deliberately pointed at something that will never
settle (to show the failure message). Plus `bunx tsc --noEmit`, `bun test`,
`bash scripts/conventions-gate.sh`,
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`,
`bun scripts/check-coverage-ratchet.ts`. Never read `$?` after a pipeline.

Full descriptive identifier names, 80 columns, ivue conventions (subclass `$Class`, never `Class`).
Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <file>`; leave the tree clean.
