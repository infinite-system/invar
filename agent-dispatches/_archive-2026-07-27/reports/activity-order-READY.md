# READY — persisted activity-bar order

Branch: `fix-activity-bar-order`

Commit: `67944efde00747c8b9c538b964e9bfbc48a627da`
(`Persist activity bar content order`)

Worktree: clean

## Delivered

- Added `Settings.primaryDockContentOrder` as a persisted `string[]`.
  `Settings.sanitizeIdentifierOrder` is the single non-empty-string,
  array-validation, and `Set`-dedup path shared by primary-dock and bottom-panel
  orders.
- The primary `PanelHost` now receives that settings ref and persists order
  changes. Registration supplies membership; the ref supplies order.
- Primary-dock removal retains dormant identifiers. Missing content is filtered
  from `orderedContents`, so it paints no gap and cannot crash. Re-registration
  returns to the retained slot.
- A content identifier absent from persisted order is appended in deterministic
  registration order. The empty default avoids coupling host settings to plugin
  identifiers; the typed default plugin manifest supplies the initial membership
  order.
- Extracted `ContentOrderDrag` because the existing pointer lifecycle was
  embedded in `PanelContentsList` and could not be reused as-is. Both
  `PanelContentsList` and `ActivityBar` now delegate to that one drag controller,
  and both write through `PanelHost.moveContentTo`.
- Added activity-bar pointer capture and drag reorder.
- Added activity-context Alt+Up / Alt+Down reorder, matching the bottom-panel
  list's keyboard gestures. The same actions are also command-palette reachable.
- Added the `Activity bar order is one persisted sequence` UI contract and
  updated the panel/layout contract references to the shared mutation.
- Appended counted coverage declarations.

## Finding 16 measurement

Supported hypothesis: **1 — a stale persisted value can explain terminal-left**.

- Fresh per-run `mktemp` HOME: the first visible split painted
  `agent,terminal`.
- A separate per-run HOME planted with
  `"panelContentOrder":["terminal","agent"]`: the first visible split painted
  `terminal,agent`.
- Hypothesis 2 was not supported: `Settings.load()` runs at
  `Bootstrap.ts:121-122`, before the panel host is constructed around line 218;
  agent and terminal registration happens later and is lazy.
- Hypothesis 3 was not supported: the shared sanitizer accepts the valid planted
  sequence, while absent/invalid input leaves the declared
  `['agent','terminal']` default intact. Unit and driven tests both cover this.

No migration/repair is warranted. `panelContentOrder` is an explicit user
customization, so silently rewriting terminal-first would destroy a legitimate
dragged order. The affected profile needs one re-drag; subsequent boots retain
it.

## Counterfactual red

Temporarily changed the primary dock back to `new PanelHost.Class()` with no
persisted order injection, then ran the complete activity-bar harness.

`ACTIVITY_SMOKE_POSITIVE_CONTROL_EXIT=1`

It failed specifically at:

`Timed out waiting for Git returns to the exact activity order it held before disable`

The production wiring was then restored.

## Final committed-tree verification

- `bunx tsc --noEmit` — exit `0`
- `bun test` — exit `0` (`1601 pass`, `0 fail`, 244 files)
- `bash scripts/conventions-gate.sh` — exit `0`
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`
  — exit `0` (`858` annotations and `45` lattice links resolved, `0` problems)
- `bun scripts/check-coverage-ratchet.ts` — exit `0`
- `bun scripts/harness/smoke-activitybar-harness.ts`, run 1 — exit `0`
- `bun scripts/harness/smoke-activitybar-harness.ts`, run 2 — exit `0`
- `bun scripts/harness/smoke-activitybar-harness.ts`, run 3 — exit `0`
- Additional shared-generator regression drive:
  `bun scripts/harness/smoke-panel-split-harness.ts` — exit `0`

Each activity-bar run drove the real PTY path:

1. fresh HOME and agent-left first split paint;
2. planted terminal-first comparison;
3. Git disable and re-enable at the same activity index;
4. Alt+Up / Alt+Down reorder;
5. pointer drag to a new index;
6. same-HOME restart with the dragged order preserved.

`scripts/merge-gate.sh` was not run, per the task.
