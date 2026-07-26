# project.tasks.md — the conductor's task ledger (for review)

The conductor's task list lives in a session, not on disk, so it dies with the session. This file is
the durable copy: every task the current campaign has tracked, its status, and where the evidence is.
In-flight watch paths (live transcripts, worktrees, per-builder briefs) are in
`project.delegation-log.md`; landed branches are tagged `finished/<branch>` and never deleted.

Commits are named ONLY where verified during this session. Older landings say so and point at the
`finished/*` tag namespace rather than guessing a SHA — a wrong SHA in a ledger is worse than none.

Last written: 2026-07-25 ~21:00 (overnight run)

## The finding that reframed the night

A census of every gate log still on disk: **121 gate runs, 97 green, 33 masked retries.** Roughly a
QUARTER of runs contained an intermittent failure that `retry-once-on-timeout` rescued, so a ~27%-flaky
suite read as a healthy one. Ranked by retries: workspace-tabs 12 (+5 hard fails), pixel-preview 4,
agent-permissions 4, paste 3, editor 3 (+1 fail), move-line 2 (+2 fails), then completion/tabs/layout/
agent-engine-switch at 1 each.

This changes the meaning of "make the gate faster": parallelism was never the bottleneck —
TRUSTWORTHINESS was, because each flake costs a five-minute re-run and conceals itself while doing it.
Three fragility classes are now named and made unwritable by a widened invariant (`8f6fe7b`), and they
are all the same defect in different clothes — **a wait that is not a condition**:

1. clock-bound absence windows (`assertNoCompleteFrameEmittedFor`) → #76, content invariance;
2. wait predicates the pre-action state already satisfies (existence/type checks) → #80, fixed once;
3. bare sleeps standing in for condition waits → #80, 21 sites censused.

## In flight

| # | task | branch | status |
| --- | --- | --- | --- |
| 78 | Workspace activation must cost O(depth), not O(repo size) | `perf-workspace-activation` | GATING; builder done, rebased, conflict resolved, own smoke 3/3 green |
| 79 | Overlay wheel scrolling: one generator owns the wheel-to-frame obligation | `fix-overlay-wheel-scroll` | builder active — 8 files incl. `ScrollableTextViewport` (the generator), no commit yet |

## Pending — ordered by what I would do next

| # | task | why it is not done yet |
| --- | --- | --- |
| 80 | Every harness wait observes a condition (no vacuous predicates, no fixed sleeps) | THE flake class, census done and ranked; pixel-preview plan recorded in full |
| 76 | Replace clock-based absence windows with content invariance | collapses the gate's serial tail into the pool — minutes, not seconds. Brief written at `/tmp/TASK-content-invariance.md` |
| 68 | Icon vocabulary pass: activity-bar glyphs + panel heading controls | user-requested; needs rendered previews for veto before a vocabulary lands |
| 72 | Code-aware wrap break opportunities: one generator, prose and code profiles | user-requested (letter breakoffs in the editor) |
| 62 | Parameter-count sweep: >3 args → ports object (hot paths exempt) | user-requested; `buildRootView` was the trigger |
| 64 | Follow-injected turns can strand the spinner | correctness follow-up to the terminal-follow setting |
| 73 | Type-aware audit for dropped reactive signals | user rejected both a syntactic lint and a `track()` helper, so it must be type-aware |
| 75 | In-gate app crash (exit 1) with no diagnosable reason | instrumentation landed (`3efee3d`); waiting for a recurrence to read |
| 77 | Close the coverage-ratchet's remaining holes | deliberately NOT dispatched while user-reported bugs are unmerged; four holes now, see below |
| 59 | Prettier whole-repo reformat + blank-line rule + gate enforcement | must land LAST — touches every file, conflicts with every open branch |
| 31 | Post-campaign: getter census → scoped invalidation | performance follow-up, no user-visible symptom yet |
| 33 | Capsule arc: per-workspace agent/terminal/membrane | architecture arc, large |
| 34 | Plugin-canvas refactor: Workspace stops knowing Git | architecture arc, large |
| 35 | Structure navigator pane — first new plugin citizen | depends on 34 |
| 46 | TerminalObserver reverse presence — waves 3-4 | partially delivered; remaining waves not started |

## Completed — verified commits from this session

| # | task | landed |
| --- | --- | --- |
| — | Coverage ratchet + retry tally + widened wait invariant | `66dbb36`, `4c31bee`, `8f6fe7b` |
| — | workspace-tabs fixture isolation (the #1 flake, 12 retries) | `132e2c3` |
| — | editor-harness stale wait predicate (the #5 flake) | `47a6fb2` |
| 70 | Nothing paints above a modal (cursor + terminal graphics) | `6156999` + contract repair `47802a8` |
| 66 | Breadcrumb segment picker with drill-in | `3a1f2d1` (also closed the last text-input census entry) |
| 40 | Gate parallel smoke pool + serial quiet tail | `5dd8575` (4m50s vs 8m03s serial) |
| 74 | Bound the harness's diagnostic byte retention | `3efee3d` |
| 63 | Overlay dialogs: scrollbar, fit-on-resize, close button, click-outside | click-outside `dcd2f1e` |
| 69 | One text-input primitive installed everywhere | `2fbd5c8` |
| 65 | Vertical scrollbar thumb breathing (regression) | `ccc8c0e`, culprit bisected to `341590c` |
| 67 | Invar agent has no skills/CLAUDE.md | `70a438b` |
| 44 | Interface filename convention `X.interface.ts` | `8aa0eff` |

Landed earlier in the campaign (commits in the `finished/*` tags and `project.delegation-log.md`):
#29, #30, #32, #36, #37, #38, #39, #41, #42, #43, #45, #47, #48, #49, #50, #51, #52, #53, #54, #55,
#56, #57, #58, #60, #61, #71.

## Corrections made to my own claims (kept deliberately)

- **Activation cost overestimated ~3x.** I projected one ignore-query subprocess per visited directory
  (662/506/151, ~930 ms); measured reality was 216/129/33 and 280 ms, because the old walk already
  skipped ignore queries for leaf directories. The defect was real, the magnitude was mine.
- **A frame-ordering design I proposed was unsound** and was killed by an ESTABLISHED invariant
  (`Harness waits observe conditions not frame ordinals`) whose rejected-alternatives section names the
  reason: coalescing changes ordinals, and an action whose target is already painted emits no frame.
  The replacement is content invariance.
- **I blamed contention for a red that was intrinsic.** `smoke-workspace-tabs` failed 1-of-2 solo at
  load 0.28. The discriminator is a solo re-run, and it costs about a minute.
- **My first fixture fix silently deleted coverage.** Shortening a directory prefix removed the
  precondition of an ellipsis-capping assertion — the assertion still ran and could no longer fail.
  That is a ratchet hole a counter cannot see (#77, hole 2).

## How to check up on any of these

- Live builder transcript, worktree, brief, and report path: `project.delegation-log.md` (newest section).
- A landed branch's exact change: `git show finished/<branch>` — branches are parked, never deleted.
- Why a decision was made: `project.decisions.md`. What the gate enforces and why: the comments in
  `scripts/merge-gate.sh`.
- Orchestration lessons: `project.conductor.md`, and the long-form log in
  `~/dev/ibr/Skills/Orchestration Lessons.md`.
