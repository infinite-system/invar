# READY — Task 509 iv ssh the channel client

## In plain words

`iv ssh` now opens Invar on another computer without changing terminal keys, screen bytes, window
size, or the program's exit code. Pasting a local file path uploads that file through a private SSH
channel and opens the uploaded copy in remote Invar. Small files and a 100,000-line file use the
same route and produce the same result.

## Result

Status: READY

Task commits:

- `c3902bc27f31064cba81afb17e0863750f05e157` (`ssh: add the iv channel client`)
- `d72b5826581756ecbf88ef48dedefcb8e57de1de` (`ssh: fix dropzone test path typing`)

Dependency merge: `2f3636f7556737d6ea0588164ba1181cc876f379` (`Merge task 508 drop
routing dependency`). It brings in `0f0961b8fa3a4366455bcc97b399d703694661c9` from
[task 508 local drop routing](../508-local-drop-opens-the-dropped-file/report-508-local-drop-opens-the-dropped-file.md).

All task changes are committed. The dispatcher-created untracked `BUILDER-FUNDAMENTALS.md` file
remains untouched.

## Reproduction and result

At dispatched commit `1ff494b9cd064aac11ebf413c0504e5ff25d4c33`, `bun run drive -- --serve
--open ssh` opened a local workspace named `ssh`. There was no SSH command route.

The finished compiled [iv binary entry](../../../../src/modules/app/AppLoader.ts) recognizes `iv ssh`
and the private `--channel-server` entry. The localhost PTY smoke proves these results through one
isolated OpenSSH server:

| Driven case | Result |
| --- | --- |
| Small local file paste | Local path stayed out of SSH output. The uploaded dropzone copy opened in remote Invar. |
| Shared 100,000-line file paste | The same upload and open route completed. |
| Resize | The remote app settled at 96 columns by 32 rows. |
| Remote exit 23 | The local `iv ssh` process exited 23. |
| Remote OSC 52 copy | The host received the exact payload. |
| Keyboard sweep | All 30 control, escape, UTF-8, function-key, and navigation encodings stayed exact and ordered. |

## Transport and protocol

The exact version 1.0 wire contract is in
[iv-channel-protocol.md](../../../../docs/iv-channel-protocol.md). `iv ssh` starts one OpenSSH
control master, then opens two sessions through it. The interactive session owns the PTY. A stock
SSH exec session runs `iv --channel-server` without a PTY and carries framed RPC.

This transport needs no sshd subsystem configuration and opens no listening port. OpenSSH owns
authentication, multiplexing, flow control, and cleanup. A frame has a fixed 16-byte prefix, a
bounded JSON header, and a bounded binary body. The protocol defines negotiation, request and
response identity, stream identity, cancellation, version errors, method errors, and the reserved
`drop.*`, `dialog.*`, `fs.*`, and `pty.*` namespaces.

The request direction is not fixed. A later local Invar can ask remote providers for files, PTYs,
git, or language services without replacing the frame or capability model. Version 1.0 implements
only `drop.upload`.

## Changes

- [ChannelFrame.ts](../../../../src/modules/channel/ChannelFrame.ts) owns the incremental frame
  codec. Its tests split frames at every read boundary.
- [ChannelClient.ts](../../../../src/modules/channel/ChannelClient.ts),
  [ChannelServer.ts](../../../../src/modules/channel/ChannelServer.ts), and
  [ChannelStreamQueue.ts](../../../../src/modules/channel/ChannelStreamQueue.ts) own negotiation,
  RPC identity, streamed upload, response errors, cancellation, and stream ordering.
- [Dropzone.ts](../../../../src/modules/channel/Dropzone.ts) streams content into
  `~/.cache/invar/dropzone/<sha256>-<safe-name>`, sets mode `0600`, removes cargo older than 24
  hours, and evicts the oldest cargo until the total is at most 1 GiB. A hash mismatch removes the
  partial result.
- [BracketedPathPaste.ts](../../../../src/modules/channel/BracketedPathPaste.ts) intercepts only a
  complete bracketed paste in which every shell token names an existing local regular file. It
  uploads those files and forwards private content-addressed notifications. Every other byte keeps
  its identity and order. A lone Escape flushes on the next event-loop turn instead of waiting
  forever for a possible paste marker.
- [ChannelDropNotification.ts](../../../../src/modules/channel/ChannelDropNotification.ts) accepts
  only an existing content-addressed regular file inside the configured remote dropzone.
- [SshClient.ts](../../../../src/modules/channel/SshClient.ts) uses the existing `Processes` and
  `OpenPty` seams. It owns raw-mode restoration, controlling-terminal setup, resize signals,
  process signals, the control socket, and exact interactive exit status.
