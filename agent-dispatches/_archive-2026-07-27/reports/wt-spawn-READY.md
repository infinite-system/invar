# Processes.spawn seam — READY

## Tip

`6c21cfb15042d0dee1b67c4a3fd7404dc3888e30`

Branch `refactor-processes-spawn-seam` was rebased onto current `origin/main`
`ad5d21888f2cfedd582a3073005b6556ece3798d` before final verification.

## Files changed

- `src/modules/agent/CliStreamBackend.ts`
- `src/modules/agent/CodexAppServerBackend.ts`
- `src/modules/agent/CodexStreamBackend.ts`
- `src/modules/git/__tests__/GitRepository.test.ts`
- `src/modules/git/git.invariants.md`
- `src/modules/lsp/LspProcess.ts`
- `src/modules/narration/SystemTtsBackend.ts`
- `src/modules/narration/narration.invariants.md`
- `src/modules/system/Clipboard.ts`
- `src/modules/system/Processes.test.ts`
- `src/modules/system/Processes.ts`
- `src/modules/system/system.invariants.md`
- `src/modules/terminal/OpenPtyBackend.ts`

## Result

`Processes.spawn(argumentVector, options)` is the single low-level production seam for
shell-free external-tool launches. It always installs the hermetic environment after caller
options, so callers cannot override the stripping of ambient `GIT_*`. `Processes.run` now layers
capture and non-throwing result handling over `spawn`.

All production direct-launch consumers were migrated: clipboard probe/copy/paste, LSP, Claude CLI
streaming, Codex exec streaming, Codex app-server, and system TTS synthesis/playback.

`OpenPtyBackend` remains the documented exception. Its launch generator is intentionally different:
the interactive child inherits the complete user environment and attaches all three standard
streams to the PTY slave file descriptor.

## Sweep proof

Command:

```text
grep -rn "Bun.spawn" src/
```

Output:

```text
src/modules/terminal/OpenPtyBackend.ts:3:// decomposition is `openpty` via bun:ffi + `Bun.spawn` onto the slave fd. I/O rides node:fs (async
src/modules/terminal/OpenPtyBackend.ts:50:  private readonly child: ReturnType<typeof Bun.spawn>;
src/modules/terminal/OpenPtyBackend.ts:82:    this.child = Bun.spawn(command, {
src/modules/terminal/terminal.invariants.md:71:`OpenPtyBackend` imports `bun:ffi`/`node:fs`/`Bun.spawn`.
src/modules/system/Processes.ts:43:    return Bun.spawn(argumentVector, {
```

The hits are only the shared `Processes` launcher and the documented interactive PTY exemption.

## Environment-inheritance change risk by consumer

- `Processes.run` callers: no observable change; they already received the same hermetic
  environment. Their launch now delegates through the low-level seam.
- `Clipboard`: `which`, copy, and paste tools no longer receive ambient `GIT_*`. Clipboard tools do
  not normally consume Git context; behavior changes only for a custom wrapper that inspected those
  variables.
- `LspProcess`: language servers no longer receive ambient `GIT_*`. A server launched from a Git
  hook can no longer mistake the hook's repository/index/identity for the opened workspace. A
  custom server that intentionally read those variables would observe their absence.
- `CliStreamBackend` (Claude CLI): the Claude process no longer receives hook-provided
  `GIT_DIR`, `GIT_INDEX_FILE`, `GIT_AUTHOR_*`, `GIT_COMMITTER_*`, or other `GIT_*`. Agent tool calls
  now resolve Git context from their working directory/configuration instead of the parent hook.
- `CodexStreamBackend`: same intended change as Claude CLI; ambient hook Git repository and identity
  can no longer leak into `codex exec`.
- `CodexAppServerBackend`: same intended change for the long-lived `codex app-server`; its explicit
  workspace path remains unchanged.
- `SystemTtsBackend`: synth and player processes no longer receive ambient `GIT_*`. Normal audio
  engines do not consume Git context; only a custom engine/player wrapper that inspected those
  variables could observe a difference.
- `OpenPtyBackend`: no change. The interactive shell still receives the complete environment,
  including any `GIT_*`, by design.
- `GitRepository.test.ts`: test-only fixture setup now uses `Processes.run`; it retains its previous
  hermetic behavior and removes the sweep's non-production `spawnSync` false positive.

## Verification transcript

```text
$ /home/parallels/.bun/bin/bunx tsc --noEmit
[exit 0, no output]

$ /home/parallels/.bun/bin/bun test
bun test v1.3.14 (0d9b296a)
801 pass
0 fail
12751 expect() calls
Ran 801 tests across 103 files. [3.28s]

$ /home/parallels/.bun/bin/bun test src/modules/system/Processes.test.ts src/modules/git/__tests__/GitRepository.test.ts
bun test v1.3.14 (0d9b296a)
6 pass
0 fail
31 expect() calls
Ran 6 tests across 2 files. [97.00ms]

$ PATH=/home/parallels/.bun/bin:$PATH bash scripts/smoke-diagnostics.sh
PASS tsgo gutter, underline, and hover
PASS typescript-language-server gutter, underline, and hover
RESULT: ALL-PASS

$ PATH=/home/parallels/.bun/bin:$PATH bash scripts/smoke-agent-engine-switch.sh
PASS boot, Claude-to-Codex switch, context port, click switch, identity, and idle quiescence
PASS boot-as-Codex identity and reply
RESULT: ALL-PASS

$ PATH=/home/parallels/.bun/bin:$PATH bash scripts/smoke-audio-narration.sh
PASS narration unit tests
PASS narration-off drive
PASS narration-on drive and Escape barge-in
PASS idle quiescence
RESULT: ALL-PASS

$ node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs
PASS all canonical contracts
404 annotations resolved, 38 lattice links resolved, 0 problem(s)

$ PATH=/home/parallels/.bun/bin:$PATH bash scripts/conventions-gate.sh
conventions-gate: PASS

$ git diff --check
[exit 0, no output]
```

Per task instruction, `scripts/merge-gate.sh` was not run.
