# READY — chrome wave (#115, #116, #119)

Commit: `6afb8c9` (`Move shared chrome controls to their owning surfaces`)

## Result

- Panel-wide Add, Expand/Restore, and Close now live on a shortened bottom-panel
  separator. Pane headings retain only their own Close.
- Panel Close hides the whole panel without disposing its pane sessions. Pane
  Close still removes only that pane.
- The agent footer is the final interior row, emits no bold segments, and is
  display-cell-clipped before it can cross a split-pane boundary.
- A contributed diff surface now gives the hidden buffer-tab strip zero rows.
  The diff toolbar moves up one row and right-aligns theme-owned `↑` / `↓`
  controls beside textual `Open current`; both symbols have padded mouse targets
  and tooltips.

## Driven frames

Defaults were driven through `PtyTestDriver` and the terminal-emulator grid
before editing and after the change.

Before, split panel (120x40):

```text
22|                                      [blank separator row]
23|                                    ╭──────────────────────────────────────╮
24|                                    │ ✦ Claude         +  ↗  ×   ❯ bash  +  ↗  ×
36|                                    │  engine: claude ⇄  ·  follow: o...
37|                                    │
38|                                    ╰──────────────────────────────────────╯
```

After, split panel (120x40):

```text
22|                                    ─────────────────────────────  +  ↗  ×
23|                                    ╭──────────────────────────────────────╮
24|                                    │ ✦ Claude              ×   ❯ bash   ×
36|                                    │  ────────────────────────────
37|                                    │  claude ⇄ · perm: bypass ·  ⌕
38|                                    ╰──────────────────────────────────────╯
```

The footer is immediately above the bottom border. The panel actions occupy
three padded three-cell hit targets; the separator stops before those targets.

Before, diff:

```text
04| Git: master
05| Changes (1) │ − Previous  ✚ Next  1 of 3 changes              ↗ Open current
06|             │ Base (HEAD) — scale.ts                 Current (working) — scale.ts
```

After, diff:

```text
04| Git: master │ 1 of 3 changes                              ↑  ↓  Open current
05| Changes (1) │ Base (HEAD) — scale.ts                 Current (working) — scale.ts
06|             │ 1 export const scaleLine1 = 1;         1 export const scaleLine1...
```

The Base row now aligns with the Git `Changes (1)` row, proving the hidden tab
row was reclaimed. Hovering `↑` or `↓` paints `Previous change` or
`Next change`; clicking `↓` moved the driven aligned offset from 0 to 4.

Full captures:

- `/tmp/chrome-wave-before-small.txt`
- `/tmp/chrome-wave-before-large.txt`
- `/tmp/chrome-wave-after-small.txt`
- `/tmp/chrome-wave-after-large.txt`

## Scale parity

The same default gesture was driven against 10-line and 100,000-line real Git
files. Panel ownership, footer placement/content, diff toolbar row, and
Base/current placement were the same at both scales. The only expected visual
difference was the large file's wider line-number gutter.

The final panel smoke additionally drove 120x40 and 88x24 layouts, Unicode and
ASCII vocabulary tiers, regular/expanded/restored states, split panes, and
panel/pane Close semantics. The final diff smoke drove a 120-line real diff with
top, middle, and bottom changes.

## Agent footer reductions

Kept:

- live engine/provider name and cycle affordance;
- permission mode;
- the optional one-cell transcript-search control.

Shortened:

- `engine: claude ⇄` / `engine: codex ⇄` to `claude ⇄` / `codex ⇄`;
- permission text to `perm: ask`, `perm: bypass`, or `perm: bypass-only`;
- separators from `  ·  ` to ` · `.

Dropped:

- terminal-follow mode from this narrow footer;
- the `(shift+tab · ctrl+e)` / `(shift+tab to cycle)` hint.

Terminal-follow remains available through Ctrl+Shift+M, Settings, and the
command palette, and its complete real Bash/echo-agent smoke remains green.

## Width and mark proof