- [Bootstrap.ts](../../../../src/modules/app/Bootstrap.ts) sends a verified remote drop path to the
  [PathDropController.ts](../../../../src/modules/app/PathDropController.ts) route from task 508.
  Ordinary paste still uses the same controller's parsing and fallback route.
- [smoke-ssh-channel-harness.ts](../../../../scripts/harness/smoke-ssh-channel-harness.ts) builds a
  temporary binary, starts an isolated localhost sshd, drives the real PTY, and checks uploads,
  remote open, resize, exit status, OSC 52, and 30 keyboard encodings. It uses the shared
  [make-scale-workspace.ts](../../../../scripts/make-scale-workspace.ts) fixture for the 100,000-line
  case.
- [behavioral-contracts.sh](../../../../scripts/behavioral-contracts.sh) now includes that SSH smoke
  as one end-state contract.

## Invariant review

The filed [brief](brief-509-1-iv-ssh-the-channel-client.md) names three records. The channel also
touches the bracketed-paste and root-crossing records.

| Record | Verdict | Evidence |
| --- | --- | --- |
| [Terminal bytes cross exactly one backend seam](../../../../src/modules/terminal/terminal.invariants.md#terminal-bytes-cross-exactly-one-backend-seam) | upheld | RPC frames travel only on the non-PTY exec session. Interactive bytes enter the remote terminal only through the SSH PTY. A drop notification returns through that same input seam and stops at the outer paste dispatcher. |
| [A copy reaches the host terminal](../../../../src/modules/terminal/terminal.invariants.md#a-copy-reaches-the-host-terminal) | upheld | The localhost smoke made remote Invar emit OSC 52 and matched the exact payload at local stdout. |
| [External tools share one launch policy](../../../../src/modules/system/system.invariants.md#external-tools-share-one-launch-policy) | upheld for this task | Every production `ssh` and `setsid` launch uses `Processes`. `OpenPty` remains the recorded interactive PTY exception. The inherited ffmpeg violation is listed under bycatch. |
| [Bracketed paste survives stream chunking](../../../../src/modules/ui/ui.invariants.md#bracketed-paste-survives-stream-chunking) | upheld | The wrapper parser survives every marker split, and the existing paste smoke remains green for 10-byte, 1 KiB, and 64 KiB payloads. Non-path paste continues to the focused route. |
| [File access is confined to a single root](../../../../src/modules/system/system.invariants.md#file-access-is-confined-to-a-single-root) | uses the task 508 proposed refinement | A channel notification can name only a verified file in the private remote dropzone. The integrated task 508 route opens that outside-workspace copy read-only. Its report proposes the record change; this task does not decide it. |

Invariant verdict: PASS for the channel design and implementation. The pre-existing root record
still needs the human decision recorded by
[task 508 local drop routing](../508-local-drop-opens-the-dropped-file/report-508-local-drop-opens-the-dropped-file.md#proposed-root-confinement-refinement).

## Proposed channel records

These records were not written into an invariant file.

### Channel frames survive stream chunking

**Invariant:** If two peers exchange an Invar channel frame, any split or grouping of transport
reads produces the same ordered frame sequence.

**Scope:** `ChannelFrame`, `ChannelClient`, `ChannelServer`, channel negotiation, requests,
responses, cancellation, and attached streams.

**Mechanism:** One fixed prefix declares bounded header and body lengths. The decoder retains an
incomplete suffix and emits only a complete validated frame.

**Generates:** Split headers, split bodies, joined frames, empty reads, and ordered binary streams.

**Impossible if true:** A transport read boundary becomes a message boundary; a partial frame is
dispatched; a bad length consumes bytes from a later frame.

**Verification:** `bun test src/modules/channel/ChannelFrame.test.ts
src/modules/channel/ChannelClient.test.ts src/modules/channel/ChannelServer.test.ts`

**Status:** proposed

### Channel bytes never enter the terminal stream

**Invariant:** If `iv ssh` carries a private channel and an interactive terminal through one SSH
connection, no channel frame can become terminal input or terminal output.

**Scope:** `SshClient`, the OpenSSH control master, the non-PTY channel exec session, the
interactive PTY session, and remote `ChannelServer`.

**Mechanism:** OpenSSH session channels are separate byte streams. `SshClient` wires framed RPC only
to the non-PTY child and wires terminal input and output only to `OpenPty`.

**Generates:** Concurrent uploads and terminal paint, remote RPC errors, cancellation, and later
bidirectional provider methods.

**Impossible if true:** An upload frame paints on screen; a terminal escape sequence reaches the
RPC decoder; channel cancellation kills or rewrites terminal input.

**Verification:** `bun scripts/harness/smoke-ssh-channel-harness.ts`

**Status:** proposed

### Non-drop terminal bytes keep their identity

**Invariant:** If local terminal input is not one complete existing-file bracketed paste, `iv ssh`
forwards every input byte once, in order, with the same value.

**Scope:** `BracketedPathPaste`, `SshClient`, local raw input, and the interactive SSH PTY.

**Mechanism:** The parser retains only prefixes that can still become a bracketed-paste marker. It
flushes every rejected prefix and payload to one ordered PTY write chain.

**Generates:** Single Escape, split markers, ordinary bracketed paste, UTF-8, navigation keys,
function keys, and control bytes.

**Impossible if true:** Escape waits forever; a near-marker loses bytes; an ordinary paste uploads;
two input chunks reorder.

**Verification:** `bun test src/modules/channel/BracketedPathPaste.test.ts && bun
scripts/harness/smoke-ssh-channel-harness.ts`

**Status:** proposed

## Positive control

I planted a one-byte loss at the `SshClient` input to the paste parser. The real localhost PTY smoke
exited 1 with this failure:

```text
error: Timed out waiting for grid condition: the harness snapshot satisfies (snapshot) =>
snapshot.findText("SmallRecord") !== null
```

I removed the defect. The same smoke then reached `smoke-ssh-channel-harness: ALL-PASS`. The smoke
also carries a local wrong-byte expectation and proves that its keyboard comparator rejects it.

## Verification

- `bun test` — 2,408 passed, 0 failed, 72,480 expectations across 368 files.
- `bun run build` — compiled 452 modules into `dist/iv`.
- `bun scripts/harness/smoke-paste-harness.ts` — ALL-PASS, including split markers, 10-byte, 1 KiB,
  64 KiB, staged input, animated input, and focus recovery.
- `bun scripts/harness/smoke-ssh-channel-harness.ts` — ALL-PASS for the isolated sshd, small and
  100,000-line uploads, remote open, 96 by 32 resize, exit 23, OSC 52, and 30 keyboard encodings.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` — 1,383 annotations and
  266 lattice links resolved, 0 problems.
- `bash scripts/conventions-gate.sh` — task-owned checks passed. The command exited 1 on the two
  pre-existing failures listed under bycatch.
- `git diff --check` — PASS.

I did not run `scripts/merge-gate.sh` or the full behavioral-contract suite.

## Instrument feedback

- EASY: [PtyTestDriver.ts](../../../../scripts/harness/PtyTestDriver.ts), an isolated stock sshd,
  and the shared scale fixture made the interactive path repeatable without adding a test-only app
  route.
- CONFUSING: A local `PtyTestDriver.resize` changes the local emulator before it proves that the
  remote PTY changed. The remote `TUI_STATUS_PATH` report supplied the required end-state condition
  and exposed the missing controlling terminal.
- MISSING: The existing `smoke-keyboard-invariant.sh` has no launch-command override. The new PTY
  smoke therefore reuses its 30 pass-through encodings through `iv ssh`, but it cannot run the old
  script itself through the wrapper. A shared byte-sweep data module would remove that duplication.

## Bycatch

- PRE-EXISTING: [tasks-status.ts](../../../../scripts/tasks/tasks-status.ts) returns `'draft'` at
  line 193, but `TaskState` excludes it. `bun x tsc --noEmit` and the conventions gate stop with
  `TS2322`. The task-owned TypeScript files have no remaining error.
- PRE-EXISTING: The conventions gate reports one core-to-plugin import ratchet in
  [DefaultPlugins.ts](../../../../src/modules/plugins/DefaultPlugins.ts). It lists value imports from
  `editor`, `filetree`, `git`, `markdown`, `lsp`, `media`, `monitoring`, `terminal`, and
  `inline-rewrite`. This task did not redraw the plugin manifest boundary.
- CONTRACT VIOLATION: [FfmpegVideoSource.ts](../../../../src/modules/media/FfmpegVideoSource.ts)
  still calls `Bun.spawnSync(['mkfifo', ...])` directly. That bypasses
  [External tools share one launch policy](../../../../src/modules/system/system.invariants.md#external-tools-share-one-launch-policy).
  The call predates this task and arrived through the task 508 dependency merge.
- RUNTIME: During the first small-upload timeout, the remote Terminal pane showed Claude Code's
  `Quick safety check` prompt even though the harness set `INVAR_AGENT_BACKEND=echo`. The prompt
  reproduced during later failed probes. The SSH channel did not depend on that pane, so I did not
  change agent startup policy.

