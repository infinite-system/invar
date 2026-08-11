# READY 542 — log-tip observation gate restored

**Branch:** `fleet/542-log-tip-observation-gate-drift` · **Commit:** `b18c00d2`
**Resolution taken:** 1 (restore the gate), as directed.

## In plain words

The app promised that a hidden git panel costs nothing. That promise broke.
With another branch selected in the history view, the hidden panel still ran
one git command every five seconds, forever. I watched it happen: three git
commands in sixteen seconds with the panel closed. I put the gate back. Now a
hidden panel runs zero commands, and the moment you open it again the history
catches up, including commits that landed while it was closed.

## The change (86 lines, 4 files)

- `src/modules/git/GitWorkspace.ts` — `reconcileLogTip` returns before any
  probe when the pane is not observed. The predicate arrives as a new fourth
  constructor parameter. Bare construction (tests) defaults to observed. The
  gate line carries the invariant annotation.
- `src/modules/git/GitPlugin.ts` — new `paneIsObserved(workspace)`:
  `primaryDockHost.isContentVisible(paneContent.id)` (the split-aware painted
  check) AND `workspaceSet.active === workspace`. Injected at
  `attachWorkspace`. Same shape as StructurePlugin and
  DatabaseConsumerPlugin — I read both sites as the brief asked. I chose
  `isContentVisible` over `activeContent.id` equality because the primary
  dock can split: git can be painted in a non-active cell, and the
  `activeContent` form would over-close the gate there.
- `src/modules/git/GitWorkspace.test.ts` — new unit test "a hidden git pane
  spawns no tip probe; a visible one does". Positive control done: I planted
  the defect (disabled the gate), watched the test go red, restored it,
  watched it go green.
- `src/modules/git/git.invariants.md` — the refines (next section).

## The refines, record by record

- **"The commit log follows repository reality"** (git.invariants.md) —
  verdict `refines`, evidence: no `sidebarView` identifier exists in `src/`
  (the brief's premise, confirmed). Mechanism now names
  `GitPlugin.paneIsObserved` (split-aware painted check + active workspace)
  instead of `sidebarView !== 'git'`. Scope: `Bootstrap's git.togglePanel`
  corrected to GitPlugin's. Evidence: dead `showSidebarView` citation
  replaced with `GitPlugin.ts (paneIsObserved)`, the new unit test, and the
  spawn census. Last refined bumped to 2026-08-11. The impossible ("a hidden
  git panel spawning tip probes on the reconcile interval") is TRUE again
  and stays as written.
- **"Cost tracks the actively observed set"** (project.invariants.md) —
  verdict `upheld` (restored): this fix re-establishes its component
  "Background work follows paint" for the git log tip probe. No wording
  change needed.

## Reproduced first, then seen dead — the drive protocol

Instrument: a `git` PATH shim logging every spawn, fixture repos with
non-checked-out branches, the warm DriveSession server. All gestures real
(chords, activity-bar clicks, typed paths).

- **Leak seen pre-fix:** feature branch viewed, panel hidden via activity-bar
  click → 3 × `git rev-parse --verify --quiet refs/heads/feature` in 16s.
- **Dead post-fix:** same drive → 0 rev-parse in 16s. (The status reconcile
  continues while hidden — that is the watcher's own refresh feeding the
  status bar, panel-independent by design, unchanged.)
- **Positive control (gate must not over-close):** panel visible, feature
  viewed → 2 probes/12s still fire. External plumbing commit on the viewed
  branch → `ext-feat-commit` appeared in the pane with no in-app action.
- **Hidden-era catch-up:** hide → move the feature tip externally (0 probes
  while hidden) → re-show → `hidden-era-commit` renders. The stale cache is
  repaired on reveal.
- **Interleavings/edges:** fast double-toggle of the panel (state intact,
  feature view survives); viewed ref deleted while visible → viewer falls
  back to HEAD-following (`history: main`, gitLogBranch empty).
- **Workspace switch (both directions):** two workspaces, each viewing a
  non-checked-out branch. Active ws2: beta 3 probes / feature 0. Switch to
  ws1: feature 2 probes / beta 0. Cost follows the active workspace exactly.
- **Second-launch/persistence:** not applicable — nothing saved changed.
- **Scale parity:** not required per brief (no per-line cost; the gate is one
  boolean read per reconcile tick).

## Verification

- `bunx tsc --noEmit` clean.
- `bun test`: 2511 pass, 0 fail (full suite).
- `bash scripts/smoke-git-watch.sh` ALL-PASS. `bash scripts/smoke-git-blame.sh` ALL-PASS.
- `bash scripts/smoke-git-log.sh`: the freshness, viewed-branch, Esc-return,
  menu, and read-only families all PASS. Two drill-down steps FAIL — see
  premise correction below.
- Invariants checker `--all` + `--refs`: 0 problems, annotations resolve.

## Premise correction (finding, not caused by this change)

The brief's bar says "the git smokes green". `scripts/smoke-git-log.sh` is
RED at the dispatch base commit `a57067e5`, before my diff: I stashed my
changes and reproduced the identical two failures. The failing step opens a
file diff from an expanded commit on the viewed branch: `showingDiff` stays
`false` after Down+Enter, so the diff content assert also fails. Ten-year-old
version: the test clicks a file inside a commit and expects a
before-and-after view to open. It does not open, and that was already broken
before I touched anything. Everything this task changed is covered by the
other (passing) families plus my census protocol. Suggest filing a task:
either the Enter-to-open-diff path regressed or the smoke's row arithmetic
drifted (its comment hardcodes flat-row positions).

## Bycatch (AGENTS.md taxonomy)

- **Defect (pre-existing, reported):** smoke-git-log.sh drill-down red at
  base, details above. Not fixed here — out of scope, separate seam.
- **Distillation observed, not folded:** the pane-observation predicate now
  exists in four plugins (Structure, Tasks, Monitoring via dock content,
  Database via bottom panel, now Git via primary dock). The shapes differ by
  host kind, so I did not force a shared helper in this task. If a fifth
  primary-dock consumer appears, a `RegisteredDockContent`-style
  `isPainted()` for `registerPrimaryDockContent` (today it returns nothing)
  is the natural seam.
- Instrument asks (drive-pty): `key('Return')` fails ("Unknown harness key
  name") while `key('Enter')` works — a did-you-mean would save a probe.
  `quickOpen.showWorkspacePath` prefills the input, so a bare `type(path)`
  appends to the old root — `Control+a` first is the working idiom; worth a
  line in the skill.

## Coherence statement

Coherence-positive: git now speaks the same observation dialect as its
sibling plugins (gate on painted content + active workspace), the drifted
record is sharper than before (names a live identifier, cites a test that
can fail), and the gate is enforced by a unit test inside `bun test
src/modules/git`. No UI change — the visible panel behaves identically, per
the deliverable.

## Artifacts check

Drive server stopped (`--stop`, clean exit). Scratch repos and the git shim
live in the session scratchpad only. No settings, defaults, or status keys
changed. `BUILDER-FUNDAMENTALS.md` left untracked (dispatch scaffolding,
kept out of the commit).
