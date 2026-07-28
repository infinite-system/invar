# Terminal UX pack — READY

Tip: `ba57a82a423232fd531a6824ea215a211459003d`

Commit: `ba57a82 feat(terminal): add staged agent command UX`

The branch was fetched and rebased against `origin/main` before final verification; it was already
up to date. `TASK.md` remains the only untracked worktree file and was not committed.

## Feature summary

### A — staged execution and visible run

- Added one provider-neutral terminal-tool seam shared by the echo, Claude SDK, and Codex app-server
  paths.
- Ask mode registers only `stageTerminalCommand`; bypass mode also registers
  `runTerminalCommand`. The invocation path re-checks live permissions.
- Staging waits for an idle, empty real shell prompt, writes a fully sanitized command inside
  bracketed-paste markers, and never sends Enter. The user can edit the real readline buffer, press
  Enter, or reject with Ctrl+C.
- Running uses that same visible path and emits Enter only after the complete sanitized payload has
  been typed.
- User input wins: an occupied prompt queues the agent request with a transcript note, while user
  input during animation aborts it. The tool result reports that nothing executed.
- Transcript notes cover pending, staged, user-executed, user-edited-then-executed (with a `-`/`+`
  diff), agent-executed, rejected, and animation-aborted states.

### B — themed clean prompt

- Added generated bash and zsh rcfile shims. Each sources the user's normal dotfile first, then
  installs a minimal `$ ` prompt from the semantic `terminalPrompt` palette role.
- The shims emit OSC 7 cwd, OSC 0 `user@host:path`, and OSC 133 prompt-ready metadata.
- Added the mouse-editable `terminalCleanPrompt` setting, default `true`; `false` launches the
  interactive shell normally with its user dotfiles untouched.

### C — live terminal header

- The terminal header now derives `user@host:path` from emulator-owned OSC title/cwd metadata and
  updates after `cd`.
- It retains last-known structured metadata during long-running commands and falls back to a plain
  OSC 0 title when structured metadata has not been observed.

### D — animated agent typing

- Commands use weighted per-character cadence with jitter and punctuation/space pauses.
- `agentTypingSpeed` is mouse-editable and higher means faster.
- Long commands accelerate to a total delay cap of 1.5 seconds.
- `reducedMotion` is mouse-editable and selects the instant path from one setting read.
- Ctrl+C or other user input during animation closes bracketed paste, aborts the request, and never
  emits Enter.

## Tool descriptions (verbatim)

### `stageTerminalCommand`

Default courtesy for terminal work. Use stageTerminalCommand when a command should be visible for human review: Invar sanitizes the full command before writing any byte, waits until the terminal prompt is idle and its input buffer is empty, then types it into the real shell without Enter. The terminal header shows the cwd where it will run. The user may edit the real readline buffer, press Enter to execute, or press Ctrl+C to reject; Ctrl+C during animated typing aborts the staging. Prefer this tool unless the user has explicitly allowed autonomous execution.

### `runTerminalCommand`

Use runTerminalCommand only when the current allow/bypass permission mode authorizes autonomous execution. Invar uses the same visible, sanitized terminal pathway as staging, waits for an idle prompt and empty input buffer, types the command where the terminal header cwd says it will run, then sends Enter itself after the entire command is present. The user can press Ctrl+C during animated typing to abort before execution. In ask mode this tool is unavailable; use stageTerminalCommand so Enter remains the human grant.

## Sanitizer proof

`TerminalCommandController.request()` sanitizes the complete string before constructing or queuing a
request, so no PTY write occurs first. `TerminalCommandSanitizer` removes ANSI/OSC/CSI escape
sequences, then every C0/C1 control byte, including CR, LF, and tab.

The exact controller unit assertion is:

| Input | Exact PTY write before any human action |
|---|---|
| `printf one\nprintf two` | `ESC[200~printf oneprintf twoESC[201~` |

That byte string contains neither CR nor LF. The corresponding run test asserts the same complete
bracketed payload followed by one tool-owned CR.

The real-PTY injection drive stages a payload logically containing
`printf SAFE\ntouch <injection-proof-path>`. It condition-waits for the visible sanitized line
`printf SAFEtouch ...`, proves the newline is absent, and proves the target file does not exist.
Nothing executes until the separate human Enter drive.

Unit coverage also proves CRLF, lone CR, lone LF, embedded CSI color sequences, embedded OSC title
sequences, and remaining control bytes are stripped.

