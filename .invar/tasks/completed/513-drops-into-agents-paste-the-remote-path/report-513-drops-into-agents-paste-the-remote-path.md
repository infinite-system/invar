## In plain words

Invar opened a dropped file even when a terminal or agent was waiting for its path. I changed the drop route so the focused child gets a safe path paste, while the editor still opens the file when no child owns focus. Remote drops now upload first and give the child the remote copy's path.

## Result

READY at commit `7ab1b41cc664a7c09526384b2b8e38522750caaa` (`fix: paste dropped paths into focused child panes`).

- [PathDropController](../../../../src/modules/app/PathDropController.ts) now offers existing dropped paths to the focused pane before it opens them by kind.
- [PaneContent](../../../../src/modules/ui/PaneContent.interface.ts) declares the path-paste capability. The terminal and agent opt in. This keeps terminal and agent names out of application core.
- [BracketedPathPaste](../../../../src/modules/channel/BracketedPathPaste.ts) owns the one shell-quoted multi-path form. Local drops use real paths. `iv ssh` replaces them with uploaded dropzone paths before it sends the notification.
- [TerminalInstance](../../../../src/modules/terminal/TerminalInstance.ts) restores DEC 2004 markers when the child enabled bracketed paste. The bytes still cross `TerminalBackend.write` once.
- The local [paste smoke](../../../../scripts/harness/smoke-paste-harness.ts) covers terminal, agent, and editor routes. The [localhost-sshd smoke](../../../../scripts/harness/smoke-ssh-channel-harness.ts) covers exact remote paths and the close-during-upload race.

The worktree has no tracked changes. I preserved the pre-existing untracked [builder fundamentals file](../../../worktrees/513-drops-into-agents-paste-the-remote-path/BUILDER-FUNDAMENTALS.md).

## Variation protocol driven

I drove this adversarial protocol at the 10-line and 100,000-line scale fixtures. I read the live graph after every settled step.

1. I opened Settings through its visible gear. The graph showed `settingsPanel.open = true` and `panelHost.focused = false`. I dropped [TASK.md](../../../worktrees/513-drops-into-agents-paste-the-remote-path/TASK.md). Settings stayed open, and `workspaceSet.activeDocument.path` became the task-file path through open-by-kind.
2. I closed Settings and dropped [project.conventions.md](../../../../project.conventions.md) with the editor focused. The graph showed no focused panel and the new editor path.
3. I focused the terminal and dropped the task file plus [AGENTS.md](../../../../AGENTS.md). Both quoted paths appeared in the child. The graph showed `panelHost.focused = true`, kind `terminal`, and an unchanged editor document.
4. I sent two framed drops back to back: [project.invariants.md](../../../../project.invariants.md), then [project.architecture.md](../../../../project.architecture.md). Both appeared in the terminal. The graph still showed terminal focus and an unchanged editor document.
5. I selected the agent and repeated the multi-file and fast-double drops. The composer showed every path. The graph showed kind `agent` and an unchanged editor document after each variation.
6. On localhost ssh, I focused the remote terminal and dropped the small and 100,000-line files. The child compared its argument with the exact SHA-256 dropzone path. The graph showed terminal focus and no editor document after each drop.
7. I started a separate real channel upload and held it after its first stream-data frame. The graph first proved that the terminal owned focus. I closed the pane with `Control+J`, then the graph proved that the panel was hidden and unfocused while the upload was still held. I released the upload and sent its normal drop notification. The graph showed that the closed pane received nothing and the editor opened the uploaded dropzone file.

## Positive controls

- I disabled the focused-pane branch in [PathDropController](../../../../src/modules/app/PathDropController.ts). Its focused-path test failed with an empty paste list instead of the two quoted paths. I restored the branch.
- I bypassed the visible-and-focused guard in [Bootstrap](../../../../src/modules/app/Bootstrap.ts). The ssh race smoke failed because the hidden terminal consumed the notification and `workspaceSet.activeDocument.path` stayed null. I restored the guard, and the final smoke passed.

## Verification

- `bun run typecheck` — pass.
- `bun test src/modules/app/PathDropController.test.ts src/modules/channel/BracketedPathPaste.test.ts src/modules/terminal/TerminalInstance.test.ts scripts/harness/BracketedPasteInput.test.ts` — 26 pass, 0 fail, 75 expectations.
- `bun scripts/harness/smoke-paste-harness.ts` — `ALL-PASS`, including exact 10-byte, 1 KB, and 64 KB paste arms.
- `bun scripts/harness/smoke-ssh-channel-harness.ts` — `ALL-PASS`, including small, 100,000-line, exact dropzone-path, graph-state, and close-during-upload arms.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` — 1,388 annotations and 271 lattice links resolved, with 0 problems.
- `git diff --check` and Prettier checks — pass.

## Invariant review

- **Terminal bytes cross exactly one backend seam:** holds. `TerminalPaneContent.handlePaste` calls `TerminalInstance.pasteUserInput`, which calls the existing `sendUserInput` path and then one `backend.write`. The exact-byte test covers child mode on and off. I refined the existing record in [terminal.invariants.md](../../../../src/modules/terminal/terminal.invariants.md).
- **Focus owns the keystroke:** holds. The route reads live panel visibility and focus when the notification arrives. A hidden, closed, editor-focused, or dialog-focused pane cannot claim the drop.
- **Bracketed paste survives stream chunking:** refined. The record now generates focused terminal and agent path delivery, editor open-by-kind fallback, multi-file quoting, and remote dropzone delivery. I also refined its composition in [ui.lattice.md](../../../../src/modules/ui/ui.lattice.md).
- **Core carries no plugin vocabulary:** holds. Application core checks a declared pane capability. It does not branch on `terminal` or `agent` names.
- No invariant record was missing in the changed UI, terminal, keybinding, or channel domains.

## Bycatch

- One `Control+J` gesture did not reopen the terminal after I closed Settings and opened [project.conventions.md](../../../../project.conventions.md) in the first 10-line drive. The same gesture passed on the immediate retry and during the full 100,000-line protocol. I did not reproduce it a second time.

## Instrument feedback

- **EASY:** The warm DriveSession and live graph made the editor, terminal, agent, dialog, and scale variations direct to observe.
- **EASY:** The existing localhost-sshd harness accepted a gated `ChannelClient` upload without a second protocol implementation.
- **MISSING:** The worktree copy of [drive-pty/SKILL.md](../../../../.claude/skills/drive-pty/SKILL.md) does not contain the new `DRIVE ADVERSARIALLY` section. I followed the user's effective doctrine directly. Add that section to the tracked skill so a cold-start builder receives the same order.
- **MISSING:** DriveSession has no chainable framed-paste gesture. The variation drive had to call `driver.sendPaste` directly. Add `app.paste(text)` so framed paste can compose with graph waits like keys and clicks do.
