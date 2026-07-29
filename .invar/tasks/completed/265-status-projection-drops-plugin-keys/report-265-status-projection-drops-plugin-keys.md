# READY - status projection drops plugin keys on uninstall (#265)

State: READY for review. Commit
`af17cf1d8ff72a1fb8524582364d986467bb7355` is on
`fleet/265-status-projection-drops-plugin-keys`. The worktree is clean.
The full pre-commit gate passed.

## Decision

A plugin-owned status key is absent after plugin uninstall. It does not keep
the plugin's last value and does not publish a replacement `false`.

The two states have different owners:

- While Markdown is installed, `markdownPreviewOpen=false` means the live
  plugin owns a closed preview.
- After Markdown is uninstalled, no live plugin owns that key. The status
  projection therefore removes it.

This reconciles `MarkdownPreview.close()` with uninstall symmetry.
`close()` publishes the live plugin's false state. The later contribution
withdrawal removes every key that the plugin owned.

The existing records already require total withdrawal:

- [The editor column's default occupant is a contribution](../../../../src/modules/ui/ui.invariants.md#the-editor-columns-default-occupant-is-a-contribution)
  requires uninstall to release the editor contribution.
- [The structure navigator is a pane content citizen](../../../../src/modules/structure/structure.invariants.md#the-structure-navigator-is-a-pane-content-citizen)
  requires uninstalled `structure*` keys to be absent.
- [The tasks dashboard is a pane content citizen](../../../../src/modules/tasks-dashboard/tasks-dashboard.invariants.md#the-tasks-dashboard-is-a-pane-content-citizen)
  requires uninstalled `tasks*` keys to be absent.
- [Peer plugins can have different lifetimes](../../../../src/modules/plugins/plugins.invariants.md#peer-plugins-can-have-different-lifetimes)
  requires explicit absent-capability states.
- [The editor contributor report](../../completed/220-editor-registers-as-contributor-with-manifest/report-220-editor-registers-as-contributor-with-manifest.md)
  records absent editor status keys as the uninstall precedent.

[Rendering is one coarse frame effect](../../../../src/modules/app/app.invariants.md#rendering-is-one-coarse-frame-effect)
now states the shared mechanism. `StatusProjectionContributions` maps
withdrawn keys to `undefined`. `StatusChannel` then omits those properties
from its JSON artifact.

No production runtime code changed. The task documents and checks the
existing correct behavior.

## Driven evidence

`bun run drive --open` used defaults on the 59-line
[README.md](../../../../README.md). The
preview painted and `markdownPreviewOpen=true`.

The existing Markdown uninstall probe then printed:

```text
before: open=true
t+1s open=undefined panePainted=false
t+2s open=undefined panePainted=false
t+3s open=undefined panePainted=false
t+4s open=undefined panePainted=false
t+5s open=undefined panePainted=false
```

The same probe produced the same fingerprint after the change.

`bun run drive --size 100000` also settled at defaults. The installed
Markdown plugin published `markdownPreviewOpen=false` for the non-Markdown
fixture. The 100,000-line editor remained responsive and correctly
projected. This task changes no per-row or per-frame runtime path.

## Smoke census

The task census uses the TypeScript AST. It discovers 10 application-plugin
status registrations and 97 plugin-owned keys. An independent source count
also finds 10 registrations. Its positive control detects both requested
comparison forms before it scans the smokes.

Before the fix, the census found 25 comparisons:

- 24 `=== false` comparisons.
- One `!== true` comparison.

After the fix, it finds 24 comparisons:

- 24 `=== false` comparisons.
- Zero `!== true` comparisons.

All 24 exact-false checks observe installed plugins. None is an uninstall
assertion. In JavaScript, `undefined === false` is false, so none can pass
when its key disappears.

The final exact-false census is:

- [smoke-database-harness.ts](../../../../scripts/harness/smoke-database-harness.ts):
  two `databasePreviewHasMoreRows` checks at lines 168 and 230.
- [smoke-diff-overview-harness.ts](../../../../scripts/harness/smoke-diff-overview-harness.ts):
  two `showingDiff` checks at lines 442 and 569.
- [smoke-inline-rewrite-harness.ts](../../../../scripts/harness/smoke-inline-rewrite-harness.ts):
  one `inlineRewriteEnabled` check and five `inlineRewriteVisible` checks at
  lines 216, 365, 385, 395, 441, and 450.
- [smoke-markdown-harness.ts](../../../../scripts/harness/smoke-markdown-harness.ts):
  four `markdownPreviewOpen` checks at lines 721, 954, 1014, and 1412.
- [smoke-plugin-manifest-harness.ts](../../../../scripts/harness/smoke-plugin-manifest-harness.ts):
  four `structureDepthIsOverridden` checks at lines 1129, 1147, 1376, and
  1490.
- [smoke-tasks-dashboard-harness.ts](../../../../scripts/harness/smoke-tasks-dashboard-harness.ts):
  two `tasksAvailable` checks and one `tasksCycling` check at lines 148, 341,
  and 463.
- [smoke-terminal-harness.ts](../../../../scripts/harness/smoke-terminal-harness.ts):
  one `terminalWheelForwardedToChild` check at line 593.
- [smoke-workspace-tabs-harness.ts](../../../../scripts/harness/smoke-workspace-tabs-harness.ts):
  two `gitWatcherActivationCompleted` checks at lines 380 and 387.

The one permissive assertion was the Markdown uninstall arm in
[smoke-plugin-manifest-harness.ts](../../../../scripts/harness/smoke-plugin-manifest-harness.ts).
It changed from `markdownPreviewOpen !== true` to
`markdownPreviewOpen === undefined`. The old form accepted a stale `false`.

The committed census is
`.invar/tasks/in-progress/265-status-projection-drops-plugin-keys/265-plugin-status-boolean-census.ts`.
Its header states the exact command and how to read every count.

## Regression contract and positive control

[StatusProjectionContributions.test.ts](../../../../src/modules/app/StatusProjectionContributions.test.ts)
now checks both layers of withdrawal:

1. The contribution snapshot maps the removed property to `undefined`.
2. JSON serialization omits the property.

I planted a stale `false` for every withdrawn key. The focused test returned
exit 1:

```text
error: expect(received).toEqual(expected)

  {
-   "samplePluginValue": undefined,
+   "samplePluginValue": false,
  }

(fail) disposing a contribution omits its projected fields from status JSON
```

I removed the plant. The focused test then passed with 2 tests and 5
expectations.

The affected plugin-manifest smoke passed every uninstall and reinstall arm.
Its Markdown arm now requires absence, so a retained stale `false` cannot
pass.

## Verification

- `bunx tsc --noEmit` returned exit 0.
- `bun test` returned exit 0: 1,929 pass, 0 fail, 68,656 expectations across
  296 files.
- `bun scripts/harness/smoke-plugin-manifest-harness.ts` returned exit 0.
  Every arm passed.
- The committed status census returned exit 0. It found 10 registrations,
  97 keys, 24 exact-false checks, and zero not-true checks.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`
  returned exit 0: 1,132 annotations, 221 lattice links, and 0 problems.
- `bash scripts/conventions-gate.sh` returned exit 0.
- `bun scripts/check-coverage-ratchet.ts` returned exit 0. It inspected 322
  files and found no undeclared decrease.
- `git diff --check` returned exit 0 before commit.
- The pre-commit merge gate returned `ALL-PASS`. All 62 parallel PTY smokes
  passed. All serial checks passed. The retry tally was empty.
- The gate skipped 37 legacy tmux audit smokes because `INVAR_FULL_TMUX` was
  not enabled.

## Files changed

- [app.invariants.md](../../../../src/modules/app/app.invariants.md)
- [StatusProjectionContributions.test.ts](../../../../src/modules/app/StatusProjectionContributions.test.ts)
- [smoke-plugin-manifest-harness.ts](../../../../scripts/harness/smoke-plugin-manifest-harness.ts)
- `.invar/tasks/in-progress/265-status-projection-drops-plugin-keys/265-plugin-status-boolean-census.ts`

## Invariant verdicts

Scope came from the status-projection paths and plugin-uninstall terms in the
[task record](task-265-status-projection-drops-plugin-keys.md).

- *Rendering is one coarse frame effect*: strengthened. Its mechanism now
  states the existing absent-key behavior.
- *The editor column's default occupant is a contribution*: upheld.
- *The structure navigator is a pane content citizen*: upheld.
- *The tasks dashboard is a pane content citizen*: upheld.
- *Peer plugins can have different lifetimes*: upheld.
- *Observability never crashes the app*: untouched. IO-failure handling does
  not choose plugin-key lifetime.

The invariant checker reports 0 problems.

## Bycatch

1. The [Markdown uninstall probe](../../completed/237-markdown-preview-left-and-auto-open/probe-237-uninstall-stale-pane.ts)
   header still says a clean run shows `open=false`. It also names its old
   `in-progress` path. Both statements are stale. The probe showed
   `open=undefined` twice in this task. I did not edit the completed task's
   scratch file.
2. The dispatched [brief](brief-265-1-status-projection-drops-plugin-keys.md)
   links to a contract without an anchor. Its ignored root task copy
   caused the first invariant check to report one problem. I corrected only
   the ignored worktree copy so the checker could run. The durable brief
   still needs its anchored link.

No runtime bycatch was observed.
