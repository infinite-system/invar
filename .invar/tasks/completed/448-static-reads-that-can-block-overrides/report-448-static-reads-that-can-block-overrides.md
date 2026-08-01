## In plain words

Some classes asked a fixed class for a setting or method, so a subclass could answer and still be
ignored. I removed the unnecessary statics, made live reads follow the class that received the
call, and added a gate that rejects this habit. The app now keeps subclass overrides in both normal
and static code, while 16 deliberately fixed reads stay named and explained.

## Result

Task #448 (static reads that can block overrides), including the retired #449 (gate holds the
rule), is complete in commit `1908d47010d6e9df33e744f4c1c0bffc092256fd` on branch
`fleet/448-static-reads-that-can-block-overrides`.

The dispatched worktree did not contain the landed #443 (static-read indirection defeats
override) implementation. Its first census therefore found 70 instance candidates, not the
required 55. I merged the exact landed commit `1e6f6dbe677c905dadf66b02090d0102e9b1a947` into this
branch. The [#443 report](../../completed/443-static-read-indirection-defeats-override/report-443-static-read-indirection-defeats-override.md)
and census then reproduced 55 candidates in 14 production classes. I made no unrelated merge from
the fleet integration branch.

The worktree is clean. I committed with `SKIP_GATE=1`, as all three briefs require. I did not run
`scripts/merge-gate.sh`.

## Census result

The task-local census now reports instance and static bodies separately. The gate runs the same
structural rule through [scripts/ast-query.ts](../../../../scripts/ast-query.ts), so the cleanup and
the guard cannot drift into separate definitions.

| Population | Before | After | Result |
| --- | ---: | ---: | --- |
| Instance bodies | 55 reads, 40 statics, 14 classes | 16 reads, 12 statics, 6 classes | The 16 remaining reads are the exact rung-3 allowlist. |
| Static bodies | 17 reads, 13 statics, 2 classes | 0 | Every own-class read now uses `this`. There is no allowlist. |

The round-2 rough text search named about 20 files. The structural census found only two classes
with actual own-class reads in static bodies: `AppLoader` with 8 reads and `BoundedListPopup` with
9. Imports, namespace declarations, instance reads, and cross-class dependencies explained the
larger text result.

## Instance-body decisions

This is one row per static. Read counts are the round-1 instance population. “External” means a
reader outside the declaring class, including a colocated test. Rung 1 removed the static, rung 2
uses the receiving constructor, and rung 3 deliberately keeps the fixed class read.

| Class | Static | Reads | External reader | Rung | Reason |
| --- | --- | ---: | --- | ---: | --- |
| [TasksDashboardOverview](../../../../src/modules/tasks-dashboard/TasksDashboardOverview.ts) | `DATA_HEARTBEAT_MILLISECONDS` | 1 | No | 1 | Only one instance timer needs this private value. |
| [TasksDashboardOverview](../../../../src/modules/tasks-dashboard/TasksDashboardOverview.ts) | `MOTION_HEARTBEAT_MILLISECONDS` | 2 | No | 1 | Motion timing is private instance state used by its timer and elapsed projection. |
| [TasksDashboardOverview](../../../../src/modules/tasks-dashboard/TasksDashboardOverview.ts) | `PROBE_EVERY_TICKS` | 1 | No | 1 | Only the instance heartbeat reads the probe cadence. |
| [TasksDashboardOverview](../../../../src/modules/tasks-dashboard/TasksDashboardOverview.ts) | `DURATION_REFRESH_EVERY_TICKS` | 1 | No | 1 | Only the instance heartbeat reads the refresh cadence. |
| [TasksDashboardOverview](../../../../src/modules/tasks-dashboard/TasksDashboardOverview.ts) | `LENS_ORDER` | 3 | No | 1 | Lens rotation is private instance data. |
| [TasksDashboardOverview](../../../../src/modules/tasks-dashboard/TasksDashboardOverview.ts) | `PRIORITY_GLYPHS` | 1 | No | 1 | Badge glyph lookup is private instance data. |
| [SourceTextPaneContent](../../../../src/modules/editor/SourceTextPaneContent.ts) | `emptyState` | 1 | No | 1 | Only the pane instance paints this text. |
| [MonitoringPlugin](../../../../src/modules/monitoring/MonitoringPlugin.ts) | `LOG_PATH_ENVIRONMENT_NAME` | 1 | No | 1 | The plugin instance alone reads this private path input. |
| [MonitoringPlugin](../../../../src/modules/monitoring/MonitoringPlugin.ts) | `LOG_FILE_RELATIVE_PATH` | 1 | No | 1 | The plugin instance alone builds this private path. |
| [MonitoringStats](../../../../src/modules/monitoring/MonitoringStats.ts) | `MAXIMUM_RETAINED_SAMPLES` | 1 | No | 1 | The sample ring owns its private bound. |
| [MonitoringStats](../../../../src/modules/monitoring/MonitoringStats.ts) | `BYTES_PER_TEXT_UNIT` | 1 | No | 1 | Retained-byte projection owns this private conversion. |
| [MonitoringStats](../../../../src/modules/monitoring/MonitoringStats.ts) | `MAXIMUM_LOG_ENTRIES` | 1 | No | 1 | The log ring owns its private bound. |
| [LinuxProcessSampler](../../../../src/modules/monitoring/LinuxProcessSampler.ts) | `LINUX_STAT_USER_TIME_INDEX` | 1 | No | 1 | The sampler instance alone parses this field. |
| [LinuxProcessSampler](../../../../src/modules/monitoring/LinuxProcessSampler.ts) | `LINUX_STAT_SYSTEM_TIME_INDEX` | 1 | No | 1 | The sampler instance alone parses this field. |
| [LinuxProcessSampler](../../../../src/modules/monitoring/LinuxProcessSampler.ts) | `LINUX_STAT_RESIDENT_PAGES_INDEX` | 1 | No | 1 | The sampler instance alone parses this field. |
| [LinuxProcessSampler](../../../../src/modules/monitoring/LinuxProcessSampler.ts) | `MICROSECONDS_PER_SECOND` | 1 | No | 1 | The sampler instance alone applies this conversion. |
| [PanelContentsList](../../../../src/modules/ui/PanelContentsList.ts) | `MINIMUM_WIDTH` | 2 | No | 1 | Width clamping is private to the list instance. |
| [PanelContentsList](../../../../src/modules/ui/PanelContentsList.ts) | `MAXIMUM_WIDTH` | 2 | No | 1 | Width clamping is private to the list instance. |
| [GitWorkspace](../../../../src/modules/git/GitWorkspace.ts) | `projectNameForRoot` | 1 | No | 1 | Workspace opening is its only caller. |
| [BreadcrumbPicker](../../../../src/modules/ui/BreadcrumbPicker.ts) | `PARENT_DIRECTORY_ITEM_LABEL` | 2 | No | 1 | The label and its icon lookup are private instance presentation. |
| [BreadcrumbPicker](../../../../src/modules/ui/BreadcrumbPicker.ts) | `PARENT_DIRECTORY_ITEM_IDENTIFIER` | 2 | [BreadcrumbPicker.test.ts](../../../../src/modules/ui/BreadcrumbPicker.test.ts) | 2 | The producer and recognizer must follow one subclass identifier. |
| [BoundedListPopup](../../../../src/modules/ui/BoundedListPopup.ts) | `MINIMUM_BOX_WIDTH` | 2 | No direct read | 2 | Composite geometry reads it through `this`; paired instance defaults must follow the same receiver. |
| [BoundedListPopup](../../../../src/modules/ui/BoundedListPopup.ts) | `HORIZONTAL_FRAME_COLUMNS` | 4 | No direct read | 2 | Composite geometry reads it through `this`; every instance width projection follows that receiver. |
| [BoundedListPopup](../../../../src/modules/ui/BoundedListPopup.ts) | `layoutGeometry` | 1 | [AgentSkillPopup.ts](../../../../src/modules/agent/AgentSkillPopup.ts) and tests | 2 | Popup subclasses may override their composite geometry. |
| [BoundedListPopup](../../../../src/modules/ui/BoundedListPopup.ts) | `desiredBoxWidth` | 1 | [BoundedListPopup.test.ts](../../../../src/modules/ui/BoundedListPopup.test.ts) | 2 | It composes live frame values, so the instance call follows the receiver too. |
| [BoundedListPopup](../../../../src/modules/ui/BoundedListPopup.ts) | `itemRowText` | 1 | [BoundedListPopup.test.ts](../../../../src/modules/ui/BoundedListPopup.test.ts) | 2 | Width measurement and paint must use the same subclass row generator. |
| [BoundedListPopup](../../../../src/modules/ui/BoundedListPopup.ts) | `itemSetIconColumns` | 1 | [BoundedListPopup.test.ts](../../../../src/modules/ui/BoundedListPopup.test.ts) | 2 | Item-set measurement and replacement must use the same subclass icon width. |
| [BoundedListPopup](../../../../src/modules/ui/BoundedListPopup.ts) | `itemSetMaximumWidth` | 1 | [BoundedListPopup.test.ts](../../../../src/modules/ui/BoundedListPopup.test.ts) | 2 | The inherited instance cache must call the subclass composite measurement. |
| [BoundedListPopup](../../../../src/modules/ui/BoundedListPopup.ts) | `DEFAULT_SEARCH_THRESHOLD` | 2 | No | 3 | This is the fixed product default; callers already have the supported per-open override. |
| [BoundedListPopup](../../../../src/modules/ui/BoundedListPopup.ts) | `filterItems` | 1 | [BoundedListPopup.test.ts](../../../../src/modules/ui/BoundedListPopup.test.ts) | 3 | This is the popup's fixed shared scoring algorithm, not a subclass knob. |
| [BoundedListPopup](../../../../src/modules/ui/BoundedListPopup.ts) | `enabledNavigation` | 1 | [BoundedListPopup.test.ts](../../../../src/modules/ui/BoundedListPopup.test.ts) | 3 | This is the fixed enabled-row index generator. |
| [BoundedListPopup](../../../../src/modules/ui/BoundedListPopup.ts) | `nextEnabledFilteredIndex` | 1 | [BoundedListPopup.test.ts](../../../../src/modules/ui/BoundedListPopup.test.ts) | 3 | This is the fixed wrap-and-skip navigation algorithm. |
| [BoundedListPopup](../../../../src/modules/ui/BoundedListPopup.ts) | `filterIndexAtRow` | 4 | No | 3 | Paint, hover, press, and drag share one fixed hit-geometry mapping. |
| [CompletionPopup](../../../../src/modules/ui/CompletionPopup.ts) | `filterItems` | 1 | [CompletionPopup.test.ts](../../../../src/modules/ui/CompletionPopup.test.ts) | 3 | Completion ranking is a fixed product algorithm. |
| [CommandBar](../../../../src/modules/ui/CommandBar.ts) | `layoutGeometry` | 1 | [CommandBar.test.ts](../../../../src/modules/ui/CommandBar.test.ts) | 3 | Command-bar geometry is one fixed shared calculation. |
| [FfmpegVideoSource](../../../../src/modules/media/FfmpegVideoSource.ts) | `sampleArgumentVector` | 1 | [FfmpegVideoSource.test.ts](../../../../src/modules/media/FfmpegVideoSource.test.ts) | 3 | The source uses the product's fixed ffmpeg sample recipe. |
| [ScrollPhysics](../../../../src/modules/ui/ScrollPhysics.ts) | `keyAcceleration` | 1 | [ScrollPhysics.test.ts](../../../../src/modules/ui/ScrollPhysics.test.ts) | 3 | This is the fixed product key-motion curve. |
| [ScrollPhysics](../../../../src/modules/ui/ScrollPhysics.ts) | `jumpRows` | 1 | [ScrollPhysics.test.ts](../../../../src/modules/ui/ScrollPhysics.test.ts) | 3 | This is the fixed product jump curve. |
| [ScrollPhysics](../../../../src/modules/ui/ScrollPhysics.ts) | `KEY_RUN_WINDOW_MS` | 1 | [ScrollPhysics.test.ts](../../../../src/modules/ui/ScrollPhysics.test.ts) | 3 | This is the fixed product timing rule. |
| [StatusBar](../../../../src/modules/ui/StatusBar.ts) | `composeStatusText` | 1 | [StatusBar.test.ts](../../../../src/modules/ui/StatusBar.test.ts) | 3 | Status text uses one fixed contribution-formatting rule. |

The rung-1 work removed 20 statics and 26 reads. `LinuxProcessSampler`, `PanelContentsList`, and
`GitWorkspace` lost their last statics, so their namespace anchors now publish the honest raw or
reactive class instead of `Static()`. The rung-2 work removed 13 blocking reads across eight
statics. The 16 rung-3 reads are exactly the final census output.

## Static-body decisions

Static bodies have no ladder exception. Every row changed to `this`. The “paired instance reads”
column records the cross-population pair rule.

| Class | Static read | Reads | Paired instance reads | Change |
| --- | --- | ---: | ---: | --- |
| [AppLoader](../../../../src/modules/app/AppLoader.ts) | `handlePluginCommand` | 1 | 0 | `this.handlePluginCommand()` |
| [AppLoader](../../../../src/modules/app/AppLoader.ts) | `bootApp` | 1 | 0 | `this.bootApp()` |
| [AppLoader](../../../../src/modules/app/AppLoader.ts) | `wireSignals` | 1 | 0 | `this.wireSignals()` |
| [AppLoader](../../../../src/modules/app/AppLoader.ts) | `handleFatal` | 1 | 0 | `this.handleFatal()` |
| [AppLoader](../../../../src/modules/app/AppLoader.ts) | `rootArgument` | 1 | 0 | `this.rootArgument()` |
| [AppLoader](../../../../src/modules/app/AppLoader.ts) | `exitProcess` | 2 | 0 | Both callbacks use `this.exitProcess()`. |
| [AppLoader](../../../../src/modules/app/AppLoader.ts) | `relaunch` | 1 | 0 | `this.relaunch()` |
| [BoundedListPopup](../../../../src/modules/ui/BoundedListPopup.ts) | `VERTICAL_FRAME_ROWS` | 2 | 0 | Both geometry reads use `this`. |
| [BoundedListPopup](../../../../src/modules/ui/BoundedListPopup.ts) | `RESERVED_BOTTOM_ROWS` | 1 | 0 | Geometry uses `this`. |
| [BoundedListPopup](../../../../src/modules/ui/BoundedListPopup.ts) | `MINIMUM_BOX_WIDTH` | 2 | 2 | Static composites use `this`; paired instance reads use `this.constructor`. |
| [BoundedListPopup](../../../../src/modules/ui/BoundedListPopup.ts) | `HORIZONTAL_FRAME_COLUMNS` | 2 | 4 | Static composites use `this`; paired instance reads use `this.constructor`. |
| [BoundedListPopup](../../../../src/modules/ui/BoundedListPopup.ts) | `itemSetIconColumns` | 1 | 1 | The composite and instance replacement follow the receiver. |
| [BoundedListPopup](../../../../src/modules/ui/BoundedListPopup.ts) | `itemRowText` | 1 | 1 | The composite and instance paint path follow the receiver. |

The AppLoader reproduction initially printed:

```text
subclass fatal calls: 0
base exit calls: 1
```

After the change it prints:

```text
subclass fatal calls: 1
base exit calls: 0
```

[AppLoader.test.ts](../../../../src/modules/app/AppLoader.test.ts) now calls each subclass directly.
It no longer swaps `AppLoader.Class` to make inherited self-dispatch work. External plugin discovery
still runs inside `bootApp` before `Bootstrap.Class.boot`, so its required ordering did not move.

## Gate and positive controls

`static-self-read-census` distinguishes the enclosing class and member through the TypeScript AST.
It flags own raw-class and namespace-slot receivers in instance and static bodies. It accepts
`this`, `this.constructor`, and `OtherThing.Class`.

The positive fixture contains one bad instance read and one bad static read. Its zero-count command
failed with exit 1 and reported one match in each population. The negative fixture reported zero
matches for both populations. The conventions gate runs the known-bad fixture first, checks that
both labels caused the failure, runs the correct fixture, and only then trusts the production
census.

I also planted the original pinned identifier read in
[BreadcrumbPicker.ts](../../../../src/modules/ui/BreadcrumbPicker.ts). The subclass behavior test
failed with:

```text
Expected: "custom-parent-row"
Received: "breadcrumb-picker:parent-directory"
0 pass
1 fail
```

I removed the plant. The focused AppLoader, breadcrumb, and bounded-popup tests then passed 20
tests with 72 expectations.

## Shrink-only allowlist

The allowlist has 12 rows covering 16 instance reads. Each count is a maximum. A new row, a larger
count, or any static-body match fails. A decrease prints slack so the row can be tightened or
removed. This is a small but nonzero fixed-base population, and every row has a reason.

| Allowed static | Reads | Reason |
| --- | ---: | --- |
| `FfmpegVideoSource.sampleArgumentVector` | 1 | Fixed ffmpeg sample recipe. |
| `CommandBar.layoutGeometry` | 1 | Fixed command-bar layout calculation. |
| `CompletionPopup.filterItems` | 1 | Fixed completion-ranking algorithm. |
| `StatusBar.composeStatusText` | 1 | Fixed status formatting rule. |
| `ScrollPhysics.keyAcceleration` | 1 | Fixed key-motion curve. |
| `ScrollPhysics.jumpRows` | 1 | Fixed jump curve. |
| `ScrollPhysics.KEY_RUN_WINDOW_MS` | 1 | Fixed timing rule. |
| `BoundedListPopup.DEFAULT_SEARCH_THRESHOLD` | 2 | Fixed default with a supported per-open override. |
| `BoundedListPopup.nextEnabledFilteredIndex` | 1 | Fixed enabled-row navigation algorithm. |
| `BoundedListPopup.filterItems` | 1 | Fixed popup scoring algorithm. |
| `BoundedListPopup.enabledNavigation` | 1 | Fixed enabled-row index generator. |
| `BoundedListPopup.filterIndexAtRow` | 4 | Fixed shared pointer hit geometry. |

The contract Verification and gate command is:

```sh
bun scripts/ast-query.ts static-self-read-census --allowlist scripts/static-self-read-allowlist.txt
```

It reports `16 instance, 0 static` and exits 0.

## Contract result

| Record | Result |
| --- | --- |
| [Live static reads follow the receiving class](../../../../project.invariants.md#live-static-reads-follow-the-receiving-class) | Accepted and widened from the #443 proposal. Static bodies always use `this`; instance bodies use `this.constructor` for live statics; only reasoned fixed instance reads may remain. Its Verification runs the gate census. |
| [Construction goes through overridable seams](../../../../project.invariants.md#construction-goes-through-overridable-seams) | Refined. Construction and inherited self-dispatch must follow an overridable receiver, not merely a mutable global slot. |
| [Public classes use the namespace pattern](../../../../project.invariants.md#public-classes-use-the-namespace-pattern) | Upheld. Classes that lost their last static also lost `Static()`; classes with statics kept the wrapper. |
| [External plugin discovery precedes application boot](../../../../src/modules/app/app.invariants.md#external-plugin-discovery-precedes-application-boot) | Upheld. Only AppLoader's own receiver syntax changed; registration and vendor loading still precede boot. |
| [The UI contract](../../../../src/modules/ui/ui.invariants.md) | Upheld. Popup geometry, item measurement, hit testing, and visible behavior retain their shared generators. The new subclass test proves the receiver changes, not the geometry contract. |
| [The monitoring contract](../../../../src/modules/monitoring/monitoring.invariants.md) | Upheld. Sample windows, ring bounds, byte accounting, and observation pricing keep the same values and order. No Mechanism named a moved static. |
| [The tasks dashboard contract](../../../../src/modules/tasks-dashboard/tasks-dashboard.invariants.md) | Upheld. Heartbeat values and lens order became instance data without changing the observation or CLI-lens generators. This domain was absent from round 1's explicit contract list. |
| [The editor contract](../../../../src/modules/editor/editor.invariants.md) and [the git contract](../../../../src/modules/git/git.invariants.md) | Upheld. Empty-state text and project-name discovery keep the same behavior. These touched domains were absent from round 1's explicit contract list. |
| [The media contract](../../../../src/modules/media/media.invariants.md) | Upheld. The ffmpeg recipe remains deliberately fixed. This unchanged rung-3 domain was absent from round 1's explicit contract list. |

The two project records remain separate. “Construction goes through overridable seams” governs the
broad dependency and dispatch promise. “Live static reads follow the receiving class” gives that
promise an exact static-read syntax, a narrow exception policy, and a runnable verification. I added
their dependency to [project.lattice.md](../../../../project.lattice.md) and reverse annotations at
the census and receiver-sensitive class/test sites.

## Honest enforcement scope

The census does not claim to find every extensibility defect. It does not cover constructor-baked
dependencies, a class calling a sibling class by name, a wrong choice between `Class` and `$Class`
for a cross-class dependency, bracket reads such as `$Class['member']`, or aliases and destructuring
that hide the receiver before the read. Those shapes need separate rules if the conductor chooses
to govern them.

## Verification

| Check | Result |
| --- | --- |
| Required #443 census after importing the landed fix | 55 instance reads in 14 classes. |
| Final task census | 16 instance reads and 0 static reads; all 16 instance reads match the 12-row allowlist. |
| AppLoader subclass reproduction | `subclass fatal calls: 1`; `base exit calls: 0`. |
| Census positive fixture | Exit 1; one instance and one static match. |
| Census negative fixture | Exit 0; zero matches. |
| Subclass behavior positive control | Failed on the planted pinned read with the expected base identifier. |
| Focused tests | 20 passed, 0 failed, 72 expectations. |
| `bun test` | 2,282 passed, 0 failed, 71,826 expectations across 348 files. |
| `bunx tsc --noEmit` | Passed. |
| `bash scripts/conventions-gate.sh` | Passed, including positive-control-first static census enforcement. |
| Invariant checker `--all --refs` | 1,329 annotations and 266 lattice links resolved; 0 problems. |
| `bun run drive --size 10` | Settled at 120x40 with `ready=true`, `renderQuiescent=true`, boot 244 ms. |
| `bun run drive --size 100000` | Settled at 120x40 with `ready=true`, `renderQuiescent=true`, boot 244 ms. |
| `git diff --check` | Passed. |

The first conventions-gate run exposed an invalid parenthetical label in the new lattice edge. I
corrected the derived map and reran the gate to PASS. This was a working-tree issue introduced and
resolved inside this task, not a remaining blocker.

## Bycatch

- [FfmpegVideoSource.ts](../../../../src/modules/media/FfmpegVideoSource.ts) declares `locate` and
  `sampleArgumentVector` statics but publishes the raw `$FfmpegVideoSource` anchor. This violates
  [Public classes use the namespace pattern](../../../../project.invariants.md#public-classes-use-the-namespace-pattern),
  which requires `Static($X)` for a statics-bearing public class. I did not change this separate
  namespace-anchor defect.
- The 10-line and 100,000-line default drives showed no visual bycatch.

## Handoff

- Branch: `fleet/448-static-reads-that-can-block-overrides`
- Task commit: `1908d47010d6e9df33e744f4c1c0bffc092256fd`
- Imported #443 (static-read indirection defeats override) commit:
  `1e6f6dbe677c905dadf66b02090d0102e9b1a947`
- Worktree: clean
