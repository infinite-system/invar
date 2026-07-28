# Plugin canvas Git contribution fix — READY

Commit: `17fbccafed61dd195b5635b9dd1d54e6f60a3a90`
(`0fcacc912a3f593e12c0e19e854fe60d1672eccb` is its direct parent).

## Cause and eliminated candidates

The cause was candidate 3: the contributed Source Control pane registered as
`source-control`, while the app's established public view identity and driven
status contract remain `git`. Restoring the exact `git` pane identifier makes
the plugin contribution drive `sidebarView: "git"`, the activity-bar item, and
the Git splitter region under the same stable identity.

The contribution inversion had also dropped two pieces of established chrome
that were previously supplied by the built-in projection: the Extensions
placeholder item and the shared Git splitter element. They are now ordinary
plugin/pane contributions. The activity affordances again use the exact
Explorer, Source Control, and Extensions labels, theme glyphs, active accent,
ordering, and fallback behavior.

Eliminated:

1. `DefaultPlugins` is composed on the real launch path:
   `src/main.ts -> AppLoader.Class.main -> AppLoader.bootApp -> Bootstrap`.
   `AppLoader` passes `DefaultPlugins.Class.create()` to `Bootstrap`, which
   activates each application plugin.
2. `ActivityBar` does not enumerate a stale static list. It projects
   `primaryDockHost.orderedContents`, so registered plugin panes become its
   rows.
4. This was not an attach/projection race. `Bootstrap` activates application
   plugins before `RootView.Class.buildRootView`, and primary-dock
   registration is synchronous. `RootView` now also mounts active
   pane-contributed splitter elements generically.

## Durable driven assertion

`scripts/harness/smoke-activitybar-harness.ts` now reads three independent
sets through the real app status projection:

- plugin-declared primary-dock content identifiers;
- activity-bar item identifiers;
- registered sidebar view identifiers.

It requires the Git plugin manifest to declare `git`, then requires both
rendered/registered sets to exactly equal:

`["files", ...pluginPrimaryDockContentIdentifiers]`

This fails when any default plugin declares a primary-dock view but its pane
does not install, instead of allowing the sidebar/activity bar to silently
lose it.

## Three-run driven smoke matrix

Every entry is the exact process exit code for runs 1, 2, and 3:

| Harness | Run 1 | Run 2 | Run 3 |
| --- | ---: | ---: | ---: |
| `smoke-activitybar-harness.ts` | 0 | 0 | 0 |
| `smoke-layout-harness.ts` | 0 | 0 | 0 |
| `smoke-overlay-dialog-harness.ts` | 0 | 0 | 0 |
| `smoke-selection-harness.ts` | 0 | 0 | 0 |
| `smoke-diff-overview-harness.ts` | 0 | 0 | 0 |
| `smoke-settings-applied-harness.ts` | 0 | 0 | 0 |
| `smoke-git-log-harness.ts` | 0 | 0 | 0 |
| `smoke-git-watch-harness.ts` | 0 | 0 | 0 |
| `smoke-git-blame-harness.ts` | 0 | 0 | 0 |

Raw logs: `/tmp/plugin-canvas-smoke-runs.OJdBGZ/`

The merge-gate failure archive contains eight affected harnesses even though
the nudge says seven. All eight were run above, along with Git blame to cover
the complete Git harness set.

## Repository checks

| Check | Exit code |
| --- | ---: |
| `bunx tsc --noEmit` | 0 |
| `bun test` | 0 |
| invariant checker (`--all --refs`) | 0 |
| `scripts/conventions-gate.sh` | 0 |
| `scripts/check-coverage-ratchet.ts` | 0 |

`scripts/merge-gate.sh` was not run.
