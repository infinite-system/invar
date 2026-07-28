# TerminalObserver wave 1 — READY

## Delivery

- Branch: `feat-terminal-observer-wave1`
- Final base: `origin/main` at `249b5abe6c9c4ce3e943ce42a388b79d7fe8d1c1`
- Tip: `d07f86ccb6b2a1710c8321e3f199a2afb94cdaa0`
- Commit: `feat(terminal): observe bounded command completions`
- Ahead/behind at final verification: ahead 1, behind 0
- Working tree: no tracked changes; only the user task packets `TASK.md` and `TASK2.md` are untracked

The branch was rebased whenever `origin/main` advanced during the quiet-machine queue. Each rewritten
pre-rebase twin was retained under the repository's required lifecycle policy:

| Tag | Preserved commit |
|---|---|
| `orphaned/feat-terminal-observer-wave1-pre-rebase` | `b248f18599a5175d4f8bfde922fcf103157729b8` |
| `orphaned/feat-terminal-observer-wave1-pre-rebase-2` | `66117b7864264ac1874598b6cc727bfbb453a910` |
| `orphaned/feat-terminal-observer-wave1-pre-rebase-3` | `fc4c902ac468f58827fe5401f455d0b9989dc7b0` |

No merge gate was run for this branch. Nothing was pushed or deleted.

## OSC 133 parse design

`TerminalEmulator` remains the single VT parser and now turns OSC 133 markers into typed,
read-only semantic events:

| Marker | Event | Parsed state |
|---|---|---|
| `A` | `prompt-start` | cwd, logical current line, cursor column |
| `B` | `command-start` | cwd, logical prompt line, cursor column |
| `C` | `output-start` | exact logical command, cwd, current line, cursor column |
| `D[;status]` | `command-end` | numeric exit status when valid, otherwise `null`, plus cwd/current line/cursor |

The emulator records `lastShellIntegrationEvent`, tracks whether shell-integration markers have ever
been seen, and exposes unsubscribe-returning listeners for cell changes, logical linefeeds, and shell
events. Listener exceptions are isolated so an observation tap cannot stop terminal parsing. Wrapped
screen rows are reconstructed as logical command/output lines.

The Bash and Zsh rcfile shims emit the complete lifecycle. Bash uses `PS0` for `C` and
`PROMPT_COMMAND`/`PS1` for `D`, OSC 7, `A`, and `B`; Zsh uses `preexec`, `precmd`, and `PROMPT`.
Direct A/B/C/D fixtures, every-byte two-write chunk splits, and the recorded shim stream are all in
`TerminalEmulatorConformance.test.ts`.

## Observer contract

`TerminalObserver` is an honest plain stateful service (`Class = $Class`), not a reactive controller.
Only its monotonic `revision: Ref<number>` is reactive. It depends solely on emulator read/subscription
methods and has no backend, file descriptor, input, or PTY-write capability.

OSC `C → D` is the primary command boundary. If a terminal has emitted no integration markers, the
observer falls back to `$ command`/prompt-return heuristics; heuristic events always report
`exitCode: null` rather than guessing.

Each newest-last snapshot entry is:

```text
{
  kind: "command-completed",
  command,
  cwd,
  exitCode,
  durationMs,
  output: { headLines, tailLines, totalLines, truncated, byteCap },
  boundarySource: "osc133" | "heuristic",
  timestamp
}
```

Defaults live behind protected static getters: 20 head lines, 20 tail lines, an exact 8,192-byte
UTF-8 output cap, 100 events, and 256 KiB for the whole ring. Truncation is self-described. The
observer keeps bounded head/tail candidates while output arrives, then evicts oldest completed events
until both ring limits hold. It never waits for a reader and never blocks terminal parsing.

The provisional terminal contracts added are:

- `Observation never writes to the PTY`
- `Observation payloads are bounded and self describing`

Both resolve through the invariant checker and have executable absence/bounds evidence.

## Redaction evidence

Redaction occurs before command or output candidates enter the observer buffer.

| Input shape | Buffered result | Test |
|---|---|---|
| `Password: hunter2` | `[REDACTED]` | positive |
| `[sudo] password for dev: hunter2` | `[REDACTED]` | positive |
| `Enter passphrase for key '…': hunter2` | `[REDACTED]` | positive |
| `API_TOKEN=fixture-token` | `API_TOKEN=[REDACTED]` | positive |
| `export CLIENT_SECRET='fixture secret'` | `export CLIENT_SECRET=[REDACTED]` | positive |
| `SSH_KEY="fixture-key"` | `SSH_KEY=[REDACTED]` | positive |
| `DB_PASSWORD=hunter2` | `DB_PASSWORD=[REDACTED]` | positive |
| `NORMAL=value` | unchanged | negative |
| `MONKEY=banana` | unchanged | negative |
| `TOKEN_COUNT=2` | unchanged | negative |
| `KEYBOARD_LAYOUT=us` | unchanged | negative |
| `PASSCODE=value` | unchanged | negative |

A separate test proves secret-shaped assignments in the command field are also masked and absent
from the serialized snapshot.

## Recorded fixture provenance

`src/modules/terminal/fixtures/terminal-observer-recorded-bash.base64` was captured on 2026-07-25
through the real `PtyTestDriver` at 120×24 using `/bin/bash` plus `TerminalRcfile`, on the feature
branch then based on `origin/main` `bcad359`.

- cwd: `/tmp/invar-terminal-observer-fixture`
- temporary empty home
- `USER=fixture-user`
- `HOSTNAME=fixture-host`
- typed command: `printf 'alpha\n'; false; (exit 7)`

The captured bytes contain the real startup prompt, OSC 7 metadata, the A/B/C/D lifecycle, visible
`alpha` output, and exit status 7. The expected JSON pins the cells, cursor, cwd, and semantic marker
sequence. The same base64 stream drives the observer test process-free. The recorder and quiet-machine
recapture command are documented alongside the fixture.

## Final verification

All required instruments ran after the final rebase on the exact tip above:

| Instrument | Result |
|---|---|
| `/home/parallels/.bun/bin/bunx tsc --noEmit` | PASS |
| `/home/parallels/.bun/bin/bun test` | PASS — 1,187 tests, 0 failures, 15,336 expectations, 136 files |
| `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` | PASS — 589 annotations, 39 lattice links, 0 problems |
| `bun scripts/harness/smoke-terminal-harness.ts` | ALL-PASS — required 1/1 terminal harness |
| `git diff --check origin/main..HEAD` | PASS |
| final rebase audit | PASS — ahead 1, behind 0 |

The driven terminal run began with no merge gate and no other harness alive. A separate image-wave
worker had explicitly yielded the driven-smoke channel and was only polling for this READY file, so
no other verification activity overlapped the capture.

## TASK2 addendum

Wave 1 was already past the agent-read-tool seam when `TASK2.md` arrived. Per that addendum's explicit
instruction, this wave retains the spec's protected-getter 20-head/20-tail default and does not add
MCP/tool delivery. Wave 2 issue #53 must expose an agent read parameter for an explicit line count or
range reaching through retained emulator scrollback, and its tool description must teach the agent
both the default and the larger on-demand read.

MCP tools, observation modes, wake delivery, UI status, and rate policy otherwise remain intentionally
out of scope for wave 1.