## Final run table

| Verification | Result |
|---|---|
| `git fetch origin main && git rebase origin/main` | PASS — already up to date |
| `pgrep -af '[m]erge-gate'` before harness drives | PASS — no merge gate running |
| `bunx tsc --noEmit` | PASS |
| `bun test` | PASS — 1,023 tests, 0 failures, 14,481 assertions |
| `bash scripts/conventions-gate.sh` | PASS |
| `check_invariants.mjs --all --refs` | PASS — 541 annotations, 39 links, 0 problems |
| `smoke-terminal-stage-harness.ts` | ALL-PASS — staged inertness, injection, run, queueing, animation, reduced motion, prompt, header |
| `smoke-settings-applied-harness.ts` | ALL-PASS — all 29 settings covered |
| `smoke-terminal-harness.ts` | ALL-PASS |
| `SHELL=/usr/bin/zsh smoke-terminal-harness.ts` | ALL-PASS |
| `smoke-agent-harness.ts` | ALL-PASS |
| `smoke-agent-pane-ux-harness.ts` | ALL-PASS |
| `smoke-agent-engine-switch-harness.ts` | ALL-PASS |
| `smoke-agent-permissions-harness.ts` | ALL-PASS |
| `smoke-agent-search-harness.ts` | ALL-PASS |

The new terminal-stage harness is registered in `scripts/merge-gate.sh`. Per task instruction, the
merge gate itself was not run.

## Task 2

Tip: `8d82c08520bdd2b3d11510a6a3fb68221414d99b`

Commits:

- `7536bcd test: target settings rows by visible label`
- `8d82c08 test: prove terminal settings change behavior`

### Navigation fix

The failure was reproduced before editing. Settings selection starts at descriptor index 0; the
workspace-tabs smoke sent 12 Down events, which now selected `showIndentGuides` at index 12 after
`reducedMotion` was inserted above the Editor section. `workspaceTabPosition` is index 13, so Right
toggled indent guides and the workspace strip remained horizontal.

Both the PTY harness and the tmux original now locate the rendered `Workspace tabs` label, click that
visible label, verify that its row is selected, and only then send Left or Right. They repeat the
label lookup on every panel open, so descriptor insertions and selection persistence cannot change
the target.

### Sweep findings

- All smoke scripts and harness ports that open Settings were swept. Workspace-tabs was the only
  positional settings-navigation assumption. Voice-picker already navigates by the
  `Narration voice` label; mode-coherence and editor only assert overlay open/close behavior.
- No smoke contains a hardcoded settings count. The tmux settings meta-gate enumerates
  `Settings.defaults`; the PTY settings harness derives and reports
  `schemaSettingNames.length`. The current derived schema count is 29.
- `agentTypingSpeed` and `terminalCleanPrompt` were registered as covered but their original drives
  used default values, so ignored settings could false-pass. The terminal-stage harness now compares
  10 versus 240 characters/s through real visible command typing and proves the fast setting
  completes materially sooner. It also proves `terminalCleanPrompt: false` preserves a seeded user
  `PS1`, complementing the existing enabled-path assertion for the generated themed `$` prompt.

### Task 2 run table

All smoke sequences began with zero `/tmp/tui-*` app processes and zero tmux sessions.

| Verification | Result |
|---|---|
| Pre-fix `smoke-workspace-tabs-harness.ts` | Reproduced — timed out waiting for the left-oriented strip |
| `smoke-workspace-tabs-harness.ts` | PASS 5/5 |
| `smoke-workspace-tabs.sh` tmux original | PASS 5/5 |
| `smoke-settings-applied-harness.ts` | PASS 5/5 — all 29 schema fields covered |
| `smoke-terminal-stage-harness.ts` | PASS 5/5 — slow/fast typing and themed/normal prompt counterfactuals green |
| `bunx tsc --noEmit` | PASS — `TSC=0` |
| `bun test` | PASS — 1,033 tests, 0 failures, 14,492 assertions |
| `bash scripts/conventions-gate.sh` | PASS |
| `check_invariants.mjs --all` | PASS |
| `check_invariants.mjs --refs` | PASS — 541 annotations, 39 links, 0 problems |
| `git diff --check` / `bash -n scripts/smoke-workspace-tabs.sh` | PASS |

Per task instruction, commits used `SKIP_GATE=1`; the merge gate was not run. `TASK2.md` remains
untracked and was not committed. No push, merge, branch deletion, or worktree removal was performed.
