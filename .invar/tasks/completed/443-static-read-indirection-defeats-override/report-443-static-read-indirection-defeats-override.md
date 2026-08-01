## In plain words

Six UI classes asked their base class for timing and layout values. That skipped values supplied by subclasses, so I removed five unused static layers and made Tooltip read its real constructor. The Tooltip subclass now changes the dwell from 0.4 seconds to 0.1 seconds.

## Result

The static-read indirection task (#443) is implemented in commit `1e6f6dbe677c905dadf66b02090d0102e9b1a947`.

I merged `main` as requested. The branch fast-forwarded from `072b24e9` to `ed52b4565b6d81f7ef357bae1d41127a15dfbb11` before the implementation.

The worktree is clean. I used `SKIP_GATE=1` for the commit, as the [task brief](brief-443-1-static-read-indirection-defeats-override.md) requires.

## Ladder decisions

| Class | Rung | Reason and change |
| --- | --- | --- |
| [Tooltip](../../../../src/modules/ui/Tooltip.ts) | 2 | [Tooltip tests](../../../../src/modules/ui/Tooltip.test.ts) read `TOOLTIP_DWELL_SECONDS` outside the instance. I kept the static and now read `(this.constructor as typeof $Tooltip).TOOLTIP_DWELL_SECONDS`. |
| [ShortcutHelp](../../../../src/modules/ui/ShortcutHelp.ts) | 1 | No outside code reads its three cached statics. I replaced them with the existing plain instance getters and removed `Static()`. |
| [ContextMenu](../../../../src/modules/ui/ContextMenu.ts) | 1 | No outside code reads its two frame constants. I kept the values in plain instance getters and removed `Static()`. |
| [HoverCard](../../../../src/modules/ui/HoverCard.ts) | 1 | No outside code reads its seven timing, layout, or language-map statics. I kept their values in plain instance getters and removed `Static()`. |
| [PanelHost](../../../../src/modules/ui/PanelHost.ts) | 1 | No outside code reads `MINIMUM_CELL_RATIO`. I kept `0.12` in the plain `minimumCellRatio` getter and removed `Static()`. |
| [OverlayCoordinator](../../../../src/modules/ui/OverlayCoordinator.ts) | 1 | No outside code reads `$exclusiveOverlayNames`. I kept the list in the plain `exclusiveOverlayNames` getter and removed `Static()`. |

The change deletes all six `protected get <ClassName>()` self-reference getters. It removes 14 internal-only statics and keeps Tooltip's one outside-read static.

## Reproduction and positive control

The [reproduction script](443-static-read-indirection-reproduction.ts) subclasses Tooltip and sets `TOOLTIP_DWELL_SECONDS` to `0.1`.

Before the fix:

```text
constructor read: 0.1
observed read: 0.4
```

The new behavior test failed before the fix at `Tooltip.test.ts:19`:

```text
Expected: false
Received: true
9 pass
1 fail
```

After the fix:

```text
constructor read: 0.1
observed read: 0.1
10 pass
0 fail
54 expect() calls
```

The test observes `tick()`, not the getter itself. A `ShortDwellTooltip` becomes visible after `0.1` seconds.

## Census

The required `rg -n "as unknown as typeof" src` census found four remaining matches. All four are test-only casts outside the six named UI classes:

- One match in [LspProcess.test.ts](../../../../src/modules/lsp/LspProcess.test.ts).
- Three matches in [MonitoringStats.test.ts](../../../../src/modules/monitoring/MonitoringStats.test.ts).

The census found no missed production self-reference getter.

The [structural static-read census](443-census-static-reads-that-block-overrides.ts) found 55 other candidate reads in 14 production classes. Each candidate names its raw class or selected namespace class from instance code. That read shape can defeat a subclass static override.

| Class | Candidate reads |
| --- | ---: |
| [BoundedListPopup](../../../../src/modules/ui/BoundedListPopup.ts) | 20 |
| [TasksDashboardOverview](../../../../src/modules/tasks-dashboard/TasksDashboardOverview.ts) | 9 |
| [BreadcrumbPicker](../../../../src/modules/ui/BreadcrumbPicker.ts) | 4 |
| [LinuxProcessSampler](../../../../src/modules/monitoring/LinuxProcessSampler.ts) | 4 |
| [PanelContentsList](../../../../src/modules/ui/PanelContentsList.ts) | 4 |
| [MonitoringStats](../../../../src/modules/monitoring/MonitoringStats.ts) | 3 |
| [ScrollPhysics](../../../../src/modules/ui/ScrollPhysics.ts) | 3 |
| [MonitoringPlugin](../../../../src/modules/monitoring/MonitoringPlugin.ts) | 2 |
| [CommandBar](../../../../src/modules/ui/CommandBar.ts) | 1 |
| [CompletionPopup](../../../../src/modules/ui/CompletionPopup.ts) | 1 |
| [FfmpegVideoSource](../../../../src/modules/media/FfmpegVideoSource.ts) | 1 |
| [GitWorkspace](../../../../src/modules/git/GitWorkspace.ts) | 1 |
| [SourceTextPaneContent](../../../../src/modules/editor/SourceTextPaneContent.ts) | 1 |
| [StatusBar](../../../../src/modules/ui/StatusBar.ts) | 1 |
| **Total** | **55** |

I did not change these sites. The scan proves the read shape, but this task did not establish whether each site needs rung 2 or deliberately uses rung 3.

## Contract result and proposal

The change upholds [Public classes use the namespace pattern](../../../../project.invariants.md#public-classes-use-the-namespace-pattern). The six edited classes now publish an honest static, reactive, or raw anchor based on their remaining members.

The [UI contract](../../../../src/modules/ui/ui.invariants.md) records each surface's behavior, but it does not state that a live static read follows a subclass. The project contract mentions per-receiver static semantics in a mechanism field. It does not govern the instance read path.

I propose this new chosen record in [project.invariants.md](../../../../project.invariants.md):

### Live static reads follow the receiving class

**Invariant:** If instance behavior reads a live static member that subclasses may override, then the read resolves through the instance constructor.

**Scope:** Instance code in project-owned classes. Internal-only values use plain instance getters. Deliberately fixed statics use a named raw class.

**Mechanism:** `this.constructor` is the receiving class. A raw class name or namespace `Class` slot fixes the read to one base generation.

**Generates:** The three-rung static-read ladder and subclass behavior tests for live static knobs.

**Evidence:** [Tooltip.ts](../../../../src/modules/ui/Tooltip.ts), [Tooltip.test.ts](../../../../src/modules/ui/Tooltip.test.ts), and the [reproduction script](443-static-read-indirection-reproduction.ts).

**Impossible if true:** A subclass returns `0.1` from a live static getter while its inherited instance behavior still uses the base value `0.4`.

**Verification:** `bun test src/modules/ui/Tooltip.test.ts`

**Status:** provisional

**Last refined:** 2026-08-01

I did not edit the contract. The task asks for a proposal, and the invariant workflow keeps proposals separate from confirmed contract changes.

## Verification

| Check | Result |
| --- | --- |
| `bun run drive --size 10` | Settled at 120x40 with `ready=true` and `renderQuiescent=true`. Boot took 280 ms. |
| `bun run drive --size 100000` | Settled at 120x40 with `ready=true` and `renderQuiescent=true`. Boot took 286 ms. |
| Six focused UI test files | 57 passed, 0 failed, 342 expectations. |
| `bun test` | 2,280 passed, 0 failed, 71,818 expectations across 348 files. |
| Invariant checker `--all` and `--refs` | 1,324 annotations and 263 lattice links resolved. It reported 0 problems. |
| `git diff --check` | Passed. |
| `bunx tsc --noEmit` | Failed with exit code 2 on four pre-existing `Drive.ts` errors listed below. |
| `bash scripts/conventions-gate.sh` | Failed on the same TypeScript errors. Its file grammar, static getter naming, AST censuses, and retired-smoke checks passed. |

I did not run `scripts/merge-gate.sh`, as the task brief requires.

## Blocker

TypeScript reports that `resolvedPosition` does not exist on the hover action at these locations:

- [Drive.ts:921](../../../../scripts/harness/Drive.ts#L921)
- [Drive.ts:922](../../../../scripts/harness/Drive.ts#L922)
- [Drive.ts:968](../../../../scripts/harness/Drive.ts#L968)
- [Drive.ts:969](../../../../scripts/harness/Drive.ts#L969)

The task did not change [Drive.ts](../../../../scripts/harness/Drive.ts). The requested `072b24e9..ed52b456` main update also did not change that file. Direct TypeScript and the conventions gate reproduced the same four errors.

## Bycatch

- The structural census found 55 possible override-blocking static reads in 14 production classes. A second run reproduced the same count. See the census section for exact files and counts.
- TypeScript has four pre-existing `Drive.ts` errors. Direct TypeScript and the conventions gate both reproduced them.
- The contract layer does not state the live-static instance-read rule. The proposed project record above closes that gap if accepted.
- The 10-line and 100,000-line default drives showed no visual bycatch.

## Handoff

- Branch: `fleet/443-static-read-indirection-defeats-override`
- Commit: `1e6f6dbe677c905dadf66b02090d0102e9b1a947`
- Worktree: clean
- Conventions: `e0b36c66e95eaa61cdb058590f15edabe4347b4a`
