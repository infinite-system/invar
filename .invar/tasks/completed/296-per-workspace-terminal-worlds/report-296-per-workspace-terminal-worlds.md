# READY — per-workspace terminal worlds (#296)

State: READY

Branch: `fleet/296-per-workspace-terminal-worlds`

Commit: `f34e8ded330d5d5d0b85fb7980eddf69e907979e`

Worktree: clean

## Result

Each workspace now owns one independent bottom-panel world. A workspace switch changes the selected
content set. It does not dispose hidden terminal processes, task processes, agent sessions,
scrollback, transcripts, layout, visibility, or focus selection.

The implementation covers both polarities:

- Workspace A pane identifiers never enter workspace B's selected set.
- A to B to A restores A's exact content identifiers, cells, and terminal scrollback.
- A new terminal in B is labelled `Terminal` and stays in B.
- A new agent in B is labelled `Agent` and stays in B.
- Task panes follow the same ownership rule.

The governing record is now
[Each workspace owns one panel world](../../../../src/modules/workspace/workspace.invariants.md#each-workspace-owns-one-panel-world).
The lifecycle exception in
[project architecture](../../../../project.architecture.md#lifecycle-tiers) now states the
matching session and disposal rules.

## Reproduction

I drove the default app before I wrote an assertion. I opened workspace A, then opened workspace B
through the visible project picker.

The defective B frame showed both task sessions in the panel list:

```text
24 │ ... │ ❯ Claude ... × │ ❯ Claude     x││
25 │ ... │                │ ❯ Claude     x││
```

The published fingerprint also mixed both roots:

```text
activeWorkspace="b"
workspaceCount=2
panelActiveContent="task:%2Ftmp%2F296-terminal-worlds-drive-ofxwpB%2Fb:0"
panelContentIds=[
  "agent",
  "terminal",
  "task:%2Ftmp%2F296-terminal-worlds-drive-ofxwpB%2Fa:0",
  "task:%2Ftmp%2F296-terminal-worlds-drive-ofxwpB%2Fb:0"
]
panelContentKinds=[
  "task:%2Ftmp%2F296-terminal-worlds-drive-ofxwpB%2Fa:0",
  "task:%2Ftmp%2F296-terminal-worlds-drive-ofxwpB%2Fb:0"
]
panelContentLabels=["Claude","Claude"]
```

After the fix, the same default drive selected only B:

```text
activeWorkspace="b"
panelActiveContent="task:%2Ftmp%2F296-terminal-worlds-drive-ofxwpB%2Fb:0"
panelCellIds=["task:%2Ftmp%2F296-terminal-worlds-drive-ofxwpB%2Fb:0"]
panelContentIds=[
  "agent",
  "terminal",
  "task:%2Ftmp%2F296-terminal-worlds-drive-ofxwpB%2Fb:0"
]
panelContentKinds=["task:%2Ftmp%2F296-terminal-worlds-drive-ofxwpB%2Fb:0"]
panelContentLabels=["Claude"]
```

The reverse drive selected A again. Its exact A task identifier returned. No B identifier remained.

## Implementation

- [PanelHost](../../../../src/modules/ui/PanelHost.ts) now owns multiple `PanelContentSet` values
  behind one stable reactive projection. Selection snapshots and restores order, visibility, focus,
  expansion, active content, split layout, and focused cell.
- [WorkspaceSet](../../../../src/modules/workspace/WorkspaceSet.ts) publishes synchronous activation
  and final-disposal events. A new workspace becomes selected after its root is set and before its
  contributors open.
- [Bootstrap](../../../../src/modules/app/Bootstrap.ts) maps each `Workspace` to one content set.
  Terminal, agent, and task creation always targets the active workspace's set.
- [PaneRuntimes](../../../../src/modules/ui/PaneRuntimes.ts) numbers labels per workspace scope.
  Opaque identifiers remain application-unique. The first terminal in B is `terminal@2` with the
  user label `Terminal`.
- [TerminalPlugin](../../../../src/modules/terminal/TerminalPlugin.ts) resolves its current terminal
  only from the active workspace world. An inactive terminal cannot project status or answer an
  active-workspace consumer.
- Agent lookup, narration, and terminal-follow wiring now resolve from the active workspace world.
  A switch reconnects the follow controller without touching either hidden session.

The panel disposal path preserves
[Panel content order is one persisted sequence](../../../../src/modules/ui/ui.invariants.md#panel-content-order-is-one-persisted-sequence).
The final panel-split check exposed an early version that removed the saved order during app
shutdown. The corrected path clears and disposes the selected world without rewriting the persisted
order. A second boot now restores `terminal,agent`.

## Disposal decision

Closing a workspace selects a surviving neighbour, then disposes only the closed workspace's
content set. Every pane in that set reaches its existing `dispose` seam.

Other lifecycle events stay separate:

- Hiding the panel keeps its sessions alive.
- Switching workspaces keeps the hidden workspace's sessions alive.
- Closing one pane disposes only that pane.
- Runtime withdrawal removes that runtime's panes from every workspace set, including inactive
  sets.
- App disposal releases every remaining workspace world.

This decision refines
[Each panel instance owns one independent session](../../../../src/modules/ui/ui.invariants.md#each-panel-instance-owns-one-independent-session),
[A pane runtime owns its processes](../../../../src/modules/ui/ui.invariants.md#a-pane-runtime-owns-its-processes),
[The terminal is a runtime plugin](../../../../src/modules/terminal/terminal.invariants.md#the-terminal-is-a-runtime-plugin),
and
[The agent pane is a PaneContent citizen not a special case](../../../../src/modules/agent/agent.invariants.md#the-agent-pane-is-a-panecontent-citizen-not-a-special-case).

## Restored contract

The
[workspace-tabs PTY harness](../../../../scripts/harness/smoke-workspace-tabs-harness.ts) now drives
the complete user path.

It uses the existing scale pair:

- Tiny workspace: 3 tracked child directories.
- Wide workspace: 520 tracked child directories and 600 ignored packages.

The harness starts the built-in task in both roots. It creates an interactive terminal in A and
prints `WORLD_A_296`. It opens B and proves that A's task identifier and marker are absent. It then
creates a terminal and an agent in B and prints `WORLD_B_296`.

The B to A switch requires A's exact content identifiers and exact cell identifiers. It also
requires `WORLD_A_296` and forbids `WORLD_B_296`. The A to B switch makes the symmetric checks. This
proves that the two shell processes and their scrollback survived while hidden.

Unit contracts cover content-set isolation, exact restoration, inactive-set runtime withdrawal,
workspace event ordering, workspace-close disposal, application-unique identities, local instance
labels, active-workspace terminal selection, and persisted-order survival across selected-world
disposal.

## Positive controls

I disabled the call that selects the new workspace's content set. The PTY contract went red on the
original defect:

```text
Timed out waiting for the second workspace projects only its declared task pane
```

That plant covers isolation, both switch polarities, local terminal creation, local agent creation,
and scrollback restoration. I removed it before the green run.

I then disabled pane disposal inside hidden-world disposal. The focused unit contract went red:

```text
Expected: true
Received: false
at expect(secondTask.disposed).toBe(true)
```

I removed that plant before the green run.

The final panel-split smoke supplied another real red control for persistence. The first disposal
implementation timed out on restart:

```text
Timed out waiting for status condition:
status.panelCellIds.join(',') === 'terminal,agent' &&
status.panelContentOrder.join(',') === 'terminal,agent'
```

The corrected disposal path passed the same second-boot condition.

## Verification

- `bun test` — 1,949 pass, 0 fail, 68,770 expectations across 297 files.
- `bun run typecheck` — pass.
- `bash scripts/conventions-gate.sh` — pass.
- Invariant checker — 1,146 annotations, 221 lattice links, 0 problems.
- `bun scripts/harness/smoke-terminal-harness.ts` — `ALL-PASS`.
- `bun scripts/harness/smoke-panel-split-harness.ts` — `ALL-PASS`.
- `bun scripts/harness/smoke-panel-chrome-harness.ts` — `ALL-PASS`.
- `bun scripts/harness/smoke-workspace-tabs-harness.ts` — `ALL-PASS`.
- Mandatory pre-commit merge gate — `ALL-PASS`.
- Parallel PTY pool — 62 jobs passed.
- Serial tail — behavioral contracts, agent permissions, overlay dialogs, and the timing trend
  passed.
- Commit — `f34e8ded330d5d5d0b85fb7980eddf69e907979e`.
- Worktree — clean.

## Bycatch

- The full gate's
  [panel-chrome harness](../../../../scripts/harness/smoke-panel-chrome-harness.ts) timed out once
  under parallel-pool starvation. Its immediate quiet retry passed. The failure did not reproduce a
  second time.
- The full gate's
  [overlay-dialog harness](../../../../scripts/harness/smoke-overlay-dialog-harness.ts) timed out
  once in the serial tail. Its immediate quiet retry passed. The failure did not reproduce a second
  time.
- Link drift: the untracked worktree copy of the
  [task record](task-296-per-workspace-terminal-worlds.md) used a task-folder-relative contract path
  from the worktree root and omitted the invariant anchor. The invariant checker first reported
  `contract link needs an anchor`, then proved that the copied path resolved outside the repository.
  I corrected only the local task input to
  [Peer plugins can have different lifetimes](../../../../src/modules/plugins/plugins.invariants.md#peer-plugins-can-have-different-lifetimes).
  The file is not part of commit `f34e8ded`.