`ThemeIcons` owns `diffPreviousChange` and `diffNextChange` at every capability
tier. The existing app-versus-terminal width agreement test includes every
semantic interface glyph and proves both symbols are one cell. The ownership
table records both marks; neither collides with the reserved `▎`, `●`, or `❯`
marks.

The agent unit contract measures the final footer with the shared display-cell
width implementation at an 18-column render width. The split-pane frame probe
also confirms the footer never paints in its terminal neighbor.

## Positive controls

Each new driven claim was made red before the plant was removed:

- Six reserved agent chrome rows:
  `FAIL the agent footer is flush with the pane bottom and has no padding row`.
- Bold footer segments:
  `FAIL the agent footer is flush with the pane bottom and never bold`.
- Persistent hidden diff-tab row:
  `FAIL Base/current remain ordered, nav icons adjoin Open current, and the hidden tab row is reclaimed`.
- Disabled diff hover routing:
  `Timed out waiting for grid condition: the down navigation symbol identifies itself on hover`.
- Reserved `▎` used as the down symbol:
  `Expected: false / Received: true` in the reserved-marker assertion.
- Destructive panel-level Close:
  `Timed out waiting for the panel-level Close hides the panel without destroying its panes`.

All plants were removed before the final pass.

## Invariant review

Semantic verdict: clean. The UI record now distinguishes the panel separator
owner from close-only pane headings; the agent contract records bottom
ownership, width bounding, essential identity, and calm paint; the diff record
retains Base/current and `Open current` right-pane ownership while adding row
reclamation and tooltip-owned navigation. The terminal-follow record now
truthfully names Settings/key/palette ownership after its footer control was
removed.

Mechanical checker result: `869 annotation(s) resolved, 45 lattice link(s)
resolved, 0 problem(s)`.

## Final verification

