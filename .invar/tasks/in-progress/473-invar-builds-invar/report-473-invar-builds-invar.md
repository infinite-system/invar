# READY — Invar builds Invar (#473)

## In plain words

Claude can now ask a small server to drive a live Invar window and read what Invar knows. I connected that server to the same real keyboard, mouse, screen, and graph paths that the shell driver already uses. A 10-line file and a 100,000-line file work through the same doorway, failed commands stop loudly, and a mirrored window follows pane resizes.

## Result

Commit: `f8a42a55772150c9b06f07c3f26ca70166740625` (`build the Invar drive MCP doorway (#473)`)

[InvarMcpServer.ts](../../../../scripts/harness/InvarMcpServer.ts) is a stdio MCP server with the eight tools from the [round-one brief](brief-473-1-invar-builds-invar.md): `drive_attach`, `graph_get`, `graph_await`, `graph_set`, `screen`, `server_start`, `server_reload`, and `server_stop`. The server calls the existing attach and `GraphClient` protocols. It does not add an input path around the PTY. The `graph_set` tool description says `EXPERIMENT ONLY, never verification`.

[DriveSession.ts](../../../../scripts/harness/DriveSession.ts) now supports labeled `app.show` output, generated `--size N` fixtures for one-shot and warm runs, loud attach exceptions, owned temporary-directory cleanup, and mirrored `SIGWINCH` forwarding. Its help now separates status-projection waits from live-graph waits. It also states that `bun run drive` stops its own one-shot app, while only a warm DriveSession server needs `--stop`.

[HarnessSmoke.ts](../../../../scripts/harness/HarnessSmoke.ts) now owns the one scale-fixture generator and the one real Quick Open gesture. [Drive.ts](../../../../scripts/harness/Drive.ts) and DriveSession both use those seams. This removes the prior duplicate fixture and file-open recipes.

The reported attach exit code of 0 did not reproduce at the starting commit. A failed CLI attach against a live server exited 1. I still removed the weaker process-global path: attach now throws the failed response, the CLI boundary exits 1, and the MCP boundary returns an MCP error. The regression runs that real process path.

The [drive-pty skill](../../../../.claude/skills/drive-pty/SKILL.md) now includes the Claude connection command:

```sh
claude mcp add --scope local invar-drive -- bun "$PWD/scripts/harness/InvarMcpServer.ts"
```

## Driven evidence

- The unchanged default drive settled at 120 by 40 before implementation.
- `bun run drive --size 10` opened `scale-10.txt` through Quick Open. The status bar showed 10 lines. The process exited 0.
- `bun run drive --size 100000` opened `scale-100000.txt` through the same path. The status bar showed 100,000 lines. The process exited 0.
- The scripted MCP client used the official stdio SDK at both scales. It read `workspaceSet.active.editor.document.lineCount`, opened the panel with real `Control+j` input, read a screen band, awaited a graph value, rejected a wrong graph path, rejected a failed snippet, reloaded the small server, and stopped both servers.
- The mirror test launched DriveSession inside a real host PTY at 100 by 30. Resizing that PTY to 140 by 45 changed the inner app's published width and height to the same values.

## Positive controls

- I removed the resize forwarding. The mirror test timed out after 30,000 ms while it waited for the inner app to reach 140 by 45. I restored the handler.
- I made attach return a failed response as success. The MCP test failed because `failedSnippetResult.isError` was undefined instead of true. I restored the throw.
- I made the scale generator omit its last row. The fixture test failed because `DRIVE-LINE-000003` was absent. I restored the full count.
- I suppressed the new `app.show` label. Its test failed because the `== settled checkpoint ==` heading was absent. I restored the label.

## Invariant verdicts

- [Harness input and output use the real PTY](../../../../scripts/harness/harness.invariants.md#harness-input-and-output-use-the-real-pty): upheld. MCP actions reach only the existing DriveSession verbs. The integration test sent `Control+p` and `Control+j` through the real PTY.
- [Graph observation reads and never mutates](../../../../src/modules/system/system.invariants.md#graph-observation-reads-and-never-mutates): upheld. `graph_get` and `graph_await` use `GraphClient`. Mutation remains the separate, explicit, experiment-only `graph_set` request.
- [Harness waits observe conditions not frame ordinals](../../../../scripts/harness/harness.invariants.md#harness-waits-observe-conditions-not-frame-ordinals): upheld. Server start, graph await, screen state, and resize checks wait for named manifests or state values.
- [Every wait names itself](../../../../scripts/harness/harness.invariants.md#every-wait-names-itself): upheld. A wrong graph path returns the existing loud miss with the missing path.
- [Harness app homes are complete and isolated](../../../../scripts/harness/harness.invariants.md#harness-app-homes-are-complete-and-isolated): strengthened. One-shot, reload, stop, and fixture teardown remove only directories that DriveSession created.
- [Seams are drawn at the shared generator](../../../../project.invariants.md#seams-are-drawn-at-the-shared-generator): strengthened. Drive and DriveSession now share fixture creation and the Quick Open gesture.
- [Shared seam changes verify every consumer](../../../../scripts/harness/harness.invariants.md#shared-seam-changes-verify-every-consumer): upheld. Structural search found all five fixture calls and all three Quick Open calls. The direct Drive arms and DriveSession MCP arms covered both consumers at 10 and 100,000 lines.

## Verification

- `bun test`: pass; 2,352 tests across 353 files, 0 failures, and 72,105 expectations.
- `bunx tsc --noEmit`: pass.
- `bash scripts/conventions-gate.sh`: pass. The gate reported the existing 20 legacy grammar findings and 0 findings in its 16-file enforced scan.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all`: pass; every contract passed.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --refs`: pass; 1,362 annotations and 266 lattice links resolved, with 0 problems.
- Focused harness and MCP tests: pass; 10 tests, 59 expectations, and 0 failures.
- `git diff --check`: pass.
- Worktree after commit: clean.
- I did not run `scripts/merge-gate.sh`, as required. The commit used `SKIP_GATE=1`.

## Bycatch

- Contract-layer gap: neither [system.invariants.md](../../../../src/modules/system/system.invariants.md) nor [project.invariants.md](../../../../project.invariants.md) states that the composition graph reaches every installed contributor. The [filed task](task-473-invar-builds-invar.md#pty-usability-feedback-from-builders-the-users-tracked-question) already marks this as a proposed record that needs the user. I did not author it in this implementation task.
- Contract-map gap: the brief names three records, but moving the shared fixture and Quick Open seams also invokes the harness records for condition waits, isolated homes, and shared-consumer verification. I reviewed those records and gave their verdicts above.
- Suspect reload failure state: [DriveSession.ts](../../../../scripts/harness/DriveSession.ts#L1048) disposes the active app before it boots the replacement. If the replacement boot fails, the server catches the error and keeps serving with the old, disposed session. I found this by inspection and did not force a boot failure. It is outside this MCP doorway change.
- No visual bycatch appeared in the repeated default, 10-line, or 100,000-line drives.

## PTY usability

- Easy: the warm server, named waits, and Quick Open gesture made the MCP round trips direct. The new `--size` option made scale parity one flag at both ends.
- Confusing: status-only fields and graph paths looked interchangeable because the help did not explain the split. The help and skill now name `waitForStatus` and `show` for the status projection, and `waitFor` and `get` for the live graph.
- Missing: MCP `server_start` accepts the requested optional workspace but no line count. An MCP-only caller must prepare a scale workspace, or start DriveSession with `--size`, before it can drive a generated large file.
