## In plain words

A failed reload killed the old app before the new app could start. Reload now keeps the old app alive until its replacement is ready.
MCP callers can also ask Invar to open a generated file with an exact line count.

## State

READY for #476 (reload survives failed boot; MCP gains size).

Commit: `934b771125b905ec150692ff16e90235fda0eb40`

The worktree is clean.

## What changed

- [DriveSession.ts](../../../../scripts/harness/DriveSession.ts) boots and readies the replacement before it changes the active session.
- Each boot candidate gets a unique status path. An old ready file cannot certify a new process.
- A failed candidate disposes any constructed driver and removes its owned temporary home.
- A successful reload switches the active session, then disposes the prior driver and removes its owned home.
- [InvarMcpServer.ts](../../../../scripts/harness/InvarMcpServer.ts) adds the positive integer `server_start.sizeLines` input.
- MCP passes `sizeLines` to the existing `DriveSession --size` fixture path.
- [DriveSession.test.ts](../../../../scripts/harness/DriveSession.test.ts) locks both reload arms and checks process lifetime.
- [InvarMcpServer.test.ts](../../../../scripts/harness/InvarMcpServer.test.ts) starts 10-line and 100,000-line fixtures through MCP.

## Driven evidence

The original code started app PID `2712933`. Reload then failed with `EACCES` while it recreated `.cache`.
A later real `Control+p` attach timed out against teardown output because PID `2712933` was already disposed.

The fixed code started app PID `2726025`. The same forced reload failure returned `EACCES`.
A real `Control+p` attach then opened Quick Open on the same PID `2726025`.

A normal reload started replacement PID `2730917`. PID `2726025` had exited before the reload response returned.

The MCP client observed exact document line counts at both scales:

- `sizeLines: 10` produced `lineCount: 10`.
- `sizeLines: 100000` produced `lineCount: 100000`.

## Positive controls

- I restored the dispose-first order temporarily. The reload test went red when the post-failure `Control+p` attach timed out.
- I removed the MCP `--size` forwarding temporarily. The MCP test went red with `Expected: 10` and `Received: 1`.
- I removed both planted defects. Both focused tests returned green.

## Invariants

The path scope is [the harness contract](../../../../scripts/harness/harness.invariants.md).
The brief also named [the system contract](../../../../src/modules/system/system.invariants.md).
Disposal and process lifetime also implicate [the project contract](../../../../project.invariants.md).

- [Harness app homes are complete and isolated](../../../../scripts/harness/harness.invariants.md#harness-app-homes-are-complete-and-isolated) is strengthened. Failed owned candidates now remove their temporary homes.
- [Harness waits observe conditions not frame ordinals](../../../../scripts/harness/harness.invariants.md#harness-waits-observe-conditions-not-frame-ordinals) is strengthened. Each candidate now waits on a new status file.
- [Observability never crashes the app](../../../../src/modules/system/system.invariants.md#observability-never-crashes-the-app) is upheld. The active app stayed live while its home was unwritable.
- [A referenced resource stays alive](../../../../project.invariants.md#a-referenced-resource-stays-alive) is upheld. Failed swaps retain the active driver, and successful swaps release the old driver.

The brief missed the named-wait record. Reusing `status.json` let the old app pre-satisfy the new app's readiness wait.

## Verification

- `bun test`: `2353` passed, `0` failed, `72,111` assertions across `353` files.
- `bunx tsc --noEmit`: exit `0`.
- `bash scripts/conventions-gate.sh`: PASS.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all`: exit `0`.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --refs`: `1,363` annotations resolved, `266` lattice links resolved, `0` problems.
- Prettier checked all four changed files.

I did not call the merge gate in the final pass. The repository pre-commit hook invoked it automatically during the commit, and it passed.

## PTY usability

The warm `--serve`, `--attach`, and `--reload` commands made both reload arms direct to drive.
The failed reload returned the exact `EACCES` path, and the next attach exposed whether real input still worked.

The `--stop` response did not end the server process in these headless runs. This is recorded below as bycatch.

## Bycatch

- Drive server stop liveness: `--stop` answered, removed its manifest, and ended the app PID. Server PIDs `2712919` and `2726006` still remained. This reproduced in two manual drives and two test attempts. I terminated only those task-owned server processes.
- Suspect failed-constructor resource leak: [PtyTestDriver.ts](../../../../scripts/harness/PtyTestDriver.ts) allocates `OpenPty` and `TerminalEmulator` before home directory creation can throw. An `EACCES` throw prevents the caller from receiving a driver to dispose. Inspection found this. I did not measure leaked descriptors.
- Contract gap: no harness record directly states that reload must preserve the active session until a replacement is ready. The regression test now promises this behavior, but the contract layer does not name it.