- `bunx tsc --noEmit` — exit `0`
- `bun test` — exit `0` (`1641 pass`, `0 fail`, 248 files)
- `bash scripts/conventions-gate.sh` — exit `0`
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`
  — exit `0`
- `bun scripts/check-coverage-ratchet.ts` — final exit `0`
  - First invocation returned exit `1` because the existing terminal-follow
    coverage-delta row still carried obsolete historical counts. The required
    declaration was corrected to the measured `assertions 16 → 16, waits
    44 → 43`, explaining that the intentionally removed footer control
    superseded the locator wait.
- `bun scripts/harness/smoke-panel-chrome-harness.ts` — exit `0`
- `bun scripts/harness/smoke-agent-pane-ux-harness.ts` — exit `0`
- `bun scripts/harness/smoke-agent-engine-switch-harness.ts` — exit `0`
- `bun scripts/harness/smoke-terminal-follow-harness.ts` — exit `0`
- `bun scripts/harness/smoke-diff-overview-harness.ts` — exit `0`

`scripts/merge-gate.sh` was not run.

## Bycatch

None observed.

## Worktree

All implementation changes are committed. Tracked files are clean. The
conductor-provided untracked `TASK.md` was preserved unchanged.

---

# Round 2

Commit: `a53ccfe` (`Repair chrome-wave probe ownership and diff bars`)

## Verdicts from the real paths

- **Agent search — stale probe, app correct.** The 120x40 PTY frame painted
  `claude ⇄ · perm: bypass ·  ⌕` on row 37. Clicking that cell opened the
  shared transcript FindBar and bound `agent-transcript`. The failed predicate
  still required the retired `engine:` copy.
- **Diff scrollbar — app wrong, probe correct.** The real diff laid out a
  91x22 body and derived a 21-cell track at the trailing edge, but its
  `SolidThumbScrollBar` sliders had never received theme track/thumb colors.
  Before the fix, the only thumb-colored cell found by the frame probe was not
  a right-edge diff bar. The previous passing probe had mistaken unrelated
  right-edge paint for the bar; reclaiming the hidden tab row exposed it.

## Fixes

- The TypeScript agent-search harness now resolves the search glyph through
  `ThemeIcons`, obtains the `agent` heading and panel viewport geometry from
  status, and scans only the structurally owned footer row.
- The legacy agent-search smoke closes the same known `characters.indexOf("⌕")`
  risk: it reads `ThemeIcons`, the `agent` heading, and the published panel
  viewport instead of a literal glyph or footer copy.
- `DiffView` now projects the shared palette's panel and dim colors into both
  scrollbar sliders. The existing real-cell diff assertion was left intact.
- The later scrollbar agent probe now clicks `expand` on the published
  `contentId: "panel"` heading. Its old `panelActiveContent === "agent"`
  locator was another round-1 blast-radius dependency hidden behind the
  earlier diff timeout.

## Blast-radius census

Agent-footer dependencies:

- Fixed: `scripts/harness/smoke-agent-search-harness.ts` and
  `scripts/smoke-agent-search.sh`.
- Current but copy-coupled:
  `scripts/harness/smoke-agent-pane-ux-harness.ts` finds `perm: bypass` and
  assumes the border is the following row;
  `scripts/harness/smoke-terminal-follow-harness.ts` finds `perm:` and excludes
  `follow:`; `scripts/harness/smoke-agent-engine-switch-harness.ts` finds the
  global `claude ⇄` / `codex ⇄` text before checking panel bounds.
- Stale legacy copy:
  `scripts/harness/smoke-agent-permissions-harness.ts`,
  `scripts/smoke-agent-pane-ux.sh`, `scripts/smoke-agent-engine-switch.sh`, and
  `scripts/smoke-agent-permissions.sh` still name retired long-form engine,
  follow, or permission labels. They were enumerated but not expanded into
  this scoped repair.

Panel-heading-control dependencies:

- `scripts/harness/smoke-panel-chrome-harness.ts` already uses published
  `panelHeadingGeometry` actions and is structurally keyed.
- `scripts/harness/smoke-scrollbars-harness.ts` is now keyed to the
  panel-owned `expand` action.
- Both agent-search probes now use the published `agent` heading as their
  footer owner.

Diff-toolbar/reclaimed-row dependencies:

- `scripts/harness/smoke-scrollbars-harness.ts` scans the right-edge cells; its
  unchanged assertion now observes the real themed diff bar.
- `scripts/harness/smoke-diff-overview-harness.ts` uses relational toolbar
  placement, but still contains literal `↑` / `↓` glyphs and a fixed
  `trackTop = 2`; those are future vocabulary/row risks.
- `scripts/smoke-diff-overview.sh` hardcodes toolbar rows 3/4 plus a workspace
  offset and searches textual `Next`; it is a stale positional/copy probe.
- `scripts/harness/smoke-git-log-harness.ts` and `scripts/smoke-git-log.sh`
  use the contract-governed Base/current labels to identify a diff, not a
  toolbar row. They remain label-dependent but were not invalidated by this
  layout move.

## Positive controls

All plants were removed before the final pass.

- Agent TypeScript owner plant (`agent-positive-control`), exit `1`:
  `Timed out waiting for the agent footer owner has published its panel
  geometry`.
- Legacy agent owner plant, exit `1`:
  `FAIL could not locate themed search icon in the agent footer`.
- Diff appearance plant (thumb color made identical to track), exit `1`:
  `Timed out waiting for grid condition: the diff pane vertical thumb is
  painted before frame collection begins`.
- Panel-owner plant (`panel-positive-control`), exit `1`:
  `Timed out waiting for the expand panel heading action has published
  geometry before the scrollbar drive`.

## Scale parity

The shared real-PTY smoothness fixture drove the diff at 2,000 and 100,000
lines with defaults held fixed. Both completed with the same growing glide
shape and approximately 31 FPS sustained-fast cadence:

- 2,000 lines: positions
  `10,13,16,19,21,24,25,27,29,30,31,32,33,34,35,36,37`;
  sustained-fast 31.9 FPS.
- 100,000 lines: positions
  `5,9,13,16,19,21,23,25,27,28,29,31,32,33,34,35,36,37`;
  sustained-fast 31.1 FPS.

The instrument exited `0`.

## Final verification

- `bun scripts/harness/smoke-agent-search-harness.ts` — exits `0`, `0`, `0`
- `bun scripts/harness/smoke-scrollbars-harness.ts` — exits `0`, `0`, `0`
- `bunx tsc --noEmit` — exit `0`
- `bun test` — exit `0` (`1641 pass`, `0 fail`, 248 files)
- `bash scripts/conventions-gate.sh` — exit `0`
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`
  — exit `0` (`869` annotations, `45` links, `0` problems)
