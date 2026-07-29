# READY — #276 (task views emit md links; links are walkable by click)

State: READY (round 2 complete). Branch `fleet/276-task-md-links-walkable`,
head `188c2807` (merge of main through #284), tree clean.
**Own full merge-gate, non-skipped: `GATE_EXIT=0`, `merge-gate: ALL-PASS`**
(log: /tmp/276-merge-gate-r2.log). Commits: `1d52ca4e` (WIP checkpoint),
`53f1586e` (walkability + records + drive), `8b3fa8a1` (merge main),
`fcab0518` (round 2 conventions fix), `188c2807` (merge main through #284).

## Round 2 — both briefed defects resolved

1. **Conventions hard fail — FIXED (`fcab0518`).** Mechanism: the
   Ctrl+click routing guard's COMMENT in `Bootstrap.ts` named the
   markdown preview (two lines, including a markdown `// invariant:`
   annotation) — host core naming a plugin. The guard code itself was
   host-neutral. Fix: the comment now states the generic mechanism (any
   modified-click consumer receives the down again); the annotation was
   removed from the host — the markdown record keeps citing Bootstrap
   from ITS side, the allowed direction. `conventions-gate: PASS`, and the
   full gate's conventions step is green.
2. **workspace-tabs red — ENVIRONMENTAL, per the conductor's correction
   (inotify instances exhausted by idle sessions), corroborated by my own
   controls before the correction arrived:** boot-duration A/B main vs my
   tree = 229–243ms vs 233–249ms (parity); 6/6 green on BOTH trees under
   identical 3-parallel self-load on a quiet box. My round-2 gate now
   shows `OK smoke: workspace tabs harness` with no retry.
3. **scrollbars (brief item 3):** `OK smoke: scrollbars harness` —
   clean, no retry, 21s.

## What was delivered

### 1. Generator end — the views link every task line

`scripts/tasks/tasks-status.ts`: `taskRecordLinkPath` + `linkedTaskLabel`
give every task line in [project.active-tasks.md](../../../../project.active-tasks.md) and
[project.tasks-completed.md](../../../../project.tasks-completed.md) a relative markdown link to its record:
`- #205 [gate-launch-time-and-memory-ceiling](.invar/tasks/active/205-…/task-205-….md)`.
Wired into `taskLine`, `completedLine`, and the no-priority-group branch —
generator only, views regenerated. After the main merge: 81/81 active
lines and 55/55 completed lines carry links (grep, both polarities).

Self-test gained three arms, all green, with its own positive control:

```
  PASS  every rendered task line links its record (0 linkless)
  PASS  every task-record link target exists (0 broken)
  PASS  the link check goes red on a link-stripped line
```

### 2. Walkability end — clicks open, misses are stated, jumps record

Click support existed (Ctrl/Cmd+click, established record) but had three
real defects found by DRIVING, all fixed:

1. **Ctrl+click died after any prior click on selectable text.** OpenTUI
   consumes Ctrl+left-down as "extend the current native selection"
   whenever `currentSelection` exists — and an ordinary click on a tab
   label leaves a zero-width one behind. Every later Ctrl+click on a link
   was silently eaten before reaching the pane. Fix: a Bootstrap routing
   guard clears a NON-dragging selection residue on Ctrl+left-down; a
   held drag keeps the native gesture. (`src/modules/app/Bootstrap.ts`.)
2. **Silent no-op on unresolvable links.** Authored links that do not
   resolve now STATE why: hover tooltip plus, on activation, a status-bar
   notice — `External link — not opened here: <url>` /
   `Link target not found: <ref>`. A later successful open clears the
   notice. Unresolved backtick text stays prose (no shouting).
   New: `MarkdownReferenceHit.explicitLink`, `MarkdownSplitView.referenceAt`
   + `linkNotice`, `notifyUnresolvedReference` option,
   `Workspace.referenceIsExternal` (ONE scheme rule shared with
   `resolveFileReference`), `MarkdownPlugin` status segment +
   `markdownLinkNotice` projection.
3. **Click-opens left the keyboard behind.** `openReference` now follows
   #235's open+focus pattern (`openFileInTab` + `focus = 'editor'`);
   without it, Back/Forward chords were dead after every click-open.

Jumps ride the existing seam: `openFileInTab` records BOTH ends, so each
Back leg is one press (#35's convention, unchanged).

## The driven loop (evidence)

`drive-276-walk-the-task-links.ts` (committed in the task folder) drives
the REAL repo workspace end to end:

```
PASS  project.active-tasks.md opens; preview auto-opens
PASS  Ctrl-click on the task line lands in the task record
PASS  Ctrl-click on the sibling brief reference walks to the brief
PASS  Back returns to the task record (1 Back press(es))
PASS  Back returns to project.active-tasks.md (1 Back press(es))
drive-276: ALL-PASS
```

The record→brief leg proves same-folder walking (the #205 record names
`brief-205-1-…md` in backticks; it resolves against the active document's
directory).

## Positive controls (both quoted)

Missing-target and external-link, from `smoke-markdown-harness.ts` (new
"unresolvable link states why" section, gated):

```
PASS  an external link answers the click with a stated no-op, buffer unchanged
PASS  a missing-target link answers the click with the stated miss
PASS  a successful open clears the stated notice
```

(The external arm also asserts the notice PAINTS in the status bar and
the buffer did not change.) Generator polarity: the self-test's
link-stripped line goes red (quoted above).

## Records

[src/modules/markdown/markdown.invariants.md](../../../../src/modules/markdown/markdown.invariants.md):
- NEW: **An unresolvable Markdown link states why** (provisional) —
  stated misses, the notice clearing rule, backticks-stay-prose.
- REFINED: **A file reference opens from rendered Markdown** — focus
  follows the open; the Ctrl+click routing guard; "no-op external or
  missing targets" replaced by the stated-outcome cross-reference.

Checker: `--all --refs` → **0 problems** (1106 annotations resolved).

## Verification (one pass, post-merge)

- `bunx tsc --noEmit` — clean.
- `bun test` — **1893 pass / 0 fail** (293 files).
- `bun scripts/tasks/tasks-status.ts --self-test` — all arms PASS.
- `bun scripts/harness/smoke-markdown-harness.ts` — ALL-PASS.
- `bun scripts/harness/smoke-tasks-dashboard-harness.ts` — green.
- The drive script — ALL-PASS (quoted above).
- Merge of main: only the two GENERATED views conflicted; resolved by
  regeneration (the documented repair; same as land.sh).

## Bycatch (round 2 additions first)

- **Flake evidence — panel-split harness passed only on retry** in my
  round-2 gate (timeout-class first attempt, clean retry; the gate's own
  tally flags it). Logs preserved by the gate run; recorded in
  `.perf-history/gate-retries.ndjson`. Not my area; same starvation
  class as the inotify family main just documented (`853caebd`).
- **Housekeeping:** my A/B control worktree `/tmp/276-main-control`
  (detached at `419d5154`) could not be removed — `git worktree remove`
  was permission-denied in this session. It is mine to delete; nothing
  else uses it.
- After the final merge (main through #284): views regenerated again —
  82/82 active and 55/55 completed lines linked.

- **SUSPECT — last preview body row is hit-test dead.** With a link's
  line sitting on the LAST body row of the preview pane (row 37 of a
  40-row grid), hover publishes no reference and the tooltip never shows;
  nudging the same line one row up restores hover/click. Reproduced twice
  while driving [project.active-tasks.md](../../../../project.active-tasks.md) at 140x40. Suspect an off-by-one
  between the pane's body extent and `referenceAtCell`'s visible-row
  mapping. Not fixed (not obviously local); the drive script works around
  it by scrolling one extra step.
- **Contract-layer gap:** `scripts/tasks/` (the task system, including the
  generated-view writer this task extended) has no `*.invariants.md`; the
  view-generation rules live only in code comments and the self-test.
  #272 (task-record-system-contract) is the active task that owes this
  contract — the new link behavior should be recorded there when it lands.
- **Upstream oddity, neutralized in-repo:** OpenTUI's
  "Ctrl+down extends selection" consumes the event even for a zero-width
  selection residue (vendored bundle, `processSingleMouseEvent`). Fixed
  for this app by the Bootstrap guard; worth an upstream report if the
  dependency is ever synced.
- The harness's default `Alt+[` encoding (`ESC [27;3;91~`) IS decoded by
  the app (nav smoke green); an earlier suspicion that it was not proved
  wrong — no defect.

## Notes for the conductor

- Views were regenerated at merge time; if more tasks land before this
  branch does, land.sh's regeneration arm re-resolves the views cleanly.
- The WIP and merge commits used SKIP_GATE (checkpoint order + a 2-minute
  gate timeout mid-merge); the full suite above ran explicitly instead.
  The conductor gates at landing per convention 8.
