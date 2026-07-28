# READY — #143 structural probe keys

Commit: `e55174e27c7f4445da7e593d891febbf84484976`

Branch: `fix-probe-structural-keys`

Worktree: clean after commit (`git status --short` produced no output,
exit 0).

## Outcome

All eight enumerated probes received an explicit verdict:

| Probe | Baseline | Verdict |
| --- | ---: | --- |
| `scripts/harness/smoke-agent-pane-ux-harness.ts` | exit 0 | **repaired** |
| `scripts/harness/smoke-terminal-follow-harness.ts` | exit 0 | **repaired** |
| `scripts/harness/smoke-agent-engine-switch-harness.ts` | exit 0 | **repaired** |
| `scripts/smoke-agent-pane-ux.sh` | exit 1 | **retired-and-parked** at `scripts/retired-smokes/smoke-agent-pane-ux.sh` |
| `scripts/smoke-agent-engine-switch.sh` | exit 1 | **retired-and-parked** at `scripts/retired-smokes/smoke-agent-engine-switch.sh` |
| `scripts/smoke-agent-permissions.sh` | exit 1 | **retired-and-parked** at `scripts/retired-smokes/smoke-agent-permissions.sh` |
| `scripts/harness/smoke-diff-overview-harness.ts` | exit 0 | **repaired** |
| `scripts/smoke-diff-overview.sh` | exit 6 | **retired-and-parked** at `scripts/retired-smokes/smoke-diff-overview.sh` |

The four active PTY probes now locate chrome through the owning surface and
published state:

- Agent footer geometry is derived from `layoutSlots.bottomPanel`,
  `panelHeadingGeometry` keyed by `contentId === "agent"`,
  `panelCellIds`, `panelCellColumns`, and the published panel viewport rows.
- Permission mode is asserted through the new semantic
  `agentSkipPermissions` status field.
- Engine clicks use the first provider segment inside the owned footer, and
  heading checks use the published live `agentTitle` inside the agent-owned
  heading span. There is no global `claude ⇄` / `codex ⇄` locator.
- The footer's search affordance comes from
  `ThemeIcons.findIconsFor("unicode").search`; no permission or follow copy is
  used as a locator. Terminal-follow mode changes are proven to leave the
  complete owned footer byte-identical.
- Diff navigation glyphs come from `ThemeIcons`, and click targets come from
  published `DiffView` header segments. The overview-ruler proof uses its
  published live rectangle rather than `trackTop = 2`.

No probe was re-keyed to replacement copy.

## What the audit found

The four shell probes were genuinely red before any edit, not merely fragile:

- Agent pane: stale footer labels caused the first failures
  (`no 'bypass permissions' in pane`, `no 'follow: off' in pane`), after which
  its positional assumptions cascaded into further false failures.
- Engine switch: stale global labels/title forms failed
  (`no 'engine: claude' in pane`, `no '╭─Claude' in pane`) and its pointer
  target could no longer be found.
- Permissions: both retired long-form labels were absent
  (`no 'bypass permissions on' in pane`,
  `no '? ask permissions' in pane`).
- Diff overview: fixed rows and the textual `Next` locator missed the toolbar;
  it reported six failures, including no navigation, no split geometry, no
  selection, and no Open-current action.

Each was a strict behavioral subset of an already gated PTY twin. Repairing
the gate-skipped duplicates would have restored no coverage. Their
retirements and complete replacement mappings are declared in
`project.coverage-deltas.md`, and their optional `full_tmux` registrations
were removed.

The three green agent PTY probes did go red when their named behavior was
broken; no hidden product-behavior defect was found in those paths. Their old
locators nevertheless admitted unrelated/global paint and positional drift,
so the structural re-key closes the same false-green class previously seen in
the scrollbar probe.

The diff re-key exposed one real observability defect in the new structural
seam: the first status projection was published before OpenTUI completed the
contributed surface layout, yielding a one-row ruler rectangle even while the
real screen had a full-height ruler. `GitComparisonContent` now advances the
surface's layout revision when its real height settles;
`GitComparisonSurface.observePaintSignals` feeds that one-shot revision into
the normal coarse projection pass. The authoritative full geometry is
therefore republished without polling, fixed sleeps, or a hardcoded fallback.

## Strict-superset retirement audit

