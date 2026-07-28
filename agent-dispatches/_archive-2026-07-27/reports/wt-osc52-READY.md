# OSC 52 frame boundary and streamed paste — READY

## Result

Branch: `fix-osc52-frame-boundary`

Rebased base: `4cd1bd70a0b45964fb218670822c7e146209cfee` (`main`)

Tip: `4a45aace75009cd300a0d714eadfde06d67cbadb`

Commit: `fix(io): serialize clipboard output and stream paste bytes`

No merge gate was invoked from this worktree. The commit used `SKIP_GATE=1`. Nothing was pushed,
deleted, merged, or lifecycle-tagged. The user-supplied untracked `TASK.md` remains unchanged.

## Byte-level mechanism evidence

The user's 2026-07-25 cmux test established that the host accepts a complete OSC 52 sequence. The
old `Clipboard.copy` independently called `process.stdout.write` while OpenTUI owned the same stdout
stream.

The suspected splice did not reproduce on this Linux harness host: active and idle pre-fix emissions
were intact. Inspection corrected the reason for that negative result: OpenTUI 0.4.5 defaults its
native render thread on, but explicitly disables it on Linux. On a threaded host, renderer frames
use the native renderer output authority while the old JavaScript stdout call bypassed it, leaving
two independent writers and no ordering boundary.

The permanent `TerminalOutputAudit` scanner reconstructs CSI/OSC/control-string state and DEC 2026
depth from raw PTY output. Its negative fixture proves it detects an otherwise-valid OSC 52 sequence
spliced into an open CSI inside a synchronized frame. The real drives assert every emission:

| Copy surface | Active rendering | Idle renderer | Assertions per emission |
|---|---:|---:|---|
| Agent transcript | 5/5 | 5/5 | exact decoded selection, canonical base64, DEC 2026 depth 0, terminal parser ground state |
| Agent composer | 5/5 | 5/5 | exact decoded selection, canonical base64, DEC 2026 depth 0, terminal parser ground state |
| Terminal selection | 5/5 | 5/5 | exact decoded selection, canonical base64, DEC 2026 depth 0, terminal parser ground state |

Evidence log:
`/tmp/wt-osc52-smokes-rebased.97Tu7V/smoke-clipboard-frame-boundary-harness.log`

## Fix design

- `Clipboard.copy` constructs one complete `OSC 52 ; c ; base64 BEL` string and submits it through
  one configurable emitter. It no longer writes raw stdout.
- `Bootstrap.boot` binds that emitter to OpenTUI's renderer-owned `writeOut` path and releases the
  binding with the app lifetime. This bypasses OpenTUI's capability-gated clipboard helper because
  the verified host accepts OSC 52 without advertising it.
- Terminal selection, agent transcript selection, and agent composer selection already converged on
  `Clipboard.copy`; the fix is therefore one shared-generator change.
- Local clipboard tools and the internal in-app clipboard remain best-effort companions.
- The system and terminal contracts now establish `Clipboard emissions flush at frame boundaries`
  and cite the user host acceptance plus the active/idle byte drive.

## Paste-in addendum

OpenTUI's stream parser already retained bracketed-paste state correctly when the start marker,
payload, and end marker arrived in separate chunks. The old harness masked that fact by sending every
paste wrapper in one PTY write. The new fixture splits every byte of both markers and chunks payloads
at 997 bytes.

A real large-payload risk existed one layer lower: `OpenPty.write` called libc `write(2)` once and
discarded its returned byte count. It now advances through partial writes until the complete buffer
crosses the PTY, failing loudly if progress stops.

| Payload | Parser marker-edge fixture | Terminal real-PTY route | Agent composer route |
|---:|---:|---:|---:|
| 10 bytes | PASS exact one paste event | PASS visible exact payload | PASS focused composer with exact-size tail |
| 1 KB | PASS exact one paste event | PASS shell byte count | PASS focused composer with exact-size tail |
| 64 KB | PASS exact one paste event | PASS shell byte count | PASS focused composer with exact-size tail |

The permanent `smoke-paste-harness.ts` now uses the chunked sender. It also gives each large terminal
case a size-specific rendered sentinel so stale scrollback cannot satisfy the next wait.

Evidence log: `/tmp/wt-osc52-smokes-rebased.97Tu7V/smoke-paste-harness.log`

## Verification

All results below are from the final rebase onto `main` at `4cd1bd7`, unless explicitly described as
diagnostic history.

| Check | Result |
|---|---|
| `bun x tsc --noEmit` | PASS |
| `bun test` | PASS — 1070 tests, 0 failures, 14638 expectations, 129 files |
| invariant checker `--all` | PASS — every contract |
| invariant checker `--refs` | PASS — 568 annotations, 39 lattice links, 0 problems |
| `scripts/conventions-gate.sh` | PASS |
| `git diff --check` | PASS |
| Clipboard active/idle byte harness | PASS — all three surfaces, active 5/5 and idle 5/5 |
| Chunked paste harness | PASS — terminal and composer, 10 B / 1 KB / 64 KB |
| Registered PTY harness consumers | PASS — every one of 45 registered smokes |

Registered-consumer provenance:

- The final-rebase run passed smokes 1–42, including paste and clipboard boundary.
- `settings-applied` was then externally killed with exit 137. The cause was proven: another
  worktree started `merge-gate.sh`, whose global pre-gate hygiene sent `kill -9` to all
  `/tmp/tui-*` app processes. After that external gate finished and the machine was quiet,
  `settings-applied` passed in 35 seconds and `shortcut-help` passed.
- `search-mouse` exposed a pre-existing sample-without-wait race: it waited for result text, then
  sampled selection background from an intermediate frame. Its named grid condition now also waits
  for the distinct background it asserts; the corrected smoke passed 5/5.
- Before `main` advanced and forced the final rebase, an uninterrupted quiet-machine registry run
  also passed 45/45 in 150 seconds. It is diagnostic history, not the claimed final-base clearance.

Final-rebase logs:

- `/tmp/wt-osc52-smokes-rebased.97Tu7V/` — registered smokes 1–42
- `/tmp/wt-osc52-interrupted-smokes.iflToK/` — quiet reruns for settings and shortcut help
- `/tmp/wt-osc52-search-mouse-{1..5}.log` — corrected search-mouse 5/5

The final branch is exactly one commit above `main`; `git merge-base HEAD main` equals
`4cd1bd70a0b45964fb218670822c7e146209cfee`.
