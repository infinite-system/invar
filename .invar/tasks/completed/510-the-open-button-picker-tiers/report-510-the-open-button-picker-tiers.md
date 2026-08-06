# READY — Task 510, the Open button and picker tiers

## In plain words

Invar had no visible button for opening a file. It now has an Open button and
command that choose the best of three file pickers: the remote client's dialog,
the local machine's dialog, or an in-app file browser. Every selected file then
uses the existing text, media, and read-only opening path.

## Result

Status: READY

Commit on `fleet/510-the-open-button-picker-tiers`:

- `d2bc590dfe5e032bceedca699630ee2d3ba2d51d`
  (`Add the three Open file picker tiers`)

The commit changes 23 files with 1,202 insertions and 20 deletions. The tree is
clean apart from the dispatcher's untracked
[BUILDER-FUNDAMENTALS.md](/home/parallels/dev/invar/.invar/worktrees/510-the-open-button-picker-tiers/BUILDER-FUNDAMENTALS.md),
which I left untouched.

## Delivered behavior

1. Tier 1 is an in-app filesystem browser in
   [FileOpenController.ts](../../../../src/modules/app/FileOpenController.ts).
   It uses the shared
   [BoundedListPopup.ts](../../../../src/modules/ui/BoundedListPopup.ts), puts
   folders before files, caps classified rows at 2,000, supports parent
   navigation, and supports keyboard and pointer selection. A folder or file
   outside the workspace carries a visible `[read-only]` badge.
2. Tier 2 is the
   [NativeFileDialog.ts](../../../../src/modules/system/NativeFileDialog.ts)
   capability. It probes `zenity`, then `kdialog`, then `osascript`
   through [Processes.ts](../../../../src/modules/system/Processes.ts). It uses
   the shared launch policy and falls back to Tier 1 when no dialog is usable.
3. Tier 3 sends `dialog.request` over the channel. The remote app asks the
   local `iv ssh` client to open its native picker. The client uploads the
   chosen file through `drop.upload`, and the remote app opens the dropzone
   path. The local source path never enters the PTY or remote process. The
   implementation is in
   [ChannelDialogBridge.ts](../../../../src/modules/channel/ChannelDialogBridge.ts),
   [ChannelServer.ts](../../../../src/modules/channel/ChannelServer.ts), and
   [SshClient.ts](../../../../src/modules/channel/SshClient.ts). The protocol is
   recorded in
   [iv-channel-protocol.md](../../../../docs/iv-channel-protocol.md).
4. All three tiers pass their selected path to
   [PathDropController.ts](../../../../src/modules/app/PathDropController.ts).
   That is the shared kind seam from
   [Task 508, local drop opens the dropped file](../../completed/508-local-drop-opens-the-dropped-file/the-wave-draft-blessed.md).
   It keeps text, media, and outside-root read-only behavior in one place.
5. The command palette now contains `File: Open...`. The Files frame has the
   same action as a padded icon button. The wiring is in
   [CommandDefaults.ts](../../../../src/modules/commands/CommandDefaults.ts),
   [Bootstrap.ts](../../../../src/modules/app/Bootstrap.ts), and
   [FileTreePaneContent.ts](../../../../src/modules/filetree/FileTreePaneContent.ts).

## Driven appearance proposal

The default Files header changed from:

```text
│                            ⊙ │
                             Reveal
```

to:

```text
│                         ↥  ⊙ │
                          Open Reveal
```

The Open control lives in the Files frame because it controls files. It uses
the same padded header-button geometry as Reveal. This is a proposal, as the
brief requires. The user still rules on the glyph and placement at review.

I drove the default app with native dialogs disabled. A real F1 command-palette
click opened:

```text
│   File: Open...                                                     │
╭─Open File — /tmp/drive-work-pMEP7B─── ×
│ ▸ ..
│   (empty folder)
```

## Verification

The final verification pass was green:

- `bun test`: 2,414 passed, 0 failed, 72,503 expectations across 371 files.
- `bunx tsc --noEmit`: exit 0.
- `bun run build`: exit 0; 455 modules bundled.
- `bun scripts/harness/smoke-file-open-harness.ts`: Tier 1 opened an outside
  file with the visible read-only badge. Tier 2 used a stub `zenity` binary
  to open the shared 100,000-line fixture without opening the fallback popup.
- `bun scripts/harness/smoke-ssh-channel-harness.ts`: the existing small and
  100,000-line uploads stayed green. The new remote Open arm used the
  client-native stub picker, uploaded through the dropzone, and opened the
  remote copy. The local path did not reach SSH output.
