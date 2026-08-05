## In plain words

Work stopped before the browser experiment was ready. The WIP commit contains a working Bun daemon path and an unverified Vue pane scaffold. It changes no existing `src/` behavior.

## Status

Parked as requested. Commit `ea1b7bd5` (`WIP: explore one Invar pane in a webview`) contains 23 new experiment files and 1,850 lines under the task folder.

## Built so far

- The [Bun daemon](../../../worktrees/507-experiment-one-pane-in-a-webview/.invar/tasks/in-progress/507-experiment-one-pane-in-a-webview/webview/WebviewDaemon.ts) exposes a WebSocket protocol for graph reads, Git commands, and terminal sessions.
- The daemon reused `GraphChannel`, `GitCommands`, and `OpenPtyBackend`. A live probe read `daemon.sessionCount = 0`, opened a real shell, sent `echo WEBVIEW_DAEMON_OK`, received the shell output, and closed the session.
- The daemon reported `65,191,936` RSS bytes with zero terminal sessions during that probe.
- The [browser capability layer](../../../worktrees/507-experiment-one-pane-in-a-webview/.invar/tasks/in-progress/507-experiment-one-pane-in-a-webview/webview/BrowserCapabilityStubs.ts) records 12 intended browser stubs and routes the terminal backend to the daemon.
- The [Vue pane scaffold](../../../worktrees/507-experiment-one-pane-in-a-webview/.invar/tasks/in-progress/507-experiment-one-pane-in-a-webview/webview/WebviewPane.vue) and [model boot](../../../worktrees/507-experiment-one-pane-in-a-webview/.invar/tasks/in-progress/507-experiment-one-pane-in-a-webview/webview/WebviewPaneApplication.ts) aim to reuse `WorkspaceSet`, `PanelHost`, `DefaultPlugins`, the editor model, and terminal scrollback.

## Learned so far

- `GraphChannel.resolve()` can serve read-only browser graph requests without adding a parallel graph implementation.
- A browser terminal can preserve the existing terminal seam: browser input reaches a remote `TerminalBackend`, while the Bun daemon owns `OpenPtyBackend` and the real PTY.
- Browser boot needs package-shaped shims for Bun-only imports and explicit substitutions for host capabilities. The exact build boundary remains unproven.

## Not completed

- The Vue page was not built or driven. The scaffold may contain type or runtime errors.
- The one-workspace and ten-workspace heap and RSS measurements were not run.
- The unchanged, stubbed, and excluded module counts were not verified from a browser bundle.
- Drag and drop, workspace tabs, pane tabs, terminal input, and Git transport were not tested in a browser.
- No post-change invariant, type, convention, or behavioral verification ran after the stop request.

## Bycatch

No unrelated product defect was confirmed. The pre-existing untracked [BUILDER-FUNDAMENTALS.md](../../../worktrees/507-experiment-one-pane-in-a-webview/BUILDER-FUNDAMENTALS.md) file remained untouched.

## Instrument feedback

The warm PTY driver made the CLI baseline and live graph discovery quick. Its suggested graph fields corrected an initial request for an unpublished `panelActiveSpaceKind` status field.