- `bun scripts/check-coverage-ratchet.ts` — exit `0`
- `bash -n scripts/smoke-agent-search.sh` and the full legacy smoke — exit `0`

`scripts/merge-gate.sh` was not run.

## Bycatch

- The legacy `bash scripts/smoke-scrollbars.sh` reported zero Git horizontal
  bars where it expected at least two after opening the narrow overflowing Git
  panes. This was observed once during the required initial real-path drive;
  it is outside the two requested harness failures and was not changed.

## Worktree

The implementation is committed. Tracked files are clean. The
conductor-provided ignored `TASK.md` and pre-existing untracked
`artifacts/render-progress.json` were preserved unchanged.

# Round 3 — agent-permissions structural probe

## Driven finding

The unchanged `agent-permissions` PTY smoke reproduced the reported failure
with exit `1`. Its final frame showed the agent footer on row 31 as:

`claude ⇄ · perm: bypass · ⌕`

The permission state was visibly correct. The timeout still searched for
`bypass permissions on`, so this was a stale probe rather than an app defect.
It failed before any permission was resolved and is separate from tracked
race #109.

## Fix

Only `scripts/harness/smoke-agent-permissions-harness.ts` changed.

- The smoke forces the unicode glyph tier and resolves the search glyph from
  `ThemeIcons`.
- It derives the agent footer from the published bottom-panel rectangle,
  `panelHeadingGeometry`, the `agent` heading `contentId`, and the live panel
  viewport row count.
- It scans only that structurally owned footer row. The pre-toggle row
  signature must contain the themed search boundary, and `Shift+Tab` must
  visibly change the same owned row.
- The existing pending-permission status checks remain the behavioral proof
  that the changed state is ask mode. No permission copy was re-keyed.

No app code or other smoke changed.

## Positive control

The plant changed the footer owner from `agent` to `terminal`. The smoke
exited `1` with:

`Timed out waiting for the agent footer owner has published its panel geometry`

The plant was removed before final verification.

## Invariant review

Five implicated rules were upheld: themed appearance remains data-driven,
the agent footer remains pane-owned, harness input/output remains on the real
PTY, the terminal emulator remains the screen oracle, and coverage did not
fall. The mechanical checker resolved 869 annotations and 45 lattice links
with zero problems.

## Final verification

- `bun scripts/harness/smoke-agent-permissions-harness.ts` — exits `0`, `0`,
  `0`
- `bunx tsc --noEmit` — exit `0`
- `bun test` — exit `0` (`1641 pass`, `0 fail`, 248 files)
- `bash scripts/conventions-gate.sh` — exit `0`
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`
  — exit `0` (`869` annotations, `45` links, `0` problems)
- `bun scripts/check-coverage-ratchet.ts` — exit `0`; the smoke changed from
  `8 assertions / 17 waits` to `8 assertions / 18 waits`

`scripts/merge-gate.sh` was not run.

## Separate tracked defect

Race #109 was not observed in the four complete permission-resolution drives.
This change does not alter or claim to fix that race.

## Bycatch

None observed in this round.

## Worktree

Committed as `a74129e98fc752b09f028357560d4f0e0b0764ed`. Tracked files
are clean. The pre-existing untracked `artifacts/render-progress.json` was
preserved unchanged.

COMPACTION: none

conventions @ `e898c40d189bac146fe10b4e8d4fe011c1668abe`
