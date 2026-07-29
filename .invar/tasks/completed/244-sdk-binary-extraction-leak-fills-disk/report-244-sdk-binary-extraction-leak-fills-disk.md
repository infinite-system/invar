# READY — #244 (stop the agent SDK extraction leak)

## Result

Commit `c691cb786ba29663049f1b3f770d8f4ec697d1f1` makes the Claude Agent SDK
runtime lazy. Invar now imports it only when `SdkStreamBackend.send` starts the
first real agent turn. Pane construction and visibility do not trigger it.

Invar also removes stale SDK extraction directories at boot and exit. The
cleanup covers only direct temporary-directory children with the SDK name
shape. It keeps directories younger than one hour and directories held by a
same-user live process. It removes nothing if the process census fails.

The worktree is clean.

## Diagnosis

The extraction trigger was module evaluation, not a process spawn during app
boot. The old call chain was:

`src/main.ts` imports `AppLoader` dynamically. `AppLoader` imports `Bootstrap`.
`Bootstrap.ts` imports `AgentFactory`. `AgentFactory.ts` imports
`SdkStreamBackend`. `SdkStreamBackend.ts` imported
`@anthropic-ai/claude-agent-sdk` as a runtime value. The SDK can extract its
bundled CLI while that import evaluates.

No backend `send` call or SDK child process ran on the boot path. The measured
zero-live-process census is therefore consistent with import-time extraction.
There was no eagerly spawned process whose death the app failed to report.
The original immediate-death premise was wrong.

The incident growth did not reproduce with the currently installed SDK
package and Bun state. A direct source import, a compiled import probe, a
default source boot, and a compiled app boot each changed the extraction
count from 0 to 0. A scratch worktree at base commit
`0b7c8dd4cf1bc17b577742de86159e67ba255a92` also changed the count from 0 to 0
for source and compiled boots. Thus, the requested scratch-tree positive
control did not grow the count. I did not manufacture that evidence.

The conductor's incident measurements still identify the old static import
as the trigger boundary. The fix removes that boundary even when the SDK
resumes extracting on import.

## Changes

- `SdkStreamBackend` now uses type-only SDK imports and one cached dynamic
  import inside the first `send` path.
- Cancellation and disposal remain safe while the dynamic import is pending.
- `SdkBinaryExtraction` performs the bounded, age-guarded, same-user process
  census and stale-directory cleanup.
- `Bootstrap` runs cleanup before renderer construction and after owned
  resources dispose.
- The registered PTY smoke isolates its temporary directory, proves its census
  can detect a planted SDK directory, proves boot removes a planted stale
  unheld directory, and proves a no-turn boot and exit add nothing.
- Agent and harness invariant records now state the first-turn import boundary
  and disk bound.
- Three task-local probes preserve the source-import, compiled-boot, and real
  first-use measurements.

## Driven evidence

Default source boot without an agent turn: 0 before, 0 after.

Compiled app boot without an agent turn: 0 before, 0 after boot, 0 after clean
`Control+q` exit. The app exited with code 0.

Small default drive and the shared 100,000-line scale drive both kept the
extraction count at 0 through boot and exit.

The permanent PTY smoke reported:

```text
PASS the SDK extraction census detects one planted matching directory
PASS app boot reaps the planted stale unheld SDK extraction
PASS unused-agent boot keeps the SDK extraction set unchanged: [] -> []
PASS the unused-agent app exits cleanly
PASS unused-agent exit keeps the SDK extraction set unchanged: [] -> []
smoke-sdk-extraction-harness: ALL-PASS
```

A compiled app completed a real first SDK turn. It answered
`SDK-FIRST-USE-OK`, owned zero hidden extraction directories in its isolated
temporary directory, and exited with code 0. Zero satisfies the at-most-one
bound and reflects the current SDK package state.

The unit-level lazy-load positive control went red after I temporarily called
the module loader from the constructor. The focused test then had 3 passes and
1 failure: expected module-load count 0, received 1. I removed the planted
defect.

The cleanup age-guard positive control also went red after I temporarily
removed the young-directory guard. The focused test then had 1 pass and 1
failure because it removed the young control directory. I removed the planted
defect.

## Verification

- `bunx tsc --noEmit`: exit 0.
- `bun test`: exit 0. 1,782 passed, 0 failed, 67,971 expectations across 269
  files.
- `bash scripts/conventions-gate.sh`: exit 0.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all`: exit 0.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --refs`: exit
  0. It resolved 998 annotations and 217 lattice links with 0 problems.
- `bun scripts/harness/smoke-sdk-extraction-harness.ts`: exit 0.

I did not run `scripts/merge-gate.sh`. [TASK.md](../../../../TASK.md) embargoes that gate until this
fix lands. The commit used the required `SKIP_GATE=1` bypass.

## Interim reaper

The interim loop is still live at PID `2441151`, as recorded in
`/tmp/sdk-reaper.pid`. I did not touch it. This fix replaces its purpose with
bounded app-owned cleanup. The conductor can now retire the loop after this
commit lands.

## Bycatch

None observed.