- `bun scripts/harness/smoke-tree-scroll-harness.ts`: all Files-header
  geometry, hover, reveal, wheel, and scale checks passed.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`:
  1,386 annotations and 266 lattice links resolved, 0 problems.
- `bash scripts/conventions-gate.sh`: exit 0.

The new picker smoke is
[smoke-file-open-harness.ts](../../../../scripts/harness/smoke-file-open-harness.ts).
It is registered in the behavioral-contract and merge-gate lists. I did not
run [merge-gate.sh](../../../../scripts/merge-gate.sh), as the brief forbids
that builder action.

Positive control: I deliberately removed the initial parent-row selection and
ran the picker smoke. It exited 1 with
`FAIL the workspace parent row is selected first; selected .../workspace/inside.ts`.
I restored the selection. The same smoke then passed all Tier 1 and Tier 2
arms.

## Invariant review

- [File access is confined to a single root](../../../../src/modules/system/system.invariants.md#file-access-is-confined-to-a-single-root):
  **refines**. The current sentence says every Files read or listing stays
  inside the active root. That is not the intended rule for an explicit Open
  or drop choice. This change permits browsing outside the root and opens the
  chosen file read-only. A proposed record is: “A writable workspace file is
  confined to its workspace root. A file explicitly picked or dropped outside
  that root can be listed and opened only read-only. Opening a folder changes
  the active root.” The record was not changed because the brief says the
  refinement stays proposed.
- [External tools share one launch policy](../../../../src/modules/system/system.invariants.md#external-tools-share-one-launch-policy):
  **upheld**. Dialog detection uses `Processes.which`. Dialog execution uses
  `Processes.run`, which uses the shared shell-free spawn and hermetic
  environment.
- [Input overlays share one modal slot](../../../../src/modules/ui/ui.invariants.md#input-overlays-share-one-modal-slot):
  **upheld in code, but the record scope misses a consumer**.
  `FileOpenController` opens `boundedListPopup` only through
  `OverlayCoordinator.openExclusiveOverlay`. The record's Scope and Evidence
  lists omit `BoundedListPopup`. The proposed refinement adds it as an input
  overlay and cites this controller and smoke.
- [Small icon buttons include their padding](../../../../design.invariants.md#small-icon-buttons-include-their-padding)
  and
  [Controls live in the frame they control](../../../../design.invariants.md#controls-live-in-the-frame-they-control):
  **upheld**. The new control uses `FileTreeHeaderRow` button geometry inside
  the Files frame. The short-tree and overflowing-tree drives passed.

## Bycatch

- **Reproduced twice, not fixed:** the welcome screen says `Ctrl+P command
  palette`. Pressing Ctrl+P opens `Go to File`, not the command palette.
  The first reproduction was on the initial default drive. The second was
  after closing the new Open browser and pressing Ctrl+P in a fresh app.
- **Contract wording drift, not fixed:** the confined-root record says all
  reads and listings through `Files` stay inside the workspace. Explicit
  outside-root drop and picker behavior already requires read-only access.
  The exact proposed refinement is in the invariant review.
- **Contract scope drift, not fixed:** the modal-slot record omits
  `BoundedListPopup`, although that popup is registered with
  `OverlayCoordinator` and this new input path uses the coordinator.
- **Contract-layer gap, not fixed:** 
  [src/modules/channel](../../../../src/modules/channel) now owns upload,
  request, response, socket, and SSH bridge behavior, but it has no domain
  invariant record or channel lattice. Project records cover the
  general boundaries, but no domain record states the channel's direction,
  capability, framing, or local-path privacy rules.

## Instrument feedback

- EASY: the warm DriveSession kept the app live across palette, pointer, and
  Ctrl+P probes. Graph waits named the exact overlay state, and per-screen
  output made the Open placement easy to review.
- CONFUSING: the DriveSession `show` projection accepts published status
  names, not live graph paths. Trying `commands.open` there failed even
  though `waitFor('commands.open', true)` works. One error hint that lists
  the two namespaces would remove this guess.
- MISSING: the Files-header Open action has no published role or accessible
  name in the PTY driver. The remote smoke had to resolve the current
  ThemeIcons glyph tier and find that visible mark. A generic screen role or
  tooltip lookup would let probes locate icon controls without knowing their
  glyph vocabulary.

## Notes for the conductor

- The session socket has a unique
  `/tmp/invar-channel-<session>.sock` name, mode 0600, a strict path check,
  and exact owned-path cleanup.
- Native picker cancellation stops the Open action. Missing or broken native
  picker tools fall through to the in-app browser.
- The driver server was stopped before READY.
