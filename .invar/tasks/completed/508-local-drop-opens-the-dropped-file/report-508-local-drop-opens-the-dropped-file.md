# READY — Task 508 local drop opens the dropped file

## In plain words

Invar used to treat a dropped file path like pasted text, so the file stayed closed. It now opens
text files in the editor, pictures and videos in Media, and folders in a confirmation popup. A file
from outside the workspace opens read-only and shows a badge, so Invar cannot save over it.

## Result

Status: READY

Commit: `0f0961b8fa3a4366455bcc97b399d703694661c9` (`Open dropped local paths by file kind`)

All task changes are committed. The dispatcher-created untracked fundamentals file remains
untouched.

## Reproduction and result

I drove the default app at dispatched commit `b0170757cbbade594789fa92781895ed4214bee8`.
A bracketed paste containing the existing [AGENTS.md](../../../../AGENTS.md) path caused no repaint and left
`activeBuffer=null`. That was the visible defect.

The task's mode-2004 premise had drifted. The dispatched app already emitted DECSET 2004 at boot
and after focus recovery through
[TerminalSession.ts](../../../../src/modules/app/TerminalSession.ts). I kept that one mode seam and
made the existing paste smoke assert both emissions.

The fixed route is:

| Framed content | Visible result |
| --- | --- |
| One text path | Opens an editable editor tab and gives it focus. |
| Several quoted or escaped text paths | Opens every tab and activates the last one. |
| Image path | Opens a still-image Media pane. |
| Video path | Opens a Media pane backed by ffmpeg. |
| Directory path | Opens an `Open dropped folder` workspace offer. |
| File outside the workspace | Opens read-only with a visible `[read-only]` badge. |
| The same path typed without framing | Does not open a file. The bytes continue through normal input routing. |

The final default drive opened [AGENTS.md](../../../../AGENTS.md) with
`activeBufferReadOnly=false` and `focus=editor`.
The final shared 100,000-line drive opened `/etc/hosts` with `activeBufferReadOnly=true`,
`focus=editor`, and visible text `hosts [read-only]`. Small and large fixtures therefore use the
same route and outcome.

## Changes

- [PathDropController.ts](../../../../src/modules/app/PathDropController.ts) parses complete shell
  tokens, accepts a paste only when every token resolves to an existing path, and owns text and
  folder routing.
- [ApplicationContributions.ts](../../../../src/modules/app/ApplicationContributions.ts) gives
  active contributors one scoped dropped-path opener registration. Disabling a contributor removes
  its opener.
- [MediaPlugin.ts](../../../../src/modules/media/MediaPlugin.ts) claims supported image and video
  extensions without teaching the host media vocabulary. It opens one generic runtime-pane request
  per dropped file.
- [MediaPaneContent.ts](../../../../src/modules/media/MediaPaneContent.ts) presents decoded still
  images. [FfmpegVideoSource.ts](../../../../src/modules/media/FfmpegVideoSource.ts) reads a dropped
  video into the existing bounded two-frame path.
- [OpenBufferSet.ts](../../../../src/modules/workspace/OpenBufferSet.ts) keeps the read-only fact
  across tab focus and buffer rehydration. [Editor.ts](../../../../src/modules/editor/Editor.ts)
  blocks edits and Save for that file.
- [TabBarRenderer.ts](../../../../src/modules/ui/TabBarRenderer.ts) now paints the label supplied by
  the buffer layer, which makes the read-only badge visible.
- [smoke-paste-harness.ts](../../../../scripts/harness/smoke-paste-harness.ts) drives single-quoted,
  double-quoted, escaped, multi-file, image, video, directory, outside-root, and unbracketed cases
  through the real PTY.
- [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md),
  [ui.lattice.md](../../../../src/modules/ui/ui.lattice.md),
  [media.invariants.md](../../../../src/modules/media/media.invariants.md), and
  [project.invariants.md](../../../../project.invariants.md) now describe the paste fallback and
  scoped plugin opener seams.

## Invariant review

The filed [brief](brief-508-1-local-drop-opens-the-dropped-file.md) named three records. Path and
annotation scope added the paste, plugin-boundary, and media records below.