- `smoke-agent-pane-ux-harness.ts` retains chrome, Shift+Tab permission
  cycling, busy/waiting state, tool folding, transcript/composer wrapping,
  scroll/tail behavior, selection, and copy. Duplicate idle ownership remains
  centralized in the behavioral contract.
- `smoke-agent-engine-switch-harness.ts` retains boot identity, keyboard and
  pointer switching, context transfer, both provider directions, and
  per-message producer attribution. Duplicate idle ownership remains
  centralized.
- `smoke-agent-permissions-harness.ts` retains ask/bypass cycling, allow,
  deny, always-allow, stray-input rejection, prompt identity, and the absence
  of an incorrectly completed tool row.
- `smoke-diff-overview-harness.ts` retains top/middle/bottom ruler paint,
  toolbar actions, change navigation, persistent divider drag, held-edge
  selection and exact copy, and Open-current promotion.

The harness invariant was refined accordingly: distinct tmux originals remain
available for explicit audits, while a proven strict-subset duplicate may be
parked only with a named gated replacement and a no-loss coverage declaration.
Diff invariant evidence and verification now name the gated harness.

## Positive controls

Every repaired active probe was made red by a temporary behavior defect, then
the defect was removed:

| Probe | Planted behavior defect | Exact result |
| --- | --- | --- |
| Agent pane UX | Disabled Shift+Tab's permission-state mutation | exit 1 — `Timed out waiting for Shift+Tab publishes ask-mode permission state` |
| Terminal follow | Reintroduced follow-mode text into the agent footer | exit 1 — `FAIL terminal-follow state changes leave the agent footer byte-identical` |
| Agent engine switch | Disabled pointer dispatch on the owned engine segment | exit 1 — `Timed out waiting for status condition: candidate.agentEngine === 'claude'` |
| Diff overview | Disabled `jumpToNextChange()` | exit 1 — `Timed out waiting for status condition: Number(status.diffScrollTop) > scrollBeforeNext` |

Logs:

- `/tmp/probedebt-positive-agent-pane.log`
- `/tmp/probedebt-positive-terminal-follow.log`
- `/tmp/probedebt-positive-agent-engine.log`
- `/tmp/probedebt-positive-diff-overview.log`

The four retired probes were already red at baseline, so a planted defect
could not make them a valid instrument. Their no-loss proof is the
strict-superset mapping above; the behavior-level positive controls belong to
the gated replacements.

## Final driven verification

The runnable replacements for the four repaired/retired probe pairs each
passed three fresh runs after all edits:

| Active probe | Run 1 | Run 2 | Run 3 |
| --- | ---: | ---: | ---: |
| `smoke-agent-pane-ux-harness.ts` | exit 0 | exit 0 | exit 0 |
| `smoke-terminal-follow-harness.ts` | exit 0 | exit 0 | exit 0 |
| `smoke-agent-engine-switch-harness.ts` | exit 0 | exit 0 | exit 0 |
| `smoke-diff-overview-harness.ts` | exit 0 | exit 0 | exit 0 |

The parked shell files were not presented as passing verification: each had
already failed at baseline and is no longer registered. Their replacement
harness is the verified probe.

Required checks:

- `bunx tsc --noEmit` — exit 0
- `bun test` — exit 0; 1,651 pass, 0 fail, 67,367 expectations
- `bash scripts/conventions-gate.sh` — exit 0
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`
  — exit 0; 871 annotations resolved, 0 problems
- `bun scripts/check-coverage-ratchet.ts` — exit 0; 309 files inspected,
  no undeclared decrease

Additional checks:

- focused app/diff/git tests — exit 0; 22 pass, 0 fail
- shell syntax for the edited gate and four parked scripts — exit 0
- `git diff --check` — exit 0

Per instruction, `scripts/merge-gate.sh` and
`scripts/behavioral-contracts.sh` were not run.

## Contracts and bycatch

Relevant records were checked: the harness screen-oracle/conformance record,
diff overview-ruler record, persistent diff split record, and shared diff
selection record. The change strengthens their evidence and does not violate
or stress a product invariant.

## Bycatch

None observed during the repeated drives.

COMPACTION: one automatic context compaction occurred; work continued from
the generated summary without restarting completed work.

conventions @ `5a29312e3e8d614bbcff566841402f08fbfdcc23`