| Record | Verdict | Evidence |
| --- | --- | --- |
| [Terminal bytes cross exactly one backend seam](../../../../src/modules/terminal/terminal.invariants.md#terminal-bytes-cross-exactly-one-backend-seam) | upheld | Existing-path paste stops at the outer app paste dispatcher. Every rejected paste still reaches a terminal child only through `TerminalInstance` and `TerminalBackend`. The smoke retained its exact 10-byte, 1 KB, and 64 KB terminal payload checks. |
| [File access is confined to a single root](../../../../src/modules/system/system.invariants.md#file-access-is-confined-to-a-single-root) | refines | The literal record forbids the task's explicit outside-root read. The driven working rule opens that file read-only with a badge and blocks Save. The replacement text below remains proposed only. |
| [Focus owns the keystroke](../../../../src/modules/keybindings/keybindings.invariants.md#focus-owns-the-keystroke) | upheld | Detection runs only for one complete bracketed-paste event. An unbracketed existing path did not open a file, and the later reserved panel chord still ran. No key route changed. |
| [Bracketed paste survives stream chunking](../../../../src/modules/ui/ui.invariants.md#bracketed-paste-survives-stream-chunking) | strengthened | The record and lattice now generate one path-drop branch followed by the unchanged focused-input fallback. Marker-edge and large-payload coverage remains green. |
| [Plugin boundaries grant one authority](../../../../project.invariants.md#plugin-boundaries-grant-one-authority) | strengthened | Media registers a dropped-path opener during activation. It does not add a query method to `ApplicationContributor`, and a disabled Media contribution cannot claim a path. |
| [Animated media is a removable runtime plugin](../../../../src/modules/media/media.invariants.md#animated-media-is-a-removable-runtime-plugin) | strengthened | Dropped images and videos enter through the registered opener and generic pane runtime. The removal build found no host reference after the media module and its two manifest lines were removed. |

Invariant verdict: REFINE for the existing root-confinement record. All other scoped records pass.
The [brief](brief-508-1-local-drop-opens-the-dropped-file.md) already states the same working rule,
and the direct drives supply the behavior evidence. A human still owns the record decision.

## Proposed root-confinement refinement

This text was not written into
[system.invariants.md](../../../../src/modules/system/system.invariants.md).

### Explicit file crossings are visible and non-mutating

**Invariant:** If Invar reads a path outside the active workspace root, then an explicit drop or
picker selected it and one of two things follows: a file opens read-only with a visible badge, or a
confirmed directory offer changes the active root before traversal. Every implicit traversal stays
inside the active root.

**Scope:** `Files.confineToRoot`, `PathDropController`, `Workspace.openFileInTab`, `OpenBufferSet`,
`Editor`, buffer-tab labels, and the dropped-directory workspace offer. Import into a workspace is
a future explicit crossing and is outside this version.

**Mechanism:** `PathDropController` compares each file with the active root. A crossing sets the
buffer's sticky `readOnly` fact; `Editor` rejects edits and Save; the tab label shows
`[read-only]`. A directory remains unopened until the user accepts the popup item that calls
`WorkspaceSet.open`.

**Generates:** Read-only external file inspection; a visible crossing; confirmed workspace-root
changes; unchanged file-tree confinement.

**Impossible if true:** An outside-root dropped file accepts an edit or a Save write; an external
file opens without a badge; a dropped folder changes the workspace without confirmation; ordinary
tree traversal escapes the root.

**Verification:** `bun test src/modules/app/PathDropController.test.ts
src/modules/workspace/OpenBufferSet.test.ts src/modules/editor/Editor.test.ts && bun
scripts/harness/smoke-paste-harness.ts`

**Status:** proposed

## Positive control

I planted one branch in `PathDropController.handlePaste` that rejected every non-empty existing-path
set. The real PTY smoke exited 1 with this failure:

```text
error: Timed out waiting for the single-quoted image path opens a media pane
```

I removed the branch. The same smoke then reached `smoke-paste-harness: ALL-PASS`.

## Verification

- Direct default drive — in-root [AGENTS.md](../../../../AGENTS.md) opened editable with editor focus.
- Direct 100,000-line drive — `/etc/hosts` opened read-only with the visible badge and editor focus.
- `bun scripts/harness/smoke-paste-harness.ts` — ALL-PASS for every new route and all existing
  editor, terminal, composer, chunk-boundary, and focus-recovery cases.
- `bun test` — 2,394 passed, 0 failed, 72,255 expectations across 360 files.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` — 1,383 annotations and
  266 lattice links resolved, 0 problems.
- `bunx tsc --noEmit` — stopped only at the pre-existing
  `scripts/tasks/tasks-status.ts(193,3)` error: `Type '"draft"' is not assignable to type
  'TaskState'`.
- `bash scripts/conventions-gate.sh` — every task-owned check passed. The command stopped on the same
  pre-existing TypeScript error.
- Media-removal build at commit `0f0961b8` — after removing `src/modules/media/` and the two
  [DefaultPlugins.ts](../../../../src/modules/plugins/DefaultPlugins.ts) manifest lines, TypeScript
  reported only the same pre-existing task-state error and no media or host error.
- `git diff --check` — PASS before commit.

I did not run `scripts/merge-gate.sh` or the full behavioral-contract suite.

## Instrument feedback

- EASY: The warm [DriveSession guide](../../../../scripts/harness/drive.md) let one raw framed paste
  prove each route. `activeBuffer`, `activeBufferReadOnly`, focus, media mode, and popup state made
  the result exact.
- CONFUSING: A Media pane's instance filename is published as `panelActiveContentLabel`, but the
  visible group header says only `Media`. My first filename screen wait timed out even though the
  correct pane was open. The semantic status field made the distinction clear.
- MISSING: The status projection had no read-only field. This task added
  `activeBufferReadOnly` in
  [AppStatusProjection.ts](../../../../src/modules/app/AppStatusProjection.ts), so later drives can
  distinguish a protected external file from an ordinary tab without inferring from paint alone.

## Bycatch

- TASK DRIFT: The [brief](brief-508-1-local-drop-opens-the-dropped-file.md) says mode 2004 was never
  enabled. The dispatched base already enabled it at boot and focus recovery through
  [TerminalSession.ts](../../../../src/modules/app/TerminalSession.ts). I did not duplicate that
  seam.
- PRE-EXISTING: [tasks-status.ts](../../../../scripts/tasks/tasks-status.ts) includes `'draft'` at
  line 193, but `TaskState` does not. `bunx tsc --noEmit` failed on the dispatched base and on the
  finished branch with the same error. Commit `4701abb9e` introduced that line. I did not change it.
- CONTRACT VIOLATION: [FfmpegVideoSource.ts](../../../../src/modules/media/FfmpegVideoSource.ts)
  calls `Bun.spawnSync(['mkfifo', ...])` directly. That bypasses
  [External tools share one launch policy](../../../../src/modules/system/system.invariants.md#external-tools-share-one-launch-policy),
  whose scope permits only the interactive PTY exemption. This call pre-dates this task. I did not
  move the shared process seam while adding dropped-video arguments.

No other runtime bycatch appeared in the default or 100,000-line drives.
